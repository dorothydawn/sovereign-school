import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pgliteClient } from '@/lib/db/pglite'
import { runMigrations, type SqlClient } from '@/lib/db/runner'
import { hashPassword, passwordProblem, verifyPassword } from './password'
import {
  requestSignInLink,
  setPassword,
  signInWithLink,
  signInWithPassword,
  pruneSignInAttempts,
} from './signin'
import { resolveSession } from './session'

let db: PGlite
let client: SqlClient

beforeEach(async () => {
  db = new PGlite()
  client = pgliteClient(db)
  await runMigrations(client, join(process.cwd(), 'migrations'))
})
afterEach(async () => {
  await db.close()
})

async function makeAccount(email: string | null): Promise<string> {
  const rows = await client.rows<{ id: string }>(
    `INSERT INTO accounts (email) VALUES ($1) RETURNING id`,
    [email],
  )
  return rows[0]!.id
}

describe('password hashing', () => {
  it('accepts the right password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
  })

  it('rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false)
  })

  it('produces a different hash each time, so equal passwords are not obvious', async () => {
    const a = await hashPassword('the same password')
    const b = await hashPassword('the same password')
    expect(a).not.toBe(b)
  })

  it('never stores the password itself', async () => {
    expect(await hashPassword('hunter2hunter2')).not.toContain('hunter2')
  })

  it('fails closed on a missing or corrupt hash rather than throwing', async () => {
    for (const bad of [null, '', 'not-a-hash', 'scrypt$x$y$z$q$r', 'bcrypt$1$2$3$4$5']) {
      expect(await verifyPassword('anything', bad)).toBe(false)
    }
  })

  it('asks for length rather than punctuation', () => {
    expect(passwordProblem('short')).toBeTruthy()
    expect(passwordProblem('a long enough passphrase')).toBeNull()
    expect(passwordProblem('x'.repeat(201))).toBeTruthy()
  })
})

describe('signing in with a password', () => {
  it('works, and returns a usable session', async () => {
    const id = await makeAccount('a@b.com')
    await setPassword(client, id, 'a long enough passphrase')

    const result = await signInWithPassword(client, 'a@b.com', 'a long enough passphrase')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(await resolveSession(client, result.sessionToken)).toEqual({ accountId: id })
  })

  it('ignores case and stray spaces in the address', async () => {
    const id = await makeAccount('a@b.com')
    await setPassword(client, id, 'a long enough passphrase')

    const result = await signInWithPassword(client, '  A@B.CoM ', 'a long enough passphrase')
    expect(result.ok).toBe(true)
  })

  it('gives the same answer for a wrong password and an unknown address', async () => {
    // Otherwise this endpoint tells an attacker which of your students exist.
    const id = await makeAccount('a@b.com')
    await setPassword(client, id, 'a long enough passphrase')

    const wrongPassword = await signInWithPassword(client, 'a@b.com', 'not the passphrase')
    const noSuchUser = await signInWithPassword(client, 'nobody@b.com', 'not the passphrase')

    expect(wrongPassword).toEqual(noSuchUser)
  })

  it('refuses an account that has no password set', async () => {
    // Buying without an email leaves an account with no credentials at all.
    await makeAccount('a@b.com')
    const result = await signInWithPassword(client, 'a@b.com', 'anything at all here')
    expect(result.ok).toBe(false)
  })

  it('stops guessing after ten tries', async () => {
    const id = await makeAccount('a@b.com')
    await setPassword(client, id, 'a long enough passphrase')

    for (let i = 0; i < 10; i++) {
      await signInWithPassword(client, 'a@b.com', `wrong guess number ${i}`)
    }

    const blocked = await signInWithPassword(client, 'a@b.com', 'a long enough passphrase')
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    // Even the correct password is refused while the window is open. That is the
    // point: an attacker must not be able to keep going.
    expect(blocked.reason).toBe('rate-limited')
  })

  it('rate-limits an unknown address too', async () => {
    // Limiting only real accounts would reveal which addresses are real.
    for (let i = 0; i < 10; i++) {
      await signInWithPassword(client, 'ghost@b.com', `guess ${i}`)
    }
    const result = await signInWithPassword(client, 'ghost@b.com', 'guess again')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('rate-limited')
  })

  it('lets somebody back in once the window has passed', async () => {
    const id = await makeAccount('a@b.com')
    await setPassword(client, id, 'a long enough passphrase')
    for (let i = 0; i < 10; i++) await signInWithPassword(client, 'a@b.com', 'wrong again here')

    await client.rows(`UPDATE sign_in_attempts SET attempted_at = now() - interval '1 hour'`)
    await pruneSignInAttempts(client)

    const result = await signInWithPassword(client, 'a@b.com', 'a long enough passphrase')
    expect(result.ok).toBe(true)
  })
})

describe('signing in with an emailed link', () => {
  it('works once', async () => {
    const id = await makeAccount('a@b.com')
    const issued = await requestSignInLink(client, 'a@b.com')
    expect(issued).not.toBeNull()

    const result = await signInWithLink(client, issued!.token)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.accountId).toBe(id)
  })

  it('cannot be used twice', async () => {
    await makeAccount('a@b.com')
    const issued = await requestSignInLink(client, 'a@b.com')
    await signInWithLink(client, issued!.token)

    expect((await signInWithLink(client, issued!.token)).ok).toBe(false)
  })

  it('refuses an expired link', async () => {
    await makeAccount('a@b.com')
    const issued = await requestSignInLink(client, 'a@b.com')
    await client.rows(`UPDATE login_tokens SET expires_at = now() - interval '1 minute'`)

    expect((await signInWithLink(client, issued!.token)).ok).toBe(false)
  })

  it('returns nothing for an address with no account', async () => {
    // The caller says the same thing either way; only it knows there was no send.
    expect(await requestSignInLink(client, 'nobody@b.com')).toBeNull()
  })

  it('does not invalidate the link already in somebody inbox when they ask again', async () => {
    await makeAccount('a@b.com')
    const first = await requestSignInLink(client, 'a@b.com')
    const second = await requestSignInLink(client, 'a@b.com')

    expect(second).toBeNull()
    expect((await signInWithLink(client, first!.token)).ok).toBe(true)
  })

  it('issues a fresh link once the previous one is spent', async () => {
    await makeAccount('a@b.com')
    const first = await requestSignInLink(client, 'a@b.com')
    await signInWithLink(client, first!.token)

    const second = await requestSignInLink(client, 'a@b.com')
    expect(second).not.toBeNull()
    expect((await signInWithLink(client, second!.token)).ok).toBe(true)
  })

  it('stores the link hashed', async () => {
    await makeAccount('a@b.com')
    const issued = await requestSignInLink(client, 'a@b.com')
    const rows = await client.rows<{ token_hash: string }>('SELECT token_hash FROM login_tokens')
    expect(rows[0]?.token_hash).not.toBe(issued!.token)
  })
})
