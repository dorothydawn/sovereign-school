import type { SqlClient } from '@/lib/db/runner'
import { hashToken, randomToken } from '@/lib/enrol/signature'
import { hashPassword, passwordProblem, verifyPassword } from './password'
import { createSession } from './session'

const LOGIN_TOKEN_TTL_MINUTES = 30
const ATTEMPT_WINDOW_MINUTES = 15
const MAX_ATTEMPTS_PER_WINDOW = 10

/**
 * scrypt on a password that does not exist, so a request for an unknown address
 * costs the same as one for a real account. Without this, response time alone
 * tells an attacker which of your students' addresses are registered.
 */
const DUMMY_HASH_PROMISE = hashPassword('a password nobody has')

export type SignInResult =
  | { ok: true; accountId: string; sessionToken: string }
  | { ok: false; reason: 'invalid' | 'rate-limited' }

async function recordAttempt(db: SqlClient, email: string): Promise<void> {
  await db.rows(`INSERT INTO sign_in_attempts (email) VALUES ($1)`, [email])
}

async function isRateLimited(db: SqlClient, email: string): Promise<boolean> {
  const rows = await db.rows<{ c: number }>(
    `SELECT count(*)::int AS c FROM sign_in_attempts
      WHERE email = $1 AND attempted_at > now() - ($2 || ' minutes')::interval`,
    [email, String(ATTEMPT_WINDOW_MINUTES)],
  )
  return (rows[0]?.c ?? 0) >= MAX_ATTEMPTS_PER_WINDOW
}

/** Removes attempt rows that no longer count, so the table stays small. */
export async function pruneSignInAttempts(db: SqlClient): Promise<void> {
  await db.rows(
    `DELETE FROM sign_in_attempts WHERE attempted_at <= now() - ($1 || ' minutes')::interval`,
    [String(ATTEMPT_WINDOW_MINUTES)],
  )
}

/**
 * Signs in with an email and password.
 *
 * Every failure returns the same `invalid`, whether the address is unknown or
 * the password is wrong. Telling them apart hands an attacker a list of which
 * of your students have accounts.
 */
export async function signInWithPassword(
  db: SqlClient,
  email: string,
  password: string,
): Promise<SignInResult> {
  const normalised = email.trim().toLowerCase()

  if (await isRateLimited(db, normalised)) return { ok: false, reason: 'rate-limited' }

  const rows = await db.rows<{ id: string; password_hash: string | null }>(
    `SELECT id, password_hash FROM accounts WHERE email = $1`,
    [normalised],
  )
  const account = rows[0]

  // Hash regardless, so an unknown address takes as long as a known one.
  const matched = account
    ? await verifyPassword(password, account.password_hash)
    : (await verifyPassword(password, await DUMMY_HASH_PROMISE), false)

  if (!account || !matched) {
    await recordAttempt(db, normalised)
    return { ok: false, reason: 'invalid' }
  }

  return { ok: true, accountId: account.id, sessionToken: await createSession(db, account.id) }
}

export type SetPasswordResult = { ok: true } | { ok: false; reason: string }

/** Sets or replaces a password for an account the caller is already signed into. */
export async function setPassword(
  db: SqlClient,
  accountId: string,
  password: string,
): Promise<SetPasswordResult> {
  const problem = passwordProblem(password)
  if (problem) return { ok: false, reason: problem }

  await db.rows(`UPDATE accounts SET password_hash = $1, updated_at = now() WHERE id = $2`, [
    await hashPassword(password),
    accountId,
  ])
  return { ok: true }
}

/**
 * Issues a sign-in link for an address, if it has an account.
 *
 * Returns the token when one was created. The caller emails it and tells the
 * visitor the same thing either way — that if the address has an account, a
 * link is on its way. Anything more specific is an account-existence oracle.
 */
export async function requestSignInLink(
  db: SqlClient,
  email: string,
): Promise<{ accountId: string; token: string } | null> {
  const normalised = email.trim().toLowerCase()

  const rows = await db.rows<{ id: string }>(`SELECT id FROM accounts WHERE email = $1`, [
    normalised,
  ])
  const account = rows[0]
  if (!account) return null

  // Clear a spent-but-unused token first, or its index entry blocks the new one
  // a student asking for a second link legitimately needs.
  await db.rows(
    `DELETE FROM login_tokens
      WHERE account_id = $1 AND used_at IS NULL AND expires_at <= now()`,
    [account.id],
  )

  const token = randomToken()
  const inserted = await db.rows<{ token_hash: string }>(
    `INSERT INTO login_tokens (token_hash, account_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval)
     ON CONFLICT (account_id) WHERE used_at IS NULL DO NOTHING
     RETURNING token_hash`,
    [hashToken(token), account.id, String(LOGIN_TOKEN_TTL_MINUTES)],
  )

  // Somebody already has a live link. Do not mint a second and invalidate the
  // one in their inbox — asking twice should not break the first email.
  if (inserted.length === 0) return null

  return { accountId: account.id, token }
}

/** Spends a sign-in link and returns a session. */
export async function signInWithLink(db: SqlClient, token: string): Promise<SignInResult> {
  // One statement, so two tabs cannot both succeed.
  const claimed = await db.rows<{ account_id: string }>(
    `UPDATE login_tokens SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING account_id`,
    [hashToken(token)],
  )

  const row = claimed[0]
  if (!row) return { ok: false, reason: 'invalid' }

  return {
    ok: true,
    accountId: row.account_id,
    sessionToken: await createSession(db, row.account_id),
  }
}
