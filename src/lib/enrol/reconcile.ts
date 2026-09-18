import type { SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import { coursesFor } from './enrol'

export interface ReconcileResult {
  /** Enrolments that gained access they did not have before. */
  updatedEnrolmentIds: string[]
  grantedCourseIds: string[]
}

/**
 * Grants access for purchases whose products the config did not map at the time.
 *
 * When somebody buys a product `course.config.ts` does not recognise, the
 * purchase is recorded and the products are kept on the row, because refusing
 * would leave somebody who paid with nothing. The owner then adds the mapping —
 * and this is what makes their access appear without the funnel re-sending
 * anything.
 *
 * Cheap to call: only rows with leftover unmapped products are considered, so
 * it does nothing at all in the normal case.
 */
export async function reconcileUnmapped(
  db: SqlClient,
  config: CourseConfig,
  scope: { accountId?: string; enrolmentId?: string } = {},
): Promise<ReconcileResult> {
  const filters: string[] = [`unmapped_products <> '{}'`]
  const params: unknown[] = []

  if (scope.accountId) {
    params.push(scope.accountId)
    filters.push(`account_id = $${params.length}`)
  }
  if (scope.enrolmentId) {
    params.push(scope.enrolmentId)
    filters.push(`id = $${params.length}`)
  }

  const pending = await db.rows<{ id: string; product_ids: string[] }>(
    `SELECT id, product_ids FROM enrolments WHERE ${filters.join(' AND ')}`,
    params,
  )

  const updatedEnrolmentIds: string[] = []
  const grantedCourseIds = new Set<string>()

  for (const enrolment of pending) {
    const { grantedCourseIds: granted, unmappedProductIds } = coursesFor(
      config,
      enrolment.product_ids,
    )

    let changed = false
    for (const courseId of granted) {
      // DO NOTHING rather than an update: a revoked grant must not be quietly
      // reinstated by a config edit.
      const inserted = await db.rows<{ id: string }>(
        `INSERT INTO course_access (enrolment_id, course_id)
         VALUES ($1, $2)
         ON CONFLICT (enrolment_id, course_id) DO NOTHING
         RETURNING id`,
        [enrolment.id, courseId],
      )
      if (inserted.length > 0) {
        grantedCourseIds.add(courseId)
        changed = true
      }
    }

    // Rewrite the leftovers so a product that is still unmapped stays visible to
    // the owner, and one that has been resolved stops nagging.
    await db.rows(
      `UPDATE enrolments SET unmapped_products = $1, updated_at = now() WHERE id = $2`,
      [unmappedProductIds, enrolment.id],
    )

    if (changed) updatedEnrolmentIds.push(enrolment.id)
  }

  return { updatedEnrolmentIds, grantedCourseIds: [...grantedCourseIds] }
}
