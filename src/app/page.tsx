import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import courseConfig from '../../course.config'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, resolveSession } from '@/lib/auth/session'
import { accessibleCourses } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

/**
 * The student's library: everything they have bought, in one place.
 *
 * Loading this is also what grants access for a purchase whose product the
 * owner mapped after the fact — see reconcileUnmapped.
 */
export default async function LibraryPage() {
  const store = await cookies()
  const db = getDb()

  const session = await resolveSession(db, store.get(SESSION_COOKIE)?.value)
  if (!session) redirect('/signin')

  const courses = await accessibleCourses(db, courseConfig, session.accountId)

  return (
    <main style={{ maxWidth: '40rem', margin: '3rem auto', padding: '0 1rem' }}>
      <h1>{courseConfig.site.name}</h1>

      {courses.length === 0 ? (
        // Somebody signed in with nothing to show has almost certainly paid.
        // Never imply they have not.
        <>
          <h2>Your courses are not showing yet</h2>
          <p>
            If you have just bought something, this can take a moment. If it does not
            appear, email{' '}
            <a href={`mailto:${courseConfig.site.supportEmail}`}>
              {courseConfig.site.supportEmail}
            </a>{' '}
            and we will put it right — your purchase is safe.
          </p>
        </>
      ) : (
        <ul>
          {courses.map((course) => (
            <li key={course.id}>
              <Link href={`/course/${course.id}`}>{course.title}</Link>
              {course.description && <p>{course.description}</p>}
            </li>
          ))}
        </ul>
      )}

      <form method="post" action="/api/auth/signout" style={{ marginTop: '3rem' }}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  )
}
