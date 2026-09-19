import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import courseConfig from '../../../../../course.config'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, resolveSession } from '@/lib/auth/session'
import { isOwner } from '@/lib/auth/owner'
import { moderateComment } from '@/lib/comments/comments'
import { safeRedirectPath } from '@/lib/http/safe-redirect'
import { redirectTo } from '@/lib/http/redirect'
import { isSameOrigin } from '@/lib/http/same-origin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  // Second lock alongside the SameSite cookie. See lib/http/same-origin.
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 })

  const store = await cookies()
  const db = getDb()

  const session = await resolveSession(db, store.get(SESSION_COOKIE)?.value)
  if (!session) return new NextResponse(null, { status: 401 })

  // Checked here rather than trusted from the page that submitted the form.
  if (!(await isOwner(db, session.accountId))) return new NextResponse(null, { status: 403 })

  const form = await request.formData()
  const commentId = String(form.get('commentId') ?? '')
  const action = String(form.get('action') ?? '')

  if (!commentId || (action !== 'publish' && action !== 'remove')) {
    return new NextResponse(null, { status: 400 })
  }

  await moderateComment(db, commentId, action)

  // startsWith('/') is not enough: "//evil.example" passes it and resolves to
  // another host. safeRedirectPath keeps only same-origin targets, measured
  // against the host the browser actually used.
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const base = host ? `https://${host}` : courseConfig.site.url
  const target = safeRedirectPath(form.get('from'), base, '/owner')
  return redirectTo(request, target)
}
