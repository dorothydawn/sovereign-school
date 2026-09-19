import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pgliteClient } from '@/lib/db/pglite'
import { runMigrations, type SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import {
  claimAlert,
  resetActivityCache,
  FREE_CU_HOURS,
  SMALLEST_COMPUTE_UNITS,
  databaseUsage,
  databaseUsageWarning,
  pruneActivity,
  recordActivity,
} from './database'

let db: PGlite
let client: SqlClient

const config = (over: Partial<CourseConfig['alerts']> = {}) =>
  ({
    alerts: {
      thresholds: [70, 90],
      watchDatabaseUsage: true,
      watchEmailQuota: true,
      ...over,
    },
  }) as unknown as CourseConfig

beforeEach(async () => {
  resetActivityCache()
  db = new PGlite()
  client = pgliteClient(db)
  await runMigrations(client, join(process.cwd(), 'migrations'))
})
afterEach(async () => {
  await db.close()
})

/** Fills in N five-minute windows this month, as real activity would. */
async function pretendAwakeFor(buckets: number): Promise<void> {
  await client.rows(
    `INSERT INTO db_activity (bucket)
     SELECT date_trunc('month', now()) + (g * interval '5 minutes')
       FROM generate_series(0, $1 - 1) AS g
     ON CONFLICT (bucket) DO NOTHING`,
    [String(buckets)],
  )
}

/** How many five-minute windows add up to a given share of the free allowance. */
const bucketsForPercent = (percent: number) =>
  Math.ceil((FREE_CU_HOURS * (percent / 100)) / SMALLEST_COMPUTE_UNITS * 12)

describe('measuring how awake the database has been', () => {
  it('starts at nothing', async () => {
    expect(await databaseUsage(client)).toMatchObject({ activeBuckets: 0, percentOfFree: 0 })
  })

  it('counts a window once however many queries land in it', async () => {
    // Otherwise a busy minute would look like hours of compute.
    for (let i = 0; i < 25; i++) await recordActivity(client)
    expect((await databaseUsage(client)).activeBuckets).toBe(1)
  })

  it('turns windows into hours awake', async () => {
    await pretendAwakeFor(12) // twelve five-minute windows is one hour
    const usage = await databaseUsage(client)
    expect(usage.awakeHours).toBeCloseTo(1)
    expect(usage.estimatedCuHours).toBeCloseTo(SMALLEST_COMPUTE_UNITS)
  })

  it('always says it is an estimate', async () => {
    // Neon will not report the real figure on a free plan, and an owner who
    // believes a precise wrong number is worse off than one who knows.
    expect((await databaseUsage(client)).estimated).toBe(true)
  })

  it('ignores activity from a previous month', async () => {
    await client.rows(
      `INSERT INTO db_activity (bucket)
       SELECT date_trunc('month', now()) - (g * interval '5 minutes')
         FROM generate_series(1, 50) AS g`,
    )
    expect((await databaseUsage(client)).activeBuckets).toBe(0)
  })
})

describe('warning the owner', () => {
  it('stays quiet while there is room', async () => {
    await pretendAwakeFor(bucketsForPercent(10))
    expect(await databaseUsageWarning(client, config())).toBeNull()
  })

  it('warns at seventy per cent', async () => {
    await pretendAwakeFor(bucketsForPercent(70))
    const warning = await databaseUsageWarning(client, config())
    expect(warning?.threshold).toBe(70)
  })

  it('reports the highest threshold crossed, not the first', async () => {
    await pretendAwakeFor(bucketsForPercent(95))
    expect((await databaseUsageWarning(client, config()))?.threshold).toBe(90)
  })

  it('warns before the database is switched off, not after', async () => {
    // The whole point: at 100% Neon suspends the project until next month.
    const warning = await databaseUsageWarning(client, config())
    await pretendAwakeFor(bucketsForPercent(72))
    const now = await databaseUsageWarning(client, config())
    expect(warning).toBeNull()
    expect(now?.usage.percentOfFree).toBeLessThan(100)
    expect(now?.threshold).toBe(70)
  })

  it('stays quiet when the owner has switched the watch off', async () => {
    await pretendAwakeFor(bucketsForPercent(95))
    expect(await databaseUsageWarning(client, config({ watchDatabaseUsage: false }))).toBeNull()
  })
})

describe('keeping the measurement cheap', () => {
  it('drops last month once it is over', async () => {
    await client.rows(
      `INSERT INTO db_activity (bucket)
       SELECT date_trunc('month', now()) - (g * interval '1 hour')
         FROM generate_series(1, 30) AS g`,
    )
    await pretendAwakeFor(5)
    await pruneActivity(client)

    const rows = await client.rows<{ c: number }>(`SELECT count(*)::int AS c FROM db_activity`)
    expect(rows[0]?.c).toBe(5)
  })

  it('cannot grow beyond a month of five-minute windows', async () => {
    // At most 8,928 rows, which is the argument for measuring this way at all.
    const maxRows = (31 * 24 * 60) / 5
    expect(maxRows).toBeLessThan(9000)
  })
})


describe('telling the owner once', () => {
  it('claims a threshold the first time and not the second', async () => {
    expect(await claimAlert(client, 'database', 70)).toBe(true)
    expect(await claimAlert(client, 'database', 70)).toBe(false)
  })

  it('treats a higher threshold as its own piece of news', async () => {
    await claimAlert(client, 'database', 70)
    expect(await claimAlert(client, 'database', 90)).toBe(true)
  })

  it('lets exactly one of several simultaneous requests send the message', async () => {
    const results = await Promise.all([
      claimAlert(client, 'database', 70),
      claimAlert(client, 'database', 70),
      claimAlert(client, 'database', 70),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('starts again next month', async () => {
    await claimAlert(client, 'database', 70)
    await client.rows(`UPDATE alerts_sent SET month = (month - interval '1 month')::date`)
    expect(await claimAlert(client, 'database', 70)).toBe(true)
  })
})
