import { describe, expect, it } from 'vitest'
import { isSameOrigin } from './same-origin'

const post = (headers: Record<string, string>) =>
  new Request('http://localhost:3000/api/comments', { method: 'POST', headers })

describe('deciding whether a POST came from our own pages', () => {
  it('accepts a form posted from the same site', () => {
    expect(
      isSameOrigin(post({ origin: 'https://school.example', host: 'school.example' })),
    ).toBe(true)
  })

  it('refuses one posted from somewhere else', () => {
    expect(
      isSameOrigin(post({ origin: 'https://evil.example', host: 'school.example' })),
    ).toBe(false)
  })

  it('refuses a different port on the same host', () => {
    expect(
      isSameOrigin(post({ origin: 'https://school.example:8443', host: 'school.example' })),
    ).toBe(false)
  })

  it('allows a request with no Origin at all', () => {
    // Browsers always send it on POST, so absence means a non-browser client —
    // not what CSRF describes, and rejecting it breaks the funnel.
    expect(isSameOrigin(post({ host: 'school.example' }))).toBe(true)
  })

  it('refuses a malformed Origin', () => {
    expect(isSameOrigin(post({ origin: 'not a url', host: 'school.example' }))).toBe(false)
  })

  it('trusts X-Forwarded-Host ahead of Host, because Vercel sets both', () => {
    expect(
      isSameOrigin(
        post({
          origin: 'https://school.example',
          host: 'internal-vercel-host.local',
          'x-forwarded-host': 'school.example',
        }),
      ),
    ).toBe(true)
  })

  it('does not compare the request URL, which Next rewrites to localhost', () => {
    // The first version of this compared new URL(request.url).origin and 403'd
    // every real request: Next reports http://localhost:3111 however the
    // browser addressed the site.
    expect(
      isSameOrigin(post({ origin: 'http://127.0.0.1:3111', host: '127.0.0.1:3111' })),
    ).toBe(true)
  })

  it('ignores the scheme, because a proxy forwards plain HTTP internally', () => {
    expect(
      isSameOrigin(post({ origin: 'https://school.example', host: 'school.example' })),
    ).toBe(true)
  })
})
