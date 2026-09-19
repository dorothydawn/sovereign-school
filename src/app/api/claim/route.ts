import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { claim } from '@/lib/auth/claim'
import { SESSION_COOKIE, resolveSession, sessionCookieOptions } from '@/lib/auth/session'
import { isSameOrigin } from '@/lib/http/same-origin'
import { redirectTo } from '@/lib/http/redirect'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

/**
 * Consumes a claim token and signs the student in.
 *
 * POST, not GET: see the comment on the claim page. A single-use token must not
 * be spendable by a link preview.
 */
export async function POST(request: Request): Promise<Response> {
  // Second lock alongside the SameSite cookie. See lib/http/same-origin.
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 })

  const form = await request.formData()
  const token = form.get('token')

  if (typeof token !== 'string' || token.length === 0) {
    return redirectTo(request, '/claim/problem?reason=unknown')
  }

  const db = getDb()

  // If they are already signed in as the student this purchase belongs to, the
  // link works straight away — a repeat buyer should not be asked to prove an
  // address they are plainly already using.
  const store = await cookies()
  const existing = await resolveSession(db, store.get(SESSION_COOKIE)?.value)

  const result = await claim(db, token, existing?.accountId)

  if (!result.ok) {
    if (result.reason === 'sign-in-required') {
      // The course is already on their account. They just have to prove the
      // address, which stops somebody buying with another student's email and
      // walking into their account.
      return redirectTo(request, '/signin?added=1')
    }

    // 'already-used' is worth telling the student, because the fix is different:
    // they are probably already signed in, or signed in on another device.
    return redirectTo(request, `/claim/problem?reason=${result.reason}`)
  }

  // 303 so the browser follows with a GET and a refresh does not re-POST.
  const response = redirectTo(request, '/')
  response.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions)
  return response
}
