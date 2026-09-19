import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, resolveSession } from '@/lib/auth/session'
import { isOwner } from '@/lib/auth/owner'
import { changeAccountEmail } from '@/lib/auth/change-email'
import { isSameOrigin } from '@/lib/http/same-origin'
import { redirectTo } from '@/lib/http/redirect'

export const dynamic = 'force-dynamic'

/** Owner-only: correct the address on a student's account. */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 })

  const store = await cookies()
  const db = getDb()

  const session = await resolveSession(db, store.get(SESSION_COOKIE)?.value)
  if (!session) return new NextResponse(null, { status: 401 })
  if (!(await isOwner(db, session.accountId))) return new NextResponse(null, { status: 403 })

  const form = await request.formData()
  const accountId = String(form.get('accountId') ?? '')
  const email = String(form.get('email') ?? '')

  if (!accountId || !email) return new NextResponse(null, { status: 400 })

  const result = await changeAccountEmail(db, accountId, email)

  return redirectTo(
    request,
    result.ok
      ? `/owner?changed=${encodeURIComponent(result.to)}`
      : `/owner?problem=${encodeURIComponent(result.reason)}`,
  )
}
