import type { SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'

/**
 * Estimating how much of Neon's free compute allowance has been used.
 *
 * Neon bills for the time the database is awake, and suspends a free project
 * when its monthly allowance runs out — with no warning, because spending
 * alerts are a paid-plan feature. So the owners least able to absorb an outage
 * are the ones who get no notice.
 *
 * The consumption API that reports real usage is also paid-plan only (it
 * returns 403 on free), so this measures the one thing we can see: how many
 * five-minute windows had any database activity in them. Neon sleeps after five
 * minutes idle, so distinct windows are a fair proxy for awake time.
 *
 * It is an estimate, it must be labelled as one, and it is tuned to warn early.
 * A false alarm costs a glance at a page; a missed one takes somebody's course
 * offline for weeks.
 *
 * See docs/decisions/never-fail-silently.md.
 */

/** Neon suspends a free project after this many compute-unit hours per month. */
export const FREE_CU_HOURS = 100

/** The smallest compute Neon runs, and where a course database sits nearly always. */
export const SMALLEST_COMPUTE_UNITS = 0.25

const BUCKET_MINUTES = 5

/**
 * The window this process last recorded, so repeated requests inside one
 * five-minute window cost nothing. Per-instance and therefore imperfect, which
 * is fine: the insert is idempotent and the miss rate only ever means one
 * harmless extra upsert.
 */
let lastRecordedBucket = -1

function currentBucket(now = Date.now()): number {
  return Math.floor(now / (BUCKET_MINUTES * 60 * 1000))
}

/**
 * Notes that the database was busy just now.
 *
 * One row per five-minute window, at most 8,928 a month. Cheap enough that
 * measuring costs far less than the thing it measures.
 */
export async function recordActivity(db: SqlClient): Promise<void> {
  const bucket = currentBucket()
  if (bucket === lastRecordedBucket) return

  await db.rows(
    `INSERT INTO db_activity (bucket)
     VALUES (to_timestamp(floor(extract(epoch FROM now()) / ($1 * 60)) * ($1 * 60)))
     ON CONFLICT (bucket) DO NOTHING`,
    [String(BUCKET_MINUTES)],
  )

  lastRecordedBucket = bucket
}

/** Test seam: forget what this process has already recorded. */
export function resetActivityCache(): void {
  lastRecordedBucket = -1
}

/**
 * Records that a warning has gone out, and says whether this was the first time.
 *
 * The insert is the claim: whoever wins gets true and sends the message, so two
 * simultaneous requests cannot both email the owner.
 */
export async function claimAlert(
  db: SqlClient,
  kind: string,
  threshold: number,
): Promise<boolean> {
  const rows = await db.rows<{ kind: string }>(
    `INSERT INTO alerts_sent (kind, threshold, month)
     VALUES ($1, $2, date_trunc('month', now())::date)
     ON CONFLICT (kind, threshold, month) DO NOTHING
     RETURNING kind`,
    [kind, threshold],
  )
  return rows.length > 0
}

export interface DatabaseUsage {
  /** Five-minute windows with activity, this calendar month. */
  activeBuckets: number
  /** Roughly how long the database has been awake, in hours. */
  awakeHours: number
  /** Estimated compute-unit hours against the free allowance. */
  estimatedCuHours: number
  /** Percentage of the free monthly allowance, rounded. */
  percentOfFree: number
  /** Always true here: Neon will not tell us the real figure on a free plan. */
  estimated: true
}

export async function databaseUsage(db: SqlClient): Promise<DatabaseUsage> {
  const rows = await db.rows<{ c: number }>(
    `SELECT count(*)::int AS c FROM db_activity
      WHERE bucket >= date_trunc('month', now())`,
  )

  const activeBuckets = rows[0]?.c ?? 0
  const awakeHours = (activeBuckets * BUCKET_MINUTES) / 60
  const estimatedCuHours = awakeHours * SMALLEST_COMPUTE_UNITS

  return {
    activeBuckets,
    awakeHours,
    estimatedCuHours,
    percentOfFree: Math.round((estimatedCuHours / FREE_CU_HOURS) * 100),
    estimated: true,
  }
}

/** Drops buckets from previous months. Keeps the table permanently small. */
export async function pruneActivity(db: SqlClient): Promise<void> {
  await db.rows(`DELETE FROM db_activity WHERE bucket < date_trunc('month', now())`)
}

/**
 * The highest warning threshold this month's usage has crossed, if any.
 *
 * Returns the threshold rather than a message so the caller can decide whether
 * it has already told the owner about this one.
 */
export async function databaseUsageWarning(
  db: SqlClient,
  config: CourseConfig,
): Promise<{ threshold: number; usage: DatabaseUsage } | null> {
  if (!config.alerts.watchDatabaseUsage) return null

  const usage = await databaseUsage(db)
  const crossed = [...config.alerts.thresholds]
    .sort((a, b) => b - a)
    .find((threshold) => usage.percentOfFree >= threshold)

  return crossed === undefined ? null : { threshold: crossed, usage }
}
