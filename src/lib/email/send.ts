import type { SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import { resendSender } from './resend'
import { GMAIL_SMTP, smtpSender } from './smtp'
import type { EmailMessage, EmailSender, SendOutcome } from './types'

/**
 * Builds the sender the config asks for.
 *
 * Credentials come from environment variables, never from course.config.ts —
 * that file is committed, and a buyer will share their repository with an agent.
 */
export function senderFor(config: CourseConfig): EmailSender | { error: string } {
  const env = process.env

  switch (config.email.provider) {
    case 'resend': {
      const key = env['RESEND_API_KEY']
      if (!key) return { error: 'RESEND_API_KEY is not set. See docs/setup.md.' }
      return resendSender(key)
    }
    case 'gmail': {
      const user = env['GMAIL_USER']
      const pass = env['GMAIL_APP_PASSWORD']
      if (!user || !pass) {
        return {
          error:
            'GMAIL_USER and GMAIL_APP_PASSWORD must both be set. The app password is ' +
            'not your normal Gmail password — see docs/choosing-an-email-sender.md.',
        }
      }
      return smtpSender({ ...GMAIL_SMTP, user, pass }, 'gmail')
    }
    case 'ses':
    case 'smtp': {
      const host = env['SMTP_HOST']
      const port = Number(env['SMTP_PORT'] ?? '465')
      const user = env['SMTP_USER']
      const pass = env['SMTP_PASSWORD']
      if (!host || !user || !pass) {
        return { error: 'SMTP_HOST, SMTP_USER and SMTP_PASSWORD must all be set.' }
      }
      return smtpSender({ host, port, user, pass }, config.email.provider)
    }
  }
}

/** Counts what went out today, so the daily-cap warning has something to read. */
async function record(db: SqlClient, outcome: SendOutcome): Promise<void> {
  const column = outcome.ok ? 'sent' : 'failed'
  await db.rows(
    `INSERT INTO email_sends (day, ${column}) VALUES (current_date, 1)
     ON CONFLICT (day) DO UPDATE SET ${column} = email_sends.${column} + 1`,
  )
}

/** SendOutcome is a union, so this intersects rather than extends. */
export type SendResult = SendOutcome & {
  /** How many have gone out today after this one. */
  sentToday: number
}

/**
 * Sends one email and keeps the running total.
 *
 * Every free email tier caps at around 100 a day, and it is the daily cap rather
 * than the monthly one that breaks things: a launch puts hundreds of sign-in
 * requests into one evening. The count recorded here is what lets the platform
 * warn the owner before their students stop receiving links, rather than after.
 *
 * See docs/decisions/never-fail-silently.md.
 */
export async function sendEmail(
  db: SqlClient,
  config: CourseConfig,
  message: EmailMessage,
): Promise<SendResult> {
  const sender = senderFor(config)

  if ('error' in sender) {
    console.error(`[email] cannot send: ${sender.error}`)
    await record(db, { ok: false, error: sender.error, quotaExceeded: false })
    return { ok: false, error: sender.error, quotaExceeded: false, sentToday: await sentToday(db) }
  }

  const from = config.email.fromName
    ? `${config.email.fromName} <${config.email.from}>`
    : config.email.from

  const outcome = await sender.send(message, from)
  await record(db, outcome)

  if (!outcome.ok) {
    if (outcome.quotaExceeded) {
      // The owner's students are not receiving sign-in links right now. This is
      // the failure the product promises not to have silently.
      console.error(
        `[email] ${sender.name} has refused a send because a quota is spent. ` +
          `Students cannot receive sign-in links until it resets or the plan is ` +
          `raised. See docs/choosing-an-email-sender.md.`,
      )
    } else {
      console.error(`[email] ${sender.name} failed to send: ${outcome.error}`)
    }
  }

  return { ...outcome, sentToday: await sentToday(db) }
}

export async function sentToday(db: SqlClient): Promise<number> {
  const rows = await db.rows<{ sent: number }>(
    `SELECT sent FROM email_sends WHERE day = current_date`,
  )
  return rows[0]?.sent ?? 0
}

/** The daily ceiling of each provider's free tier, for the warning. */
export const FREE_TIER_DAILY_CAP: Record<string, number | null> = {
  gmail: 100,
  resend: 100,
  ses: null,
  smtp: null,
}

/**
 * Whether today's volume has crossed one of the configured warning thresholds.
 *
 * Returns the threshold crossed, so the caller can tell the owner once rather
 * than on every send.
 */
export async function dailyQuotaWarning(
  db: SqlClient,
  config: CourseConfig,
): Promise<{ threshold: number; sent: number; cap: number } | null> {
  if (!config.alerts.watchEmailQuota) return null

  const cap = FREE_TIER_DAILY_CAP[config.email.provider]
  if (!cap) return null

  const sent = await sentToday(db)
  const crossed = [...config.alerts.thresholds]
    .sort((a, b) => b - a)
    .find((threshold) => sent >= (cap * threshold) / 100)

  return crossed === undefined ? null : { threshold: crossed, sent, cap }
}
