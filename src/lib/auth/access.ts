import type { SqlClient } from '@/lib/db/runner'
import type { CourseConfig, CourseDefinition } from '@/config/types'
import { reconcileUnmapped } from '@/lib/enrol/reconcile'

/**
 * The course ids this account may see.
 *
 * Only `active` grants count. A revoked grant is left in place as a record, so
 * this filter is the single point where the refund policy takes effect — which
 * is why the state exists in the schema even while nothing revokes yet.
 */
export async function accessibleCourseIds(db: SqlClient, accountId: string): Promise<string[]> {
  const rows = await db.rows<{ course_id: string }>(
    `SELECT DISTINCT ca.course_id
       FROM course_access ca
       JOIN enrolments e ON e.id = ca.enrolment_id
      WHERE e.account_id = $1 AND ca.state = 'active'`,
    [accountId],
  )
  return rows.map((r) => r.course_id)
}

/**
 * The courses this account may see, as configured.
 *
 * A grant for a course that is no longer in `course.config.ts` is dropped
 * rather than returned as a broken entry — the owner may have retired it.
 */
export async function accessibleCourses(
  db: SqlClient,
  config: CourseConfig,
  accountId: string,
): Promise<CourseDefinition[]> {
  // If this student bought something the config did not map at the time, and the
  // owner has since added the mapping, this is where their access appears. It
  // does nothing unless there is something left over, so the normal case is a
  // single cheap query.
  await reconcileUnmapped(db, config, { accountId })

  const granted = new Set(await accessibleCourseIds(db, accountId))
  return config.courses.filter((course) => granted.has(course.id))
}

/** Whether this account may open this course. Every course page must ask. */
export async function canAccessCourse(
  db: SqlClient,
  accountId: string,
  courseId: string,
): Promise<boolean> {
  const rows = await db.rows<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM course_access ca
         JOIN enrolments e ON e.id = ca.enrolment_id
        WHERE e.account_id = $1 AND ca.course_id = $2 AND ca.state = 'active'
     ) AS ok`,
    [accountId, courseId],
  )
  return rows[0]?.ok ?? false
}
