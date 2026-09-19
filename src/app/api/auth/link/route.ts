import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { signInWithLink } from '@/lib/auth/signin'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session'
import { isSameOrigin } from '@/lib/http/same-origin'
import { redirectTo } from '@/lib/http/redirect'

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
  // Second lock alongside the SameSite cookie. See lib/http/same-origin.
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 })

  const form = await request.formData()
  const token = form.get('token')

  if (typeof token !== 'string' || token.length === 0) {
    return redirectTo(request, '/signin?problem=link')
  }

  const result = await signInWithLink(getDb(), token)
  if (!result.ok) {
    return redirectTo(request, '/signin?problem=link')
  }

  const response = redirectTo(request, '/')
  response.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions)
  return response
}
