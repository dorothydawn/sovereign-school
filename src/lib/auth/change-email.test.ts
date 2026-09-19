import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pgliteClient } from '@/lib/db/pglite'
import { runMigrations, type SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import { enrol } from '@/lib/enrol/enrol'
import { changeAccountEmail } from './change-email'
import { accessibleCourseIds } from './access'
import { requestSignInLink } from './signin'

let db: PGlite
let client: SqlClient

const config = {
  courses: [{ id: 'flagship', title: 'F', description: '', contentDir: 'f', videoHost: 'youtube' }],
  productToCourses: { main: ['flagship'] },
} as unknown as CourseConfig

const buy = (orderId: string, email: string) => ({
  orderId,
  email,
  productIds: ['main'],
  amountMinorUnits: 29700,
  currency: 'usd',
  purchasedAt: '2026-09-19T12:00:00.000Z',
})

beforeEach(async () => {
  db = new PGlite()
  client = pgliteClient(db)
  await runMigrations(client, join(process.cwd(), 'migrations'))
})
afterEach(async () => {
  await db.close()
})

describe('fixing an address the buyer mistyped', () => {
  it('lets them sign in afterwards', async () => {
    // The funnel sends whichever address was on the order when payment
    // confirmed. Without this, a typo is unfixable and the student is stranded.
    const order = await enrol(client, config, buy('o1', 'studnet@example.com'))
    expect(order.accountId).not.toBeNull()

    const result = await changeAccountEmail(client, order.accountId!, 'student@example.com')
    expect(result.ok).toBe(true)

    expect(await requestSignInLink(client, 'student@example.com')).not.toBeNull()
  })

  it('does not disturb what they bought', async () => {
    const order = await enrol(client, config, buy('o1', 'studnet@example.com'))
    await changeAccountEmail(client, order.accountId!, 'student@example.com')

    expect(await accessibleCourseIds(client, order.accountId!)).toEqual(['flagship'])
  })

  it('leaves the address on the order alone, as the record of what was sent', async () => {
    // Rewriting it would make this platform and the funnel disagree about the
    // same order.
    const order = await enrol(client, config, buy('o1', 'studnet@example.com'))
    await changeAccountEmail(client, order.accountId!, 'student@example.com')

    const rows = await client.rows<{ email: string }>(
      `SELECT email FROM enrolments WHERE order_id = 'o1'`,
    )
    expect(rows[0]?.email).toBe('studnet@example.com')
  })

  it('normalises whatever the owner types', async () => {
    const order = await enrol(client, config, buy('o1', 'studnet@example.com'))
    await changeAccountEmail(client, order.accountId!, '  Student@Example.COM ')

    const rows = await client.rows<{ email: string }>(`SELECT email FROM accounts`)
    expect(rows[0]?.email).toBe('student@example.com')
  })

  it('kills any sign-in link already sent to the old address', async () => {
    // Whoever received the mistyped mail must not keep a way in.
    const order = await enrol(client, config, buy('o1', 'studnet@example.com'))
    await requestSignInLink(client, 'studnet@example.com')
    await changeAccountEmail(client, order.accountId!, 'student@example.com')

    const rows = await client.rows<{ c: number }>(
      `SELECT count(*)::int AS c FROM login_tokens WHERE used_at IS NULL`,
    )
    expect(rows[0]?.c).toBe(0)
  })

  it('refuses an address another student already uses', async () => {
    const mine = await enrol(client, config, buy('o1', 'a@example.com'))
    await enrol(client, config, buy('o2', 'b@example.com'))

    const result = await changeAccountEmail(client, mine.accountId!, 'b@example.com')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/already uses/i)
  })

  it('refuses something that is not an address', async () => {
    const order = await enrol(client, config, buy('o1', 'a@example.com'))
    expect((await changeAccountEmail(client, order.accountId!, 'not-an-address')).ok).toBe(false)
  })
})
