import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, destroySession } from '@/lib/auth/session'
import { isSameOrigin } from '@/lib/http/same-origin'
import { redirectTo } from '@/lib/http/redirect'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  // Second lock alongside the SameSite cookie. See lib/http/same-origin.
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 })


  const store = await cookies()
  // Delete the row, not just the cookie: a copied cookie would otherwise keep
  // working long after somebody thought they had signed out.
  await destroySession(getDb(), store.get(SESSION_COOKIE)?.value)

  const response = redirectTo(request, '/signin')
  response.cookies.delete(SESSION_COOKIE)
  return response
}
