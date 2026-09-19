import { describe, expect, it } from 'vitest'
import { safeRedirectPath } from './safe-redirect'

const SITE = 'https://mysite.example'

describe('deciding where a form is allowed to send somebody', () => {
  it('allows an ordinary path on this site', () => {
    expect(safeRedirectPath('/course/flagship/welcome', SITE, '/owner')).toBe(
      '/course/flagship/welcome',
    )
  })

  it('refuses a protocol-relative path', () => {
    // "//evil.example" starts with "/" and passes a naive check, but
    // new URL() resolves it to a different host entirely.
    expect(safeRedirectPath('//evil.example', SITE, '/owner')).toBe('/owner')
  })

  it('refuses a backslash-smuggled host', () => {
    // Browsers and URL() treat "/\" like "//".
    expect(safeRedirectPath('/\\evil.example', SITE, '/owner')).toBe('/owner')
  })

  it('refuses an absolute URL to another site', () => {
    expect(safeRedirectPath('https://evil.example/x', SITE, '/owner')).toBe('/owner')
  })

  it('refuses a javascript: target', () => {
    expect(safeRedirectPath('javascript:alert(1)', SITE, '/owner')).toBe('/owner')
  })

  it('refuses anything that is not a string', () => {
    for (const bad of [null, undefined, 42, {}]) {
      expect(safeRedirectPath(bad, SITE, '/owner')).toBe('/owner')
    }
  })

  it('keeps a query string and fragment', () => {
    expect(safeRedirectPath('/course/a/b?x=1#comments', SITE, '/owner')).toBe(
      '/course/a/b?x=1#comments',
    )
  })

  it('never returns something that resolves off-site', () => {
    const attempts = [
      '//evil.example',
      '/\\evil.example',
      '\\/evil.example',
      'https://evil.example',
      '//evil.example/../ok',
      '/%2f%2fevil.example',
    ]
    for (const attempt of attempts) {
      const result = safeRedirectPath(attempt, SITE, '/owner')
      expect(new URL(result, SITE).origin).toBe(new URL(SITE).origin)
    }
  })
})
