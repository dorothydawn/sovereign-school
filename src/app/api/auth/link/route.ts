import { NextResponse } from 'next/server'
import courseConfig from '../../../../../course.config'
import { getDb } from '@/lib/db/client'
import { signInWithLink } from '@/lib/auth/signin'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * Spends a sign-in link.
 *
 * POST for the same reason the claim route is a POST: mail scanners and link
 * previews follow every URL in an email. A one-time link consumed by a GET is
 * spent before the student clicks it, and they are told it has already been
 * used — which is true, and infuriating.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData()
  const token = form.get('token')

  if (typeof token !== 'string' || token.length === 0) {
    return NextResponse.redirect(new URL('/signin?problem=link', courseConfig.site.url), 303)
  }

  const result = await signInWithLink(getDb(), token)
  if (!result.ok) {
    return NextResponse.redirect(new URL('/signin?problem=link', courseConfig.site.url), 303)
  }

  const response = NextResponse.redirect(new URL('/', courseConfig.site.url), 303)
  response.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions)
  return response
}
