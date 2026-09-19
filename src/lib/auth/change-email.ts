import type { SqlClient } from '@/lib/db/runner'
import { normaliseEmail } from '@/lib/enrol/payload'

export type ChangeEmailResult =
  | { ok: true; accountId: string; from: string | null; to: string }
  | { ok: false; reason: string }

/**
 * Changes the address on a student's account.
 *
 * Buyers mistype their address at checkout, notice, and correct it — and the
 * platform receives whichever address was on the order when payment confirmed.
 * Without this, every typo is a support request the owner cannot resolve: the
 * student cannot sign in, and nobody can make them able to.
 *
 * Access follows the account, not the address, so enrolments are untouched and
 * nothing has to be re-sent. The address on each order is left as it was: it is
 * the record of what the funnel sent, and rewriting history to match a later
 * correction would make the two systems disagree about the same order.
 */
export async function changeAccountEmail(
  db: SqlClient,
  accountId: string,
  newEmail: string,
): Promise<ChangeEmailResult> {
  const email = normaliseEmail(newEmail)

  if (!email.includes('@') || email.length < 3) {
    return { ok: false, reason: 'That does not look like an email address.' }
  }

  const existing = await db.rows<{ id: string; email: string | null }>(
    `SELECT id, email FROM accounts WHERE id = $1`,
    [accountId],
  )
  const account = existing[0]
  if (!account) return { ok: false, reason: 'No such student.' }
  if (account.email === email) return { ok: false, reason: 'That is already their address.' }

  // Merging two accounts means deciding what happens to two sets of progress
  // and comments, which is a bigger decision than fixing a typo. Refuse and say
  // so, rather than silently picking one.
  const clash = await db.rows<{ id: string }>(
    `SELECT id FROM accounts WHERE email = $1 AND id <> $2`,
    [email, accountId],
  )
  if (clash.length > 0) {
    return {
      ok: false,
      reason:
        'Another student already uses that address. Two accounts cannot be merged ' +
        'from here — get in touch if that is what you need.',
    }
  }

  await db.rows(`UPDATE accounts SET email = $1, updated_at = now() WHERE id = $2`, [
    email,
    accountId,
  ])

  // Anything issued to the old address should stop working: whoever holds it
  // may be whoever received the mistyped mail.
  await db.rows(`DELETE FROM login_tokens WHERE account_id = $1 AND used_at IS NULL`, [
    accountId,
  ])

  return { ok: true, accountId, from: account.email, to: email }
}
