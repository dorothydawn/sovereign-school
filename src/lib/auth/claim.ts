import type { SqlClient } from '@/lib/db/runner'
import { hashToken } from '@/lib/enrol/signature'
import { normaliseEmail } from '@/lib/enrol/payload'
import { createSession } from './session'

export type ClaimResult =
  | { ok: true; accountId: string; sessionToken: string; newAccount: boolean }
  /**
   * The purchase is attached to an account that already existed. Whoever is
   * holding this link has not proved they own that address, so they are sent to
   * sign in. Nothing is lost — the course is already on the account.
   */
  | { ok: false; reason: 'sign-in-required'; email: string | null }
  | { ok: false; reason: 'unknown' | 'already-used' | 'expired' }

/**
 * Turns a purchase into an account and signs the student in.
 *
 * This is the only route in for somebody who bought without an email address,
 * so it is the identity bridge rather than a convenience.
 */
export async function claim(
  db: SqlClient,
  token: string,
  /** The account the caller is already signed in as, if any. */
  currentAccountId?: string | undefined,
): Promise<ClaimResult> {
  const tokenHash = hashToken(token)

  // Marking the token used and reading it are one statement on purpose. Two
  // browser tabs, or a link opened twice, must not both succeed — and a check
  // followed by an update is exactly the read-then-write gap that produced
  // eight claim links in the enrol endpoint.
  const claimed = await db.rows<{ enrolment_id: string }>(
    `UPDATE claim_tokens
        SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING enrolment_id`,
    [tokenHash],
  )

  const row = claimed[0]
  if (!row) {
    // Say which it was, but only to the caller — the route decides what the
    // student sees, and "already used" is useful to them while "unknown" is not.
    const existing = await db.rows<{ used_at: string | null; expired: boolean }>(
      `SELECT used_at, (expires_at <= now()) AS expired
         FROM claim_tokens WHERE token_hash = $1`,
      [tokenHash],
    )
    const found = existing[0]
    if (!found) return { ok: false, reason: 'unknown' }
    return { ok: false, reason: found.used_at ? 'already-used' : 'expired' }
  }

  const enrolments = await db.rows<{
    email: string | null
    account_id: string | null
    created_account: boolean
  }>(`SELECT email, account_id, created_account FROM enrolments WHERE id = $1`, [
    row.enrolment_id,
  ])
  const enrolment = enrolments[0]
  if (!enrolment) throw new Error(`Claim token pointed at missing enrolment ${row.enrolment_id}`)

  // Attached at purchase when an email identified the student. A link for such
  // a purchase may only sign somebody in if this purchase is what created the
  // account — otherwise buying a course with another student's address would be
  // a way into their account, and the funnel hands the link to whoever paid.
  if (enrolment.account_id) {
    if (enrolment.created_account || enrolment.account_id === currentAccountId) {
      return {
        ok: true,
        accountId: enrolment.account_id,
        sessionToken: await createSession(db, enrolment.account_id),
        newAccount: enrolment.created_account,
      }
    }
    return { ok: false, reason: 'sign-in-required', email: enrolment.email }
  }

  let accountId = enrolment.account_id
  let newAccount = false

  if (!accountId) {
    if (enrolment.email) {
      // Buying a second course with the same address must land on the same
      // account, so everything they own is in one place. ON CONFLICT rather
      // than select-then-insert: two purchases can be claimed at once.
      const upserted = await db.rows<{ id: string; created: boolean }>(
        `INSERT INTO accounts (email) VALUES ($1)
         ON CONFLICT (email) DO UPDATE SET updated_at = now()
         RETURNING id, (xmax = 0) AS created`,
        [normaliseEmail(enrolment.email)],
      )
      const account = upserted[0]
      if (!account) throw new Error('Account upsert returned no row')
      accountId = account.id
      newAccount = account.created
    } else {
      // No email: an account that exists only behind this session until the
      // student adds a way to sign in again.
      const created = await db.rows<{ id: string }>(
        `INSERT INTO accounts DEFAULT VALUES RETURNING id`,
      )
      const account = created[0]
      if (!account) throw new Error('Account insert returned no row')
      accountId = account.id
      newAccount = true
    }

    await db.rows(`UPDATE enrolments SET account_id = $1, updated_at = now() WHERE id = $2`, [
      accountId,
      row.enrolment_id,
    ])
  }

  return {
    ok: true,
    accountId,
    sessionToken: await createSession(db, accountId),
    newAccount,
  }
}
