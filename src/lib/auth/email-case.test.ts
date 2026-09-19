import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pgliteClient } from '@/lib/db/pglite'
import { runMigrations, type SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import { enrol } from '@/lib/enrol/enrol'
import { parseEnrolPayload } from '@/lib/enrol/payload'
import { claim } from './claim'
import { requestSignInLink, setPassword, signInWithPassword } from './signin'

let db: PGlite
let client: SqlClient

const config = {
  courses: [{ id: 'flagship', title: 'F', description: '', contentDir: 'f', videoHost: 'youtube' }],
  productToCourses: { 'flagship-course': ['flagship'] },
} as unknown as CourseConfig

const buy = (email: string | null, orderId = 'ord_1') => ({
  orderId,
  email,
  productIds: ['flagship-course'],
  amountMinorUnits: 29700,
  currency: 'usd',
  purchasedAt: '2026-09-18T12:00:00.000Z',
})

beforeEach(async () => {
  db = new PGlite()
  client = pgliteClient(db)
  await runMigrations(client, join(process.cwd(), 'migrations'))
})
afterEach(async () => {
  await db.close()
})

describe('an address that arrives with capitals in it', () => {
  it('can still be used to sign in', async () => {
    // Found live: the funnel sent Student@Example.com, the account stored it
    // verbatim, and sign-in normalised to lowercase and found nothing. The
    // student was told "if that address has an account, a link is on its way"
    // every single time. Locked out of something they had paid for, silently.
    const enrolled = await enrol(client, config, buy('Student@Example.com'))
    const claimed = await claim(client, enrolled.claimToken!)
    expect(claimed.ok).toBe(true)

    expect(await requestSignInLink(client, 'student@example.com')).not.toBeNull()
  })

  it('can still be used to sign in with a password', async () => {
    const enrolled = await enrol(client, config, buy('Student@Example.com'))
    const claimed = await claim(client, enrolled.claimToken!)
    if (!claimed.ok) throw new Error('claim failed')
    await setPassword(client, claimed.accountId, 'a long enough passphrase')

    const result = await signInWithPassword(
      client,
      'Student@Example.com',
      'a long enough passphrase',
    )
    expect(result.ok).toBe(true)
  })

  it('does not split one person across two accounts', async () => {
    // Two purchases, same person, different capitalisation. Their library must
    // not end up in two places they cannot both reach.
    const first = await enrol(client, config, buy('Student@Example.com', 'ord_1'))
    const second = await enrol(client, config, buy('student@example.com', 'ord_2'))

    expect(second.accountId).toBe(first.accountId)

    const accounts = await client.rows<{ c: number }>(
      `SELECT count(*)::int AS c FROM accounts`,
    )
    expect(accounts[0]?.c).toBe(1)
  })

  it('is normalised as soon as it is parsed', () => {
    const parsed = parseEnrolPayload({
      ...buy('  Student@Example.COM  '),
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.payload.email).toBe('student@example.com')
  })

  it('leaves a null email alone', () => {
    const parsed = parseEnrolPayload(buy(null))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.payload.email).toBeNull()
  })
})
