/**
 * The body the funnel sends. See docs/decisions/enrolment.md — this contract is
 * shared with the funnel repo and should not be changed on one side alone.
 */
export interface EnrolPayload {
  orderId: string
  /** May be null. The funnel does not require an email to take a payment. */
  email: string | null
  productIds: string[]
  amountMinorUnits: number
  currency: string
  purchasedAt: string
}

export type ParseResult =
  | { ok: true; payload: EnrolPayload }
  | { ok: false; reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates the body after its signature has been checked.
 *
 * A signed body that does not parse is a bug on the funnel side rather than an
 * attack, so unlike a bad signature these failures say what was wrong.
 */
export function parseEnrolPayload(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, reason: 'body must be a JSON object' }

  const { orderId, email, productIds, amountMinorUnits, currency, purchasedAt } = body

  if (typeof orderId !== 'string' || orderId.length === 0) {
    return { ok: false, reason: 'orderId must be a non-empty string' }
  }
  if (email !== null && typeof email !== 'string') {
    return { ok: false, reason: 'email must be a string or null' }
  }
  if (!Array.isArray(productIds) || productIds.some((id) => typeof id !== 'string')) {
    return { ok: false, reason: 'productIds must be an array of strings' }
  }
  if (productIds.length === 0) {
    return { ok: false, reason: 'productIds must not be empty' }
  }
  if (typeof amountMinorUnits !== 'number' || !Number.isInteger(amountMinorUnits)) {
    return { ok: false, reason: 'amountMinorUnits must be an integer' }
  }
  if (typeof currency !== 'string' || currency.length === 0) {
    return { ok: false, reason: 'currency must be a non-empty string' }
  }
  if (typeof purchasedAt !== 'string' || Number.isNaN(Date.parse(purchasedAt))) {
    return { ok: false, reason: 'purchasedAt must be an ISO 8601 timestamp' }
  }

  return {
    ok: true,
    payload: {
      orderId,
      email: email ?? null,
      productIds: productIds as string[],
      amountMinorUnits,
      currency,
      purchasedAt,
    },
  }
}
