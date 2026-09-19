import { afterEach, describe, expect, it } from 'vitest'
import { hashToken } from './signature'

const original = process.env['SESSION_SECRET']

afterEach(() => {
  if (original === undefined) delete process.env['SESSION_SECRET']
  else process.env['SESSION_SECRET'] = original
})

describe('SESSION_SECRET', () => {
  it('actually changes how tokens are hashed', () => {
    // docs/setup.md tells the buyer to generate this and put it in Vercel. It
    // has to do something, or the instruction is a lie and they will assume
    // their sessions are protected by a secret that was never read.
    process.env['SESSION_SECRET'] = 'secret-one'
    const a = hashToken('the-same-token')

    process.env['SESSION_SECRET'] = 'secret-two'
    const b = hashToken('the-same-token')

    expect(a).not.toBe(b)
  })

  it('is stable for the same secret, so stored hashes still match', () => {
    process.env['SESSION_SECRET'] = 'secret-one'
    expect(hashToken('t')).toBe(hashToken('t'))
  })

  it('still works without one outside production, so tests need no setup', () => {
    delete process.env['SESSION_SECRET']
    expect(hashToken('t')).toMatch(/^[a-f0-9]{64}$/)
  })
})
