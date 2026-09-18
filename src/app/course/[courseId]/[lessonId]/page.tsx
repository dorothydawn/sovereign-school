import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import courseConfig from '../../../../../course.config'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, resolveSession } from '@/lib/auth/session'
import { canAccessCourse } from '@/lib/auth/access'
import { findCourse, loadLessons, nextLesson } from '@/lib/content/lessons'
import { courseProgress, percentComplete } from '@/lib/progress/progress'
import { videoEmbed } from '@/lib/video/embed'
import { LessonPlayer } from '@/components/LessonPlayer'
import { CompleteButton } from '@/components/CompleteButton'

export const dynamic = 'force-dynamic'

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>
}) {
  const { courseId, lessonId } = await params
  const store = await cookies()
  const db = getDb()

  const session = await resolveSession(db, store.get(SESSION_COOKIE)?.value)
  if (!session) redirect('/signin')

  const course = findCourse(courseConfig, courseId)
  if (!course) notFound()

  // Checked on every lesson view, not once at the door. Access can be revoked
  // between one page and the next.
  if (!(await canAccessCourse(db, session.accountId, courseId))) redirect('/')

  const lessons = await loadLessons(course)
  const lesson = lessons.find((l) => l.id === lessonId)
  if (!lesson) notFound()

  const progress = await courseProgress(db, session.accountId, courseId)
  const percent = percentComplete(progress, lessons.map((l) => l.id))
  const next = nextLesson(lessons, lesson.id)
  const state = progress.get(lesson.id)

  return (
    <div className="shell">
      <nav className="sidebar" aria-label={`${course.title} lessons`}>
        <Link href="/">← All courses</Link>
        <h2>{course.title}</h2>

        {courseConfig.progress.trackCompletion && (
          <>
            <div
              className="progress-bar"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Course progress"
            >
              <span style={{ width: `${percent}%` }} />
            </div>
            <p className="progress-label">{percent}% complete</p>
          </>
        )}

        <ul className="lesson-list">
          {lessons.map((item, index) => {
            const done = progress.get(item.id)?.completed ?? false
            return (
              <li key={item.id}>
                <Link
                  href={`/course/${courseId}/${item.id}`}
                  aria-current={item.id === lesson.id ? 'page' : undefined}
                >
                  <span className="tick" aria-hidden="true">
                    {done ? '✓' : ''}
                  </span>
                  <span className="num">{index + 1}</span>
                  <span>
                    {item.title}
                    {done && <span className="visually-hidden"> (completed)</span>}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <main className="content">
        {lesson.video && (
          <LessonPlayer
            embed={videoEmbed(lesson.video)}
            title={lesson.title}
            courseId={courseId}
            lessonId={lesson.id}
            startAt={state?.position ?? 0}
            remember={courseConfig.progress.rememberVideoPosition}
          />
        )}

        <h1>{lesson.title}</h1>

        {/* The body is Markdown written by the owner in their own repository,
            not anything a student can submit. */}
        <div dangerouslySetInnerHTML={{ __html: lesson.html }} />

        {courseConfig.progress.trackCompletion && (
          <CompleteButton
            courseId={courseId}
            lessonId={lesson.id}
            completed={state?.completed ?? false}
            nextHref={next ? `/course/${courseId}/${next.id}` : null}
          />
        )}
      </main>
    </div>
  )
}
