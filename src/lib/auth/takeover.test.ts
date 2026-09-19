import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pgliteClient } from '@/lib/db/pglite'
import { runMigrations, type SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import { enrol } from '@/lib/enrol/enrol'
import { claim } from './claim'
import { accessibleCourseIds } from './access'

let db: PGlite
let client: SqlClient

const config = {
  courses: [
    { id: 'flagship', title: 'F', description: '', contentDir: 'f', videoHost: 'youtube' },
    { id: 'bonus', title: 'B', description: '', contentDir: 'b', videoHost: 'youtube' },
  ],
  productToCourses: { main: ['flagship'], upsell: ['bonus'] },
} as unknown as CourseConfig

const buy = (orderId: string, email: string | null, product = 'main') => ({
  orderId,
  email,
  productIds: [product],
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

describe('buying with somebody else\'s email address', () => {
  it('does not hand the buyer that person\'s account', async () => {
    // The funnel shows the claim link to whoever paid. If a claim link can sign
    // you into an existing account, then anybody can take over any student's
    // account for the price of the cheapest course — no access to their inbox
    // needed. Verified against a running server before this test existed.
    const victimOrder = await enrol(client, config, buy('victim_1', 'victim@example.com'))
    const victim = await claim(client, victimOrder.claimToken!)
    if (!victim.ok) throw new Error('setup failed')

    const attackerOrder = await enrol(client, config, buy('attack_1', 'victim@example.com'))
    const attacker = await claim(client, attackerOrder.claimToken!)

    if (attacker.ok) {
      expect(attacker.accountId).not.toBe(victim.accountId)
    } else {
      expect(attacker.reason).toBe('sign-in-required')
    }
  })

  it('still records the purchase against that email', async () => {
    // The money was taken and the course belongs to whoever owns the address.
    // It must land in their account — they just have to prove the address.
    const victimOrder = await enrol(client, config, buy('victim_1', 'victim@example.com'))
    const victim = await claim(client, victimOrder.claimToken!)
    if (!victim.ok) throw new Error('setup failed')

    await enrol(client, config, buy('gift_1', 'victim@example.com', 'upsell'))

    expect((await accessibleCourseIds(client, victim.accountId)).sort()).toEqual([
      'bonus',
      'flagship',
    ])
  })
})

describe('a repeat buyer, which the funnel says is now a live case', () => {
  it('sees the second course without opening a second link', async () => {
    // They bought an upsell three minutes after the main product. They are
    // already inside the course; nobody checks their email again.
    const first = await enrol(client, config, buy('o1', 'buyer@example.com'))
    const signedIn = await claim(client, first.claimToken!)
    if (!signedIn.ok) throw new Error('setup failed')

    await enrol(client, config, buy('o2', 'buyer@example.com', 'upsell'))

    expect((await accessibleCourseIds(client, signedIn.accountId)).sort()).toEqual([
      'bonus',
      'flagship',
    ])
  })

  it('keeps both orders on one account, not two', async () => {
    await enrol(client, config, buy('o1', 'buyer@example.com'))
    await enrol(client, config, buy('o2', 'buyer@example.com', 'upsell'))

    const rows = await client.rows<{ c: number }>(
      `SELECT count(DISTINCT account_id)::int AS c FROM enrolments WHERE account_id IS NOT NULL`,
    )
    expect(rows[0]?.c).toBe(1)

    const accounts = await client.rows<{ c: number }>(
      `SELECT count(*)::int AS c FROM accounts`,
    )
    expect(accounts[0]?.c).toBe(1)
  })

  it('attaches the order at purchase, before anything is claimed', async () => {
    await enrol(client, config, buy('o1', 'buyer@example.com'))
    const rows = await client.rows<{ attached: boolean }>(
      `SELECT (account_id IS NOT NULL) AS attached FROM enrolments WHERE order_id = 'o1'`,
    )
    expect(rows[0]?.attached).toBe(true)
  })
})

describe('a buyer with no email, which other callers may still send', () => {
  it('gets their own account and is signed in by the claim link', async () => {
    const order = await enrol(client, config, buy('anon_1', null))
    const result = await claim(client, order.claimToken!)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(await accessibleCourseIds(client, result.accountId)).toEqual(['flagship'])
  })

  it('does not share an account with another anonymous buyer', async () => {
    const a = await claim(client, (await enrol(client, config, buy('anon_1', null))).claimToken!)
    const b = await claim(client, (await enrol(client, config, buy('anon_2', null))).claimToken!)
    if (!a.ok || !b.ok) throw new Error('setup failed')
    expect(a.accountId).not.toBe(b.accountId)
  })
})

describe('how long a claim link lasts', () => {
  const daysUntilExpiry = async (): Promise<number> => {
    const rows = await client.rows<{ d: number }>(
      `SELECT round(extract(epoch FROM (expires_at - now())) / 86400)::int AS d
         FROM claim_tokens ORDER BY created_at DESC LIMIT 1`,
    )
    return rows[0]?.d ?? -1
  }

  it('is short when they can sign in with their email instead', async () => {
    // A bearer token in an inbox should not live forever. It can be short
    // precisely because the account exists from the moment of purchase, so
    // email sign-in is available immediately.
    await enrol(client, config, buy('o1', 'buyer@example.com'))
    expect(await daysUntilExpiry()).toBe(7)
  })

  it('is long when the link is the only way in', async () => {
    // No email means no other door. Expiring it strands somebody who has paid.
    await enrol(client, config, buy('o1', null))
    expect(await daysUntilExpiry()).toBe(90)
  })
})
