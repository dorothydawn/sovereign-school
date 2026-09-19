import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import courseConfig from '../../../course.config'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, resolveSession } from '@/lib/auth/session'
import { isOwner, ownerEmail } from '@/lib/auth/owner'
import { pendingComments } from '@/lib/comments/comments'
import { sentToday, FREE_TIER_DAILY_CAP } from '@/lib/email/send'
import { databaseUsage, FREE_CU_HOURS } from '@/lib/usage/database'
import { checkFreeTierCeilings } from '@/lib/usage/notify'

export const dynamic = 'force-dynamic'

interface UnmappedRow {
  order_id: string
  unmapped_products: string[]
}

/**
 * The owner's page: what needs their attention, and nothing else.
 *
 * Not an analytics dashboard. Three things belong here — comments waiting,
 * purchases that unlocked nothing, and whether a free tier is about to stop
 * the site working.
 */
export default async function OwnerPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string; problem?: string }>
}) {
  const { changed, problem } = await searchParams
  const store = await cookies()
  const db = getDb()

  const session = await resolveSession(db, store.get(SESSION_COOKIE)?.value)
  if (!session) redirect('/signin')

  // notFound rather than a refusal: a student should not learn this page exists.
  if (!(await isOwner(db, session.accountId))) notFound()

  // The owner opening this page is as good a moment as any to check whether a
  // free tier is about to stop the site working.
  await checkFreeTierCeilings(db, courseConfig)

  const pending = await pendingComments(db, 50)

  const unmapped = await db.rows<UnmappedRow>(
    `SELECT order_id, unmapped_products FROM enrolments
      WHERE unmapped_products <> '{}' ORDER BY created_at DESC LIMIT 25`,
  )

  const usage = await databaseUsage(db)
  const emailsToday = await sentToday(db)
  const emailCap = FREE_TIER_DAILY_CAP[courseConfig.email.provider]

  const students = await db.rows<{ id: string; email: string | null; courses: number }>(
    `SELECT a.id, a.email, count(DISTINCT ca.course_id)::int AS courses
       FROM accounts a
       JOIN enrolments e ON e.account_id = a.id
       LEFT JOIN course_access ca ON ca.enrolment_id = e.id AND ca.state = 'active'
      GROUP BY a.id, a.email
      ORDER BY a.created_at DESC
      LIMIT 100`,
  )

  return (
    <main className="page" style={{ maxWidth: '46rem' }}>
      <p>
        <Link href="/">← Back to the courses</Link>
      </p>
      <h1>Things to look at</h1>

      {changed && (
        <p role="status" className="notice">
          Changed to <strong>{changed}</strong>. They can sign in with it now, and
          everything they bought is still there.
        </p>
      )}
      {problem && (
        <p role="alert" className="notice">
          {problem}
        </p>
      )}
      <p className="muted">Signed in as the owner ({ownerEmail()}).</p>

      <section>
        <h2>Comments waiting ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="muted">Nothing waiting.</p>
        ) : (
          <ol className="comment-list">
            {pending.map((comment) => (
              <li key={comment.id}>
                <article className="comment">
                  <header className="muted">
                    {comment.authorEmail ?? 'A student'} on{' '}
                    <Link href={`/course/${comment.courseId}/${comment.lessonId}`}>
                      {comment.lessonId}
                    </Link>
                  </header>
                  {/* Text. A comment is a stranger's typing, never markup. */}
                  <p className="comment-body">{comment.body}</p>
                  <div className="comment-actions">
                    <form method="post" action="/api/comments/moderate">
                      <input type="hidden" name="commentId" value={comment.id} />
                      <input type="hidden" name="action" value="publish" />
                      <button type="submit">Approve</button>
                    </form>
                    <form method="post" action="/api/comments/moderate">
                      <input type="hidden" name="commentId" value={comment.id} />
                      <input type="hidden" name="action" value="remove" />
                      <button type="submit">Remove</button>
                    </form>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2>Purchases that unlocked nothing ({unmapped.length})</h2>
        {unmapped.length === 0 ? (
          <p className="muted">None. Every product sold maps to a course.</p>
        ) : (
          <>
            <p className="notice">
              These people paid for something <code>course.config.ts</code> does not
              recognise, so they cannot see a course yet. Add the product id to{' '}
              <code>productToCourses</code> and their access appears — nothing needs
              re-sending.
            </p>
            <ul>
              {unmapped.map((row) => (
                <li key={row.order_id}>
                  <code>{row.order_id}</code> bought{' '}
                  <strong>{row.unmapped_products.join(', ')}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <h2>What your funnel should send</h2>
        <p className="muted">
          These are the exact product ids this platform recognises. Whoever builds
          your funnel needs them character for character — a mismatch means a
          customer pays and sees no course.
        </p>
        <ul>
          {Object.entries(courseConfig.productToCourses).map(([productId, courseIds]) => (
            <li key={productId}>
              <code>{productId}</code> → {courseIds.join(', ')}
              {courseIds.some((id) => !courseConfig.courses.some((c) => c.id === id)) && (
                <strong> — points at a course that does not exist</strong>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Students</h2>
        <p className="muted">
          If somebody mistyped their address at checkout they cannot sign in. Correct
          it here — everything they bought stays with them, and nothing needs
          re-sending.
        </p>
        {students.length === 0 ? (
          <p className="muted">Nobody has bought anything yet.</p>
        ) : (
          <ul className="student-list">
            {students.map((student) => (
              <li key={student.id}>
                <form method="post" action="/api/students">
                  <input type="hidden" name="accountId" value={student.id} />
                  <label htmlFor={`email-${student.id}`} className="visually-hidden">
                    Email address for this student
                  </label>
                  <input
                    id={`email-${student.id}`}
                    name="email"
                    type="email"
                    defaultValue={student.email ?? ''}
                    placeholder="no email on file"
                    required
                  />
                  <button type="submit">Save</button>
                  <span className="muted">
                    {student.courses} course{student.courses === 1 ? '' : 's'}
                  </span>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Running costs</h2>
        <ul>
          <li>{students.length} students</li>
          <li>
            Database: roughly {usage.percentOfFree}% of the free monthly allowance
            used ({usage.estimatedCuHours.toFixed(1)} of {FREE_CU_HOURS} compute-hours,{' '}
            {usage.awakeHours.toFixed(1)} hours awake)
            {usage.percentOfFree >= 70 && (
              <strong> — at 100% Neon suspends the database until next month.</strong>
            )}
          </li>
          <li>
            {emailsToday} of roughly {emailCap ?? '∞'} emails sent today
            {emailCap ? ' on a free plan' : ''}
            {emailCap && emailsToday >= emailCap * 0.7 && (
              <strong>
                {' '}
                — close to the cap. When it is reached, sign-in links stop arriving.
              </strong>
            )}
          </li>
        </ul>
        <p className="muted">
          The database figure is an estimate. Neon does not report real usage on the
          free plan, so this measures how long the database stays awake and works
          backwards, erring on the cautious side.
        </p>
        <p className="muted">
          See <code>docs/choosing-an-email-sender.md</code> and{' '}
          <code>docs/choosing-a-neon-plan.md</code> if either of these is getting tight.
        </p>
      </section>
    </main>
  )
}
