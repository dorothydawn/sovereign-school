import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Verifies the funnel's signature over the EXACT bytes that were sent.
 *
 * Always verify before parsing. If you parse first and verify the re-serialised
 * result, you are checking something other than what arrived — key order,
 * whitespace and number formatting all move — and a body that fails to parse
 * never gets checked at all.
 */
export function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  // Both sides must be the same length for timingSafeEqual, and its own length
  // check throws rather than returning false. Compare hashes of the two so the
  // comparison is constant-time even when an attacker controls the length.
  const a = createHmac('sha256', secret).update(expected).digest()
  const b = createHmac('sha256', secret).update(signature).digest()

  return timingSafeEqual(a, b)
}

/** Signs a body the way the funnel is expected to. Used in tests and by the docs. */
export function sign(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

/** A URL-safe random token. Used for claim links and sessions. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

let warnedAboutMissingSecret = false

/**
 * The key tokens are hashed with.
 *
 * The tokens themselves are 256 bits of randomness, so a leaked database is
 * already infeasible to turn back into working links. Keying the hash is
 * defence in depth rather than the thing standing between a leak and a
 * break-in — but it costs nothing, and docs/setup.md tells the buyer to set
 * SESSION_SECRET, so it had better be read somewhere.
 *
 * Changing it signs everybody out and invalidates unused claim and sign-in
 * links. That is the documented trade and the reason to set it once, at setup.
 */
function tokenSecret(): string {
  const secret = process.env['SESSION_SECRET']
  if (secret) return secret

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET is not set. Generate one with `openssl rand -hex 32` and add ' +
        'it to your environment variables. See docs/setup.md, step 4.',
    )
  }

  if (!warnedAboutMissingSecret) {
    warnedAboutMissingSecret = true
    console.warn('[auth] SESSION_SECRET is not set; using a development-only fallback.')
  }
  return 'development-only-session-secret'
}

/** Tokens are stored hashed, so a leaked database does not hand over live links. */
export function hashToken(token: string): string {
  return createHmac('sha256', tokenSecret()).update(token).digest('hex')
}
