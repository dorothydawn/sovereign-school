import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import courseConfig from '../../../course.config'
import { getDb } from '@/lib/db/client'
import { SESSION_COOKIE, resolveSession } from '@/lib/auth/session'
import { isOwner, ownerEmail } from '@/lib/auth/owner'
import { pendingComments } from '@/lib/comments/comments'
import { sentToday, FREE_TIER_DAILY_CAP } from '@/lib/email/send'

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
export default async function OwnerPage() {
  const store = await cookies()
  const db = getDb()

  const session = await resolveSession(db, store.get(SESSION_COOKIE)?.value)
  if (!session) redirect('/signin')

  // notFound rather than a refusal: a student should not learn this page exists.
  if (!(await isOwner(db, session.accountId))) notFound()

  const pending = await pendingComments(db, 50)

  const unmapped = await db.rows<UnmappedRow>(
    `SELECT order_id, unmapped_products FROM enrolments
      WHERE unmapped_products <> '{}' ORDER BY created_at DESC LIMIT 25`,
  )

  const emailsToday = await sentToday(db)
  const emailCap = FREE_TIER_DAILY_CAP[courseConfig.email.provider]

  const students = await db.rows<{ c: number }>(
    `SELECT count(DISTINCT account_id)::int AS c FROM enrolments WHERE account_id IS NOT NULL`,
  )

  return (
    <main className="page" style={{ maxWidth: '46rem' }}>
      <p>
        <Link href="/">← Back to the courses</Link>
      </p>
      <h1>Things to look at</h1>
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
        <h2>Running costs</h2>
        <ul>
          <li>{students[0]?.c ?? 0} students with access</li>
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
          See <code>docs/choosing-an-email-sender.md</code> and{' '}
          <code>docs/choosing-a-neon-plan.md</code> if either of these is getting tight.
        </p>
      </section>
    </main>
  )
}
