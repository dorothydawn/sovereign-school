import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pgliteClient } from '@/lib/db/pglite'
import { runMigrations, type SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import { enrol } from './enrol'
import { parseEnrolPayload, type EnrolPayload } from './payload'

let db: PGlite
let client: SqlClient

const config = {
  courses: [
    { id: 'flagship', title: 'F', description: '', contentDir: 'f', videoHost: 'youtube' },
    { id: 'bonus', title: 'B', description: '', contentDir: 'b', videoHost: 'youtube' },
  ],
  productToCourses: {
    'flagship-course': ['flagship'],
    bundle: ['flagship', 'bonus'],
    'broken-mapping': ['course-that-was-deleted'],
  },
} as unknown as CourseConfig

const payload = (over: Partial<EnrolPayload> = {}): EnrolPayload => ({
  orderId: 'ord_1',
  email: 'a@b.com',
  productIds: ['flagship-course'],
  amountMinorUnits: 29700,
  currency: 'usd',
  purchasedAt: '2026-09-18T12:00:00.000Z',
  ...over,
})

beforeEach(async () => {
  db = new PGlite()
  client = pgliteClient(db)
  await runMigrations(client, join(process.cwd(), 'migrations'))
})
afterEach(async () => {
  await db.close()
})

const count = async (table: string): Promise<number> => {
  const rows = await client.rows<{ c: number }>(`SELECT count(*)::int AS c FROM ${table}`)
  return rows[0]?.c ?? -1
}

describe('enrolling somebody who has already paid', () => {
  it('records the purchase, grants the course, and issues a claim link', async () => {
    const result = await enrol(client, config, payload())

    expect(result.duplicate).toBe(false)
    expect(result.grantedCourseIds).toEqual(['flagship'])
    expect(result.unmappedProductIds).toEqual([])
    expect(result.claimToken).toBeTruthy()
    expect(await count('enrolments')).toBe(1)
    expect(await count('course_access')).toBe(1)
  })

  it('stores the claim token hashed, never in the clear', async () => {
    // A leaked database should not hand over working links into the course.
    const result = await enrol(client, config, payload())
    const rows = await client.rows<{ token_hash: string }>('SELECT token_hash FROM claim_tokens')
    expect(rows[0]?.token_hash).not.toBe(result.claimToken)
  })

  it('grants every course in a bundle', async () => {
    const result = await enrol(client, config, payload({ productIds: ['bundle'] }))
    expect(result.grantedCourseIds.sort()).toEqual(['bonus', 'flagship'])
    expect(await count('course_access')).toBe(2)
  })

  it('accepts a purchase with no email address', async () => {
    // The funnel does not require one, so this is a normal purchase.
    const result = await enrol(client, config, payload({ email: null }))
    expect(result.duplicate).toBe(false)
    expect(result.claimToken).toBeTruthy()
  })
})

describe('the same purchase arriving more than once', () => {
  it('reports the repeat and does not enrol twice', async () => {
    await enrol(client, config, payload())
    const second = await enrol(client, config, payload())

    expect(second.duplicate).toBe(true)
    expect(await count('enrolments')).toBe(1)
    expect(await count('course_access')).toBe(1)
  })

  it('does not mint a second claim link', async () => {
    // The first link may already be in the customer's hands; a second would
    // quietly invalidate the one they are looking at.
    await enrol(client, config, payload())
    const second = await enrol(client, config, payload())

    expect(second.claimToken).toBeNull()
    expect(await count('claim_tokens')).toBe(1)
  })

  it('survives five deliveries in a row', async () => {
    for (let i = 0; i < 5; i++) await enrol(client, config, payload())
    expect(await count('enrolments')).toBe(1)
    expect(await count('claim_tokens')).toBe(1)
  })

  it('fills in an email that the first delivery did not have', async () => {
    await enrol(client, config, payload({ email: null }))
    await enrol(client, config, payload({ email: 'late@b.com' }))

    const rows = await client.rows<{ email: string }>('SELECT email FROM enrolments')
    expect(rows[0]?.email).toBe('late@b.com')
  })

  it('does not silently reinstate access that was revoked', async () => {
    // Restoring access after a refund is a deliberate act, not something a
    // retried webhook should do behind the owner's back.
    const first = await enrol(client, config, payload())
    await client.rows(
      `UPDATE course_access SET state = 'revoked', revoked_at = now() WHERE enrolment_id = $1`,
      [first.enrolmentId],
    )

    await enrol(client, config, payload())

    const rows = await client.rows<{ state: string }>('SELECT state FROM course_access')
    expect(rows[0]?.state).toBe('revoked')
  })
})

describe('a product the owner has not mapped to a course', () => {
  it('still records the purchase rather than rejecting it', async () => {
    // Somebody has been charged. Refusing leaves them with nothing.
    const result = await enrol(client, config, payload({ productIds: ['mystery-product'] }))

    expect(result.unmappedProductIds).toEqual(['mystery-product'])
    expect(result.grantedCourseIds).toEqual([])
    expect(await count('enrolments')).toBe(1)
  })

  it('keeps the unmapped product on the row so the owner can find it', async () => {
    await enrol(client, config, payload({ productIds: ['mystery-product'] }))
    const rows = await client.rows<{ unmapped_products: string[] }>(
      'SELECT unmapped_products FROM enrolments',
    )
    expect(rows[0]?.unmapped_products).toEqual(['mystery-product'])
  })

  it('treats a mapping pointing at a deleted course as unmapped', async () => {
    const result = await enrol(client, config, payload({ productIds: ['broken-mapping'] }))
    expect(result.unmappedProductIds).toEqual(['broken-mapping'])
    expect(result.grantedCourseIds).toEqual([])
  })

  it('grants what it can when a purchase mixes known and unknown products', async () => {
    const result = await enrol(
      client,
      config,
      payload({ productIds: ['flagship-course', 'mystery-product'] }),
    )
    expect(result.grantedCourseIds).toEqual(['flagship'])
    expect(result.unmappedProductIds).toEqual(['mystery-product'])
  })
})

describe('the database itself, not the application, enforces one live claim link', () => {
  // Found by firing 8 simultaneous deliveries of one order at a real server:
  // every request checked for an existing token, all found none, and all
  // inserted. Eight working links into one account. Checking before inserting
  // cannot fix this — only a constraint can.
  it('refuses a second unused claim token for the same enrolment', async () => {
    const first = await enrol(client, config, payload())

    await expect(
      client.rows(
        `INSERT INTO claim_tokens (token_hash, enrolment_id, expires_at)
         VALUES ('a-different-hash', $1, now() + interval '30 days')`,
        [first.enrolmentId],
      ),
    ).rejects.toThrow()
  })

  it('allows a new token once the previous one has been used', async () => {
    // A student who claimed and later needs a fresh link is a normal case.
    const first = await enrol(client, config, payload())
    await client.rows(`UPDATE claim_tokens SET used_at = now() WHERE enrolment_id = $1`, [
      first.enrolmentId,
    ])

    await expect(
      client.rows(
        `INSERT INTO claim_tokens (token_hash, enrolment_id, expires_at)
         VALUES ('a-second-hash', $1, now() + interval '30 days')`,
        [first.enrolmentId],
      ),
    ).resolves.toBeDefined()
  })
})

describe('what a customer paid', () => {
  it('is accepted and validated, so a broken funnel is still caught', async () => {
    const bad = parseEnrolPayload({
      ...payload(),
      amountMinorUnits: 'not a number',
    })
    expect(bad.ok).toBe(false)
  })

  it('is never written to the database', async () => {
    // This platform does not take money. The funnel and Stripe are the record
    // of what somebody paid, and a third copy here is data that could only ever
    // leak. See migration 0006.
    await enrol(client, config, payload())

    const columns = await client.rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'enrolments'`,
    )
    const names = columns.map((c) => c.column_name)
    expect(names).not.toContain('amount_minor_units')
    expect(names).not.toContain('currency')
  })

  it('holds nothing financial anywhere in the schema', async () => {
    const columns = await client.rows<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'`,
    )
    const financial = columns.filter((c) =>
      /amount|currency|price|cost|paid|charge/i.test(c.column_name),
    )
    expect(financial).toEqual([])
  })
})
