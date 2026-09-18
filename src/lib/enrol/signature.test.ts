import { describe, expect, it } from 'vitest'
import { hashToken, randomToken, sign, verifySignature } from './signature'

const SECRET = 'shared-secret-between-funnel-and-platform'
const BODY = '{"orderId":"ord_1","email":null,"productIds":["flagship-course"]}'

describe('verifying the funnel signature', () => {
  it('accepts a body signed with the shared secret', () => {
    expect(verifySignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true)
  })

  it('rejects a body that was altered after signing', () => {
    const signature = sign(BODY, SECRET)
    const tampered = BODY.replace('ord_1', 'ord_2')
    expect(verifySignature(tampered, signature, SECRET)).toBe(false)
  })

  it('rejects a signature made with a different secret', () => {
    expect(verifySignature(BODY, sign(BODY, 'some-other-secret'), SECRET)).toBe(false)
  })

  it('rejects a missing signature', () => {
    expect(verifySignature(BODY, null, SECRET)).toBe(false)
  })

  it('rejects an empty signature', () => {
    expect(verifySignature(BODY, '', SECRET)).toBe(false)
  })

  it('rejects everything when the secret is not configured', () => {
    // An unset FUNNEL_SHARED_SECRET must fail closed. Failing open would leave
    // the endpoint enrolling anybody who finds the URL.
    expect(verifySignature(BODY, sign(BODY, ''), '')).toBe(false)
  })

  it('does not throw on a signature of the wrong length', () => {
    // timingSafeEqual throws on mismatched lengths, and an attacker chooses the
    // length. A crash here is a 500 where a 401 belongs.
    expect(() => verifySignature(BODY, 'abc', SECRET)).not.toThrow()
    expect(verifySignature(BODY, 'abc', SECRET)).toBe(false)
  })

  it('rejects a signature that is valid for a different body', () => {
    const other = '{"orderId":"ord_99"}'
    expect(verifySignature(BODY, sign(other, SECRET), SECRET)).toBe(false)
  })

  it('is sensitive to whitespace, since it signs raw bytes', () => {
    // This is why the raw body must be verified before parsing: re-serialising
    // changes the bytes and the signature no longer matches.
    const reserialised = JSON.stringify(JSON.parse(BODY))
    const spaced = `${BODY} `
    expect(verifySignature(spaced, sign(BODY, SECRET), SECRET)).toBe(false)
    expect(verifySignature(reserialised, sign(BODY, SECRET), SECRET)).toBe(
      reserialised === BODY,
    )
  })
})

describe('tokens', () => {
  it('produces a different token every time', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => randomToken()))
    expect(tokens.size).toBe(100)
  })

  it('produces URL-safe tokens', () => {
    for (let i = 0; i < 20; i++) expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('hashes deterministically so a stored token can be looked up', () => {
    const token = randomToken()
    expect(hashToken(token)).toBe(hashToken(token))
    expect(hashToken(token)).not.toBe(token)
  })
})
