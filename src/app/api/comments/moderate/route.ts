import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import courseConfig from '../../../../../course.config'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, resolveSession } from '@/lib/auth/session'
import { isOwner } from '@/lib/auth/owner'
import { moderateComment } from '@/lib/comments/comments'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
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

  const from = form.get('from')
  const target = typeof from === 'string' && from.startsWith('/') ? from : '/owner'
  return NextResponse.redirect(new URL(target, courseConfig.site.url), 303)
}
