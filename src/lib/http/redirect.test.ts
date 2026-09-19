import { describe, expect, it } from 'vitest'
import { redirectTo } from './redirect'

const request = (headers: Record<string, string>) =>
  new Request('http://localhost:3000/api/comments', { method: 'POST', headers })

describe('sending somebody back after a form post', () => {
  it('uses the host the browser actually addressed', () => {
    const response = redirectTo(request({ host: 'school.example' }), '/course/a/b')
    expect(response.headers.get('location')).toBe('https://school.example/course/a/b')
  })

  it('prefers X-Forwarded-Host, since a proxy rewrites Host', () => {
    const response = redirectTo(
      request({ host: 'internal.local', 'x-forwarded-host': 'school.example' }),
      '/',
    )
    expect(response.headers.get('location')).toBe('https://school.example/')
  })

  it('keeps http on a local machine rather than forcing https', () => {
    const response = redirectTo(
      request({ host: '127.0.0.1:3111', 'x-forwarded-proto': 'http' }),
      '/signin',
    )
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3111/signin')
  })

  it('never sends anybody to the placeholder in course.config.ts', () => {
    // The failure this exists to prevent: an owner who has not filled site.url
    // in would otherwise send every student to example.com after every form.
    const response = redirectTo(request({ host: 'school.example' }), '/')
    expect(response.headers.get('location')).not.toContain('example.com')
  })

  it('carries a query string through', () => {
    const response = redirectTo(request({ host: 'school.example' }), '/signin?problem=link')
    expect(response.headers.get('location')).toBe('https://school.example/signin?problem=link')
  })

  it('uses 303 so a refresh does not repost the form', () => {
    expect(redirectTo(request({ host: 'school.example' }), '/').status).toBe(303)
  })
})
