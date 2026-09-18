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

/** Tokens are stored hashed, so a leaked database does not hand over live links. */
export function hashToken(token: string): string {
  return createHmac('sha256', 'token').update(token).digest('hex')
}
