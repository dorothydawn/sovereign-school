import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import courseConfig from '../../../../course.config'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, resolveSession } from '@/lib/auth/session'
import { canAccessCourse } from '@/lib/auth/access'
import { setCompleted, setPosition } from '@/lib/progress/progress'
import { isSameOrigin } from '@/lib/http/same-origin'

export const dynamic = 'force-dynamic'

/**
 * Records progress: a lesson finished, or where a video was paused.
 *
 * Checks access on every call. A student with a session is not automatically a
 * student with this course — they may have bought a different one, or had this
 * one revoked.
 */
export async function POST(request: Request): Promise<Response> {
  // Second lock alongside the SameSite cookie. See lib/http/same-origin.
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 })

  const store = await cookies()
  const db = getDb()

  const session = await resolveSession(db, store.get(SESSION_COOKIE)?.value)
  if (!session) return new NextResponse(null, { status: 401 })

  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'expected a JSON object' }, { status: 400 })
  }

  const { courseId, lessonId, completed, position } = body as Record<string, unknown>

  if (typeof courseId !== 'string' || typeof lessonId !== 'string') {
    return NextResponse.json({ error: 'courseId and lessonId are required' }, { status: 400 })
  }

  if (!(await canAccessCourse(db, session.accountId, courseId))) {
    return new NextResponse(null, { status: 403 })
  }

  if (courseConfig.progress.trackCompletion && typeof completed === 'boolean') {
    await setCompleted(db, session.accountId, courseId, lessonId, completed)
  }

  if (courseConfig.progress.rememberVideoPosition && typeof position === 'number') {
    await setPosition(db, session.accountId, courseId, lessonId, position)
  }

  return NextResponse.json({ ok: true })
}
