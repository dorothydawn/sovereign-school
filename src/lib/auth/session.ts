import type { SqlClient } from '@/lib/db/runner'
import { hashToken, randomToken } from '@/lib/enrol/signature'

/** How long a student stays signed in. Long: this is a course, not a bank. */
const SESSION_TTL_DAYS = 90

export const SESSION_COOKIE = 'school_session'

export interface Session {
  accountId: string
}

/**
 * Issues a session and returns the token to put in the cookie.
 *
 * Only the hash is stored, so a leaked database does not hand over live
 * sessions.
 */
export async function createSession(db: SqlClient, accountId: string): Promise<string> {
  const token = randomToken()
  await db.rows(
    `INSERT INTO sessions (token_hash, account_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [hashToken(token), accountId, String(SESSION_TTL_DAYS)],
  )
  return token
}

/** Returns the session's account, or null if the token is unknown or expired. */
export async function resolveSession(db: SqlClient, token: string | undefined): Promise<Session | null> {
  if (!token) return null

  const rows = await db.rows<{ account_id: string }>(
    `SELECT account_id FROM sessions WHERE token_hash = $1 AND expires_at > now()`,
    [hashToken(token)],
  )

  const row = rows[0]
  return row ? { accountId: row.account_id } : null
}

export async function destroySession(db: SqlClient, token: string | undefined): Promise<void> {
  if (!token) return
  await db.rows(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)])
}

/** Removes expired sessions. Cheap, and keeps the table from growing forever. */
export async function pruneExpiredSessions(db: SqlClient): Promise<void> {
  await db.rows(`DELETE FROM sessions WHERE expires_at <= now()`)
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
} as const
