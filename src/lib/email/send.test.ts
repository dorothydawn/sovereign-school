import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pgliteClient } from '@/lib/db/pglite'
import { runMigrations, type SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import { dailyQuotaWarning, senderFor, sentToday } from './send'

let db: PGlite
let client: SqlClient

const config = (over: Record<string, unknown> = {}) =>
  ({
    email: { provider: 'gmail', from: 'hello@example.com' },
    alerts: { thresholds: [70, 90], watchDatabaseUsage: true, watchEmailQuota: true },
    ...over,
  }) as unknown as CourseConfig

beforeEach(async () => {
  db = new PGlite()
  client = pgliteClient(db)
  await runMigrations(client, join(process.cwd(), 'migrations'))
})
afterEach(async () => {
  await db.close()
  delete process.env['RESEND_API_KEY']
  delete process.env['GMAIL_USER']
  delete process.env['GMAIL_APP_PASSWORD']
})

async function pretendWeSent(count: number): Promise<void> {
  await client.rows(
    `INSERT INTO email_sends (day, sent) VALUES (current_date, $1)
     ON CONFLICT (day) DO UPDATE SET sent = $1`,
    [count],
  )
}

describe('choosing a provider from the config', () => {
  it('explains what is missing rather than failing obscurely', () => {
    const result = senderFor(config())
    expect(result).toHaveProperty('error')
    if (!('error' in result)) return
    // The owner is not a developer. "GMAIL_USER is not set" is useless to them
    // unless it says where to look.
    expect(result.error).toMatch(/GMAIL_USER/)
    expect(result.error).toMatch(/app password/i)
  })

  it('builds a Resend sender when its key is present', () => {
    process.env['RESEND_API_KEY'] = 'test-key'
    const result = senderFor(config({ email: { provider: 'resend', from: 'a@b.com' } }))
    expect(result).not.toHaveProperty('error')
  })

  it('builds a Gmail sender when both values are present', () => {
    process.env['GMAIL_USER'] = 'me@gmail.com'
    process.env['GMAIL_APP_PASSWORD'] = 'app-password'
    const result = senderFor(config())
    expect(result).not.toHaveProperty('error')
  })
})

describe('warning before the daily cap stops sign-in links arriving', () => {
  it('says nothing while volume is low', async () => {
    await pretendWeSent(10)
    expect(await dailyQuotaWarning(client, config())).toBeNull()
  })

  it('warns at 70 per cent of the cap', async () => {
    await pretendWeSent(70) // Gmail's free cap is 100 a day.
    const warning = await dailyQuotaWarning(client, config())
    expect(warning).toEqual({ threshold: 70, sent: 70, cap: 100 })
  })

  it('reports the highest threshold crossed, not the first', async () => {
    await pretendWeSent(95)
    expect((await dailyQuotaWarning(client, config()))?.threshold).toBe(90)
  })

  it('stays quiet when the owner has switched the watch off', async () => {
    await pretendWeSent(99)
    const off = config({
      alerts: { thresholds: [70, 90], watchDatabaseUsage: true, watchEmailQuota: false },
    })
    expect(await dailyQuotaWarning(client, off)).toBeNull()
  })

  it('stays quiet for a provider with no daily cap', async () => {
    await pretendWeSent(5000)
    const ses = config({ email: { provider: 'ses', from: 'a@b.com' } })
    expect(await dailyQuotaWarning(client, ses)).toBeNull()
  })

  it('counts from zero each day', async () => {
    await pretendWeSent(80)
    await client.rows(`UPDATE email_sends SET day = current_date - 1`)
    expect(await sentToday(client)).toBe(0)
    expect(await dailyQuotaWarning(client, config())).toBeNull()
  })
})
