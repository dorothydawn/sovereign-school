import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import courseConfig from '../../../../course.config'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, resolveSession } from '@/lib/auth/session'
import { canAccessCourse } from '@/lib/auth/access'
import { deleteOwnComment, postComment } from '@/lib/comments/comments'
import { isSameOrigin } from '@/lib/http/same-origin'
import { redirectTo } from '@/lib/http/redirect'

export const dynamic = 'force-dynamic'

function back(
  request: Request,
  courseId: string,
  lessonId: string,
  problem?: string,
): Response {
  const suffix = problem ? `?comment=${encodeURIComponent(problem)}` : '#comments'
  return redirectTo(request, `/course/${courseId}/${lessonId}${suffix}`)
}

export async function POST(request: Request): Promise<Response> {
  // Second lock alongside the SameSite cookie. See lib/http/same-origin.
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 })

  const store = await cookies()
  const db = getDb()

  const session = await resolveSession(db, store.get(SESSION_COOKIE)?.value)
  if (!session) return redirectTo(request, '/signin')

  const form = await request.formData()
  const courseId = String(form.get('courseId') ?? '')
  const lessonId = String(form.get('lessonId') ?? '')

  if (!courseId || !lessonId) return new NextResponse(null, { status: 400 })

  // Commenting is part of the course, so it needs the same access the lesson does.
  if (!(await canAccessCourse(db, session.accountId, courseId))) {
    return new NextResponse(null, { status: 403 })
  }

  const withdraw = form.get('withdraw')
  if (typeof withdraw === 'string' && withdraw) {
    await deleteOwnComment(db, session.accountId, withdraw)
    return back(request, courseId, lessonId)
  }

  const parentId = form.get('parentId')
  const result = await postComment(db, courseConfig, {
    accountId: session.accountId,
    courseId,
    lessonId,
    body: String(form.get('body') ?? ''),
    ...(typeof parentId === 'string' && parentId ? { parentId } : {}),
  })

  if (!result.ok) return back(request, courseId, lessonId, 'problem')
  return back(request, courseId, lessonId, result.state === 'pending' ? 'pending' : undefined)
}
