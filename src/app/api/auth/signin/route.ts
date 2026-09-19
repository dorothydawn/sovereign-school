import { NextResponse } from 'next/server'
import courseConfig from '../../../../../course.config'
import { getDb } from '@/lib/db/client'
import { signInWithPassword } from '@/lib/auth/signin'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session'
import { isSameOrigin } from '@/lib/http/same-origin'
import { redirectTo } from '@/lib/http/redirect'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  // Second lock alongside the SameSite cookie. See lib/http/same-origin.
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 })

  if (!courseConfig.auth.password) {
    return redirectTo(request, '/signin')
  }

  const form = await request.formData()
  const email = form.get('email')
  const password = form.get('password')

  if (typeof email !== 'string' || typeof password !== 'string') {
    return redirectTo(request, '/signin?problem=invalid')
  }

  const result = await signInWithPassword(getDb(), email, password)

  if (!result.ok) {
    // 'rate-limited' is worth distinguishing: the student may have the right
    // password and simply needs to wait, which is a different instruction.
    return redirectTo(request, `/signin?problem=${result.reason}`)
  }

  const response = redirectTo(request, '/')
  response.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions)
  return response
}
