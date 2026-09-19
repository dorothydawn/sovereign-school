import type { SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import { sendEmail } from '@/lib/email/send'
import { claimAlert, databaseUsageWarning } from './database'

/**
 * Warns the owner that a free tier is running out, once per threshold per month.
 *
 * Called from the pages the owner and students already load, so there is no
 * scheduled job to set up — a buyer should not have to configure cron to find
 * out their site is about to switch off.
 *
 * Never throws: a failure to warn must not take down the page it was called
 * from. Worst case it is logged, which is still louder than Neon manages.
 */
export async function checkFreeTierCeilings(
  db: SqlClient,
  config: CourseConfig,
): Promise<void> {
  try {
    const warning = await databaseUsageWarning(db, config)
    if (!warning) return

    if (!(await claimAlert(db, 'database', warning.threshold))) return

    const { usage, threshold } = warning
    const message =
      `Your database has used roughly ${usage.percentOfFree}% of the free monthly ` +
      `allowance (about ${usage.estimatedCuHours.toFixed(1)} of 100 compute-hours).\n\n` +
      `If it reaches 100%, Neon suspends the database until next month and your ` +
      `course goes offline. Neon does not warn you about this on the free plan, ` +
      `which is why this email exists.\n\n` +
      `Upgrading takes one click and costs roughly $5-20 a month for a course ` +
      `platform. There is no monthly minimum, so a quiet month is a small bill.\n\n` +
      `This figure is an estimate. Neon does not report real usage on the free ` +
      `plan, so the platform measures how long the database stays awake and works ` +
      `backwards. It errs on the cautious side.\n\n` +
      `See docs/choosing-a-neon-plan.md.`

    console.error(`[usage] database at ~${usage.percentOfFree}% of the free allowance`)

    const to = config.alerts.notify ?? config.site.supportEmail
    await sendEmail(db, config, {
      to,
      subject: `Your course database is at ~${threshold}% of its free allowance`,
      text: message,
    })
  } catch (error) {
    // Deliberately swallowed. This runs inside page loads, and an alerting
    // failure must never be what takes the course offline.
    console.error('[usage] could not check free-tier ceilings', error)
  }
}
