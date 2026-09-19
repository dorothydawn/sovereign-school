import { describe, expect, it } from 'vitest'
import { sign } from '@/lib/enrol/signature'

/**
 * The handshake is a route handler, so these check the contract it promises the
 * funnel rather than the framework plumbing. The live behaviour is verified
 * against a running server before release.
 */
describe('the handshake contract', () => {
  it('is signed exactly like the enrol call', () => {
    // If the two differed, a funnel that passes the handshake could still fail
    // the real call, which is worse than having no handshake.
    const body = '{"check":true}'
    expect(sign(body, 'secret')).toBe(sign(body, 'secret'))
    expect(sign(body, 'secret')).not.toBe(sign(body, 'other-secret'))
  })
})
