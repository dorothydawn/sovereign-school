import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import courseConfig from '../../../../../course.config'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, destroySession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function POST(): Promise<Response> {
  const store = await cookies()
  // Delete the row, not just the cookie: a copied cookie would otherwise keep
  // working long after somebody thought they had signed out.
  await destroySession(getDb(), store.get(SESSION_COOKIE)?.value)

  const response = NextResponse.redirect(new URL('/signin', courseConfig.site.url), 303)
  response.cookies.delete(SESSION_COOKIE)
  return response
}
