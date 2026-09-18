import type { SqlClient } from '@/lib/db/runner'
import type { CourseConfig } from '@/config/types'
import type { EnrolPayload } from './payload'
import { hashToken, randomToken } from './signature'

export interface EnrolResult {
  enrolmentId: string
  /** True when this exact order had already been enrolled. Still a success. */
  duplicate: boolean
  /** Courses the student can now see. */
  grantedCourseIds: string[]
  /**
   * Products the funnel sent that the config does not map to a course. The
   * customer has already paid, so these are recorded rather than rejected — the
   * owner adds the mapping and access appears with nothing to re-send.
   */
  unmappedProductIds: string[]
  /** The single-use link that turns this purchase into an account. */
  claimToken: string | null
}

const CLAIM_TOKEN_TTL_DAYS = 30

/** Which courses a set of product ids unlocks, and which ids map to nothing. */
export function coursesFor(config: CourseConfig, productIds: readonly string[]) {
  const known = new Set(config.courses.map((c) => c.id))
  const granted = new Set<string>()
  const unmapped: string[] = []

  for (const productId of productIds) {
    const mapped = config.productToCourses[productId]
    if (!mapped || mapped.length === 0) {
      unmapped.push(productId)
      continue
    }
    // A mapping can point at a course that no longer exists — a typo, or a
    // course removed from the config. That is unmapped too, not a crash.
    let matched = false
    for (const courseId of mapped) {
      if (known.has(courseId)) {
        granted.add(courseId)
        matched = true
      }
    }
    if (!matched) unmapped.push(productId)
  }

  return { grantedCourseIds: [...granted], unmappedProductIds: unmapped }
}

/**
 * Records a purchase and grants access.
 *
 * Safe to call repeatedly with the same order. The funnel confirms payments
 * from two racing sources and retries on top of that, so duplicates are the
 * normal case rather than an error.
 */
export async function enrol(
  db: SqlClient,
  config: CourseConfig,
  payload: EnrolPayload,
): Promise<EnrolResult> {
  const { grantedCourseIds, unmappedProductIds } = coursesFor(config, payload.productIds)

  // ON CONFLICT makes the insert an upsert keyed on the funnel's order id. The
  // xmax test tells us whether this row already existed: 0 means freshly
  // inserted, non-zero means the conflict path updated it.
  const rows = await db.rows<{ id: string; existed: boolean }>(
    `INSERT INTO enrolments
       (order_id, email, product_ids, unmapped_products,
        amount_minor_units, currency, purchased_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (order_id) DO UPDATE
       SET email             = COALESCE(EXCLUDED.email, enrolments.email),
           unmapped_products = EXCLUDED.unmapped_products,
           updated_at        = now()
     RETURNING id, (xmax <> 0) AS existed`,
    [
      payload.orderId,
      payload.email,
      payload.productIds,
      unmappedProductIds,
      payload.amountMinorUnits,
      payload.currency,
      payload.purchasedAt,
    ],
  )

  const row = rows[0]
  if (!row) {
    // Cannot happen with RETURNING, but the alternative to checking is a
    // confusing crash on a request where somebody has already been charged.
    throw new Error(`Enrolment for order ${payload.orderId} returned no row`)
  }

  for (const courseId of grantedCourseIds) {
    // Granting the same course twice is a no-op rather than an error, and a
    // previously revoked grant is NOT silently reinstated here — restoring
    // access is a deliberate act, not a side effect of a retried webhook.
    await db.rows(
      `INSERT INTO course_access (enrolment_id, course_id)
       VALUES ($1, $2)
       ON CONFLICT (enrolment_id, course_id) DO NOTHING`,
      [row.id, courseId],
    )
  }

  // A duplicate delivery must not mint a second claim link: the first may
  // already be in the customer's hands.
  //
  // Checking first and inserting second is NOT enough. The funnel delivers from
  // two racing sources, so several requests reach this point at once, all see no
  // token, and all insert. A partial unique index settles it instead — whoever
  // loses the race inserts nothing and returns null, which is the same answer a
  // repeat delivery gets.
  const candidate = randomToken()

  // Clear an expired unused token first, or its index entry would block the
  // replacement a student legitimately needs.
  await db.rows(
    `DELETE FROM claim_tokens
      WHERE enrolment_id = $1 AND used_at IS NULL AND expires_at <= now()`,
    [row.id],
  )

  const inserted = await db.rows<{ token_hash: string }>(
    `INSERT INTO claim_tokens (token_hash, enrolment_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)
     ON CONFLICT (enrolment_id) WHERE used_at IS NULL DO NOTHING
     RETURNING token_hash`,
    [hashToken(candidate), row.id, String(CLAIM_TOKEN_TTL_DAYS)],
  )

  const claimToken: string | null = inserted.length > 0 ? candidate : null

  return {
    enrolmentId: row.id,
    duplicate: row.existed,
    grantedCourseIds,
    unmappedProductIds,
    claimToken,
  }
}
