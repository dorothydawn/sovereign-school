import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pgliteClient } from '@/lib/db/pglite'
import { runMigrations, type SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import { enrol } from '@/lib/enrol/enrol'
import type { EnrolPayload } from '@/lib/enrol/payload'
import { claim } from './claim'
import { resolveSession } from './session'
import { accessibleCourseIds, canAccessCourse } from './access'

let db: PGlite
let client: SqlClient

const config = {
  courses: [
    { id: 'flagship', title: 'F', description: '', contentDir: 'f', videoHost: 'youtube' },
    { id: 'bonus', title: 'B', description: '', contentDir: 'b', videoHost: 'youtube' },
  ],
  productToCourses: { 'flagship-course': ['flagship'], 'bonus-course': ['bonus'] },
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

describe('claiming a purchase', () => {
  it('creates an account and signs the student in', async () => {
    const enrolled = await enrol(client, config, payload())
    const result = await claim(client, enrolled.claimToken!)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.newAccount).toBe(true)
    expect(await resolveSession(client, result.sessionToken)).toEqual({
      accountId: result.accountId,
    })
  })

  it('works for a student who bought with no email address', async () => {
    // The whole reason the claim token exists.
    const enrolled = await enrol(client, config, payload({ email: null }))
    const result = await claim(client, enrolled.claimToken!)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(await accessibleCourseIds(client, result.accountId)).toEqual(['flagship'])
  })

  it('gives access to the course that was bought, and nothing else', async () => {
    const enrolled = await enrol(client, config, payload())
    const result = await claim(client, enrolled.claimToken!)
    if (!result.ok) return

    expect(await canAccessCourse(client, result.accountId, 'flagship')).toBe(true)
    expect(await canAccessCourse(client, result.accountId, 'bonus')).toBe(false)
  })

  it('refuses a token that has already been used', async () => {
    const enrolled = await enrol(client, config, payload())
    await claim(client, enrolled.claimToken!)

    const second = await claim(client, enrolled.claimToken!)
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.reason).toBe('already-used')
  })

  it('refuses a token nobody ever issued', async () => {
    const result = await claim(client, 'not-a-real-token')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unknown')
  })

  it('refuses an expired token, and says so', async () => {
    const enrolled = await enrol(client, config, payload())
    await client.rows(`UPDATE claim_tokens SET expires_at = now() - interval '1 day'`)

    const result = await claim(client, enrolled.claimToken!)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('expired')
  })

  it('creates exactly one account when the same link is opened twice at once', async () => {
    // Two browser tabs, or a link prefetched and then clicked. The update is a
    // single statement so only one caller can win.
    const enrolled = await enrol(client, config, payload())
    const results = await Promise.all([
      claim(client, enrolled.claimToken!),
      claim(client, enrolled.claimToken!),
    ])

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(await count('accounts')).toBe(1)
    expect(await count('sessions')).toBe(1)
  })
})

describe('buying more than one course', () => {
  it('puts both courses behind the same login', async () => {
    const first = await enrol(client, config, payload())
    const a = await claim(client, first.claimToken!)
    if (!a.ok) throw new Error('first claim should have succeeded')

    // The second purchase attaches to the same student at the moment it is
    // made, so it is there before any link is opened.
    await enrol(client, config, payload({ orderId: 'ord_2', productIds: ['bonus-course'] }))

    expect(await count('accounts')).toBe(1)
    expect((await accessibleCourseIds(client, a.accountId)).sort()).toEqual([
      'bonus',
      'flagship',
    ])
  })

  it('will not let the second link sign anybody in on its own', async () => {
    // The account already existed, so holding this link proves nothing about
    // owning the address. See takeover.test.ts.
    const first = await enrol(client, config, payload())
    await claim(client, first.claimToken!)
    const second = await enrol(
      client,
      config,
      payload({ orderId: 'ord_2', productIds: ['bonus-course'] }),
    )

    const result = await claim(client, second.claimToken!)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('sign-in-required')
  })

  it('does let the second link through for somebody already signed in as them', async () => {
    const first = await enrol(client, config, payload())
    const a = await claim(client, first.claimToken!)
    if (!a.ok) throw new Error('first claim should have succeeded')

    const second = await enrol(
      client,
      config,
      payload({ orderId: 'ord_2', productIds: ['bonus-course'] }),
    )
    const result = await claim(client, second.claimToken!, a.accountId)
    expect(result.ok).toBe(true)
  })

  it('keeps separate students separate', async () => {
    const mine = await enrol(client, config, payload())
    const theirs = await enrol(
      client,
      config,
      payload({ orderId: 'ord_2', email: 'other@b.com', productIds: ['bonus-course'] }),
    )

    const a = await claim(client, mine.claimToken!)
    const b = await claim(client, theirs.claimToken!)
    if (!a.ok || !b.ok) throw new Error('claims should have succeeded')

    expect(b.accountId).not.toBe(a.accountId)
    expect(await canAccessCourse(client, a.accountId, 'bonus')).toBe(false)
    expect(await canAccessCourse(client, b.accountId, 'flagship')).toBe(false)
  })

  it('does not merge two anonymous purchases into one account', async () => {
    // Both have no email. They are not the same person and must not share.
    const one = await enrol(client, config, payload({ email: null }))
    const two = await enrol(
      client,
      config,
      payload({ orderId: 'ord_2', email: null, productIds: ['bonus-course'] }),
    )

    const a = await claim(client, one.claimToken!)
    const b = await claim(client, two.claimToken!)
    if (!a.ok || !b.ok) throw new Error('claims should have succeeded')

    expect(b.accountId).not.toBe(a.accountId)
    expect(await count('accounts')).toBe(2)
  })
})

describe('revoked access', () => {
  it('disappears from the library without deleting the purchase', async () => {
    const enrolled = await enrol(client, config, payload())
    const result = await claim(client, enrolled.claimToken!)
    if (!result.ok) return

    await client.rows(`UPDATE course_access SET state = 'revoked', revoked_at = now()`)

    expect(await accessibleCourseIds(client, result.accountId)).toEqual([])
    expect(await canAccessCourse(client, result.accountId, 'flagship')).toBe(false)
    expect(await count('enrolments')).toBe(1)
  })
})

describe('sessions', () => {
  it('does not resolve an expired session', async () => {
    const enrolled = await enrol(client, config, payload())
    const result = await claim(client, enrolled.claimToken!)
    if (!result.ok) return

    await client.rows(`UPDATE sessions SET expires_at = now() - interval '1 second'`)
    expect(await resolveSession(client, result.sessionToken)).toBeNull()
  })

  it('does not resolve a made-up session token', async () => {
    expect(await resolveSession(client, 'nonsense')).toBeNull()
    expect(await resolveSession(client, undefined)).toBeNull()
  })

  it('stores the session hashed, not in the clear', async () => {
    const enrolled = await enrol(client, config, payload())
    const result = await claim(client, enrolled.claimToken!)
    if (!result.ok) return

    const rows = await client.rows<{ token_hash: string }>('SELECT token_hash FROM sessions')
    expect(rows[0]?.token_hash).not.toBe(result.sessionToken)
  })
})
