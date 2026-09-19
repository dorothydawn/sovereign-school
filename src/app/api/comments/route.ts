import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import courseConfig from '../../../../course.config'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, resolveSession } from '@/lib/auth/session'
import { canAccessCourse } from '@/lib/auth/access'
import { deleteOwnComment, postComment } from '@/lib/comments/comments'

export const dynamic = 'force-dynamic'

function back(courseId: string, lessonId: string, problem?: string): Response {
  const url = new URL(`/course/${courseId}/${lessonId}`, courseConfig.site.url)
  if (problem) url.searchParams.set('comment', problem)
  else url.hash = 'comments'
  return NextResponse.redirect(url, 303)
}

export async function POST(request: Request): Promise<Response> {
  const store = await cookies()
  const db = getDb()

  const session = await resolveSession(db, store.get(SESSION_COOKIE)?.value)
  if (!session) return NextResponse.redirect(new URL('/signin', courseConfig.site.url), 303)

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
    return back(courseId, lessonId)
  }

  const parentId = form.get('parentId')
  const result = await postComment(db, courseConfig, {
    accountId: session.accountId,
    courseId,
    lessonId,
    body: String(form.get('body') ?? ''),
    ...(typeof parentId === 'string' && parentId ? { parentId } : {}),
  })

  if (!result.ok) return back(courseId, lessonId, 'problem')
  return back(courseId, lessonId, result.state === 'pending' ? 'pending' : undefined)
}
