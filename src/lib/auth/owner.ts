import type { SqlClient } from '@/lib/db/runner'
import { normaliseEmail } from '@/lib/enrol/payload'

/**
 * Who owns this deployment.
 *
 * Derived from `OWNER_EMAIL` rather than a column, so changing it takes effect
 * at once and there is no way to be left with an owner row nobody can reach.
 * Unset means nobody is the owner — this fails closed, because the alternative
 * is a moderation queue open to whoever finds it.
 */
export function ownerEmail(): string | null {
  const raw = process.env['OWNER_EMAIL']
  return raw ? normaliseEmail(raw) : null
}

export async function isOwner(db: SqlClient, accountId: string): Promise<boolean> {
  const owner = ownerEmail()
  if (!owner) return false

  const rows = await db.rows<{ email: string | null }>(
    `SELECT email FROM accounts WHERE id = $1`,
    [accountId],
  )
  const email = rows[0]?.email
  return email !== null && email !== undefined && email === owner
}

/**
 * The owner has usually bought nothing, so no purchase ever created an account
 * for them. This makes one the first time they ask to sign in.
 *
 * It only ever fires for the exact address in `OWNER_EMAIL`, so it is not a
 * signup route by another name.
 */
export async function ensureOwnerAccount(db: SqlClient, email: string): Promise<void> {
  const owner = ownerEmail()
  if (!owner || normaliseEmail(email) !== owner) return

  await db.rows(
    `INSERT INTO accounts (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
    [owner],
  )
}
