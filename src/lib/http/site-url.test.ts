import { describe, expect, it } from 'vitest'
import { siteUrlFor } from './site-url'

const req = (headers: Record<string, string>) =>
  new Request('http://localhost:3000/api/enrol', { method: 'POST', headers })

const PLACEHOLDER = 'https://example.com'

describe('working out where the site actually is', () => {
  it('uses the host the caller reached', () => {
    expect(siteUrlFor(req({ host: 'school.example' }), PLACEHOLDER)).toBe('https://school.example')
  })

  it('prefers X-Forwarded-Host behind a proxy', () => {
    expect(
      siteUrlFor(req({ host: 'internal.local', 'x-forwarded-host': 'school.example' }), PLACEHOLDER),
    ).toBe('https://school.example')
  })

  it('keeps http locally', () => {
    expect(
      siteUrlFor(req({ host: '127.0.0.1:3111', 'x-forwarded-proto': 'http' }), PLACEHOLDER),
    ).toBe('http://127.0.0.1:3111')
  })

  it('never hands out the placeholder when a real host is available', () => {
    // A claim link built from an unedited site.url is a dead link sent to
    // somebody who has already paid.
    expect(siteUrlFor(req({ host: 'school.example' }), PLACEHOLDER)).not.toContain('example.com')
  })

  it('falls back to the configured url when there is no host at all', () => {
    expect(siteUrlFor(req({}), PLACEHOLDER)).toBe(PLACEHOLDER)
  })

  it('trims a trailing slash off the fallback, so links do not double up', () => {
    expect(siteUrlFor(req({}), 'https://school.example/')).toBe('https://school.example')
  })
})
