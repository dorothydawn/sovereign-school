import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import courseConfig from '../../../../course.config'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, resolveSession } from '@/lib/auth/session'
import { canAccessCourse } from '@/lib/auth/access'
import { findCourse, loadLessons } from '@/lib/content/lessons'
import { courseProgress, resumeLessonId } from '@/lib/progress/progress'

export const dynamic = 'force-dynamic'

/**
 * Opening a course drops you where you left off rather than at a contents page.
 *
 * An index page between a student and the lesson they were watching is a click
 * that earns nothing.
 */
export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const store = await cookies()
  const db = getDb()

  const session = await resolveSession(db, store.get(SESSION_COOKIE)?.value)
  if (!session) redirect('/signin')

  const course = findCourse(courseConfig, courseId)
  if (!course) notFound()

  if (!(await canAccessCourse(db, session.accountId, courseId))) redirect('/')

  const lessons = await loadLessons(course)
  if (lessons.length === 0) {
    return (
      <main className="page">
        <h1>{course.title}</h1>
        <p className="notice">
          This course has no lessons yet. If you have just bought it, check back shortly.
        </p>
      </main>
    )
  }

  const progress = await courseProgress(db, session.accountId, courseId)
  const resume = resumeLessonId(progress, lessons.map((l) => l.id))

  redirect(`/course/${courseId}/${resume ?? lessons[0]!.id}`)
}
