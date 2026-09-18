import { NextResponse } from 'next/server'
import courseConfig from '../../../../../course.config'
import { getDb } from '@/lib/db/client'
import { signInWithPassword } from '@/lib/auth/signin'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  if (!courseConfig.auth.password) {
    return NextResponse.redirect(new URL('/signin', courseConfig.site.url), 303)
  }

  const form = await request.formData()
  const email = form.get('email')
  const password = form.get('password')

  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.redirect(new URL('/signin?problem=invalid', courseConfig.site.url), 303)
  }

  const result = await signInWithPassword(getDb(), email, password)

  if (!result.ok) {
    // 'rate-limited' is worth distinguishing: the student may have the right
    // password and simply needs to wait, which is a different instruction.
    return NextResponse.redirect(
      new URL(`/signin?problem=${result.reason}`, courseConfig.site.url),
      303,
    )
  }

  const response = NextResponse.redirect(new URL('/', courseConfig.site.url), 303)
  response.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions)
  return response
}
