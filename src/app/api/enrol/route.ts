import { NextResponse } from 'next/server'
import courseConfig from '../../../../course.config'
import { getDb } from '@/lib/db/client'
import { enrol } from '@/lib/enrol/enrol'
import { parseEnrolPayload } from '@/lib/enrol/payload'
import { verifySignature } from '@/lib/enrol/signature'
import { siteUrlFor } from '@/lib/http/site-url'

export const dynamic = 'force-dynamic'

/**
 * The funnel calls this when somebody buys.
 *
 * By the time this runs the customer has already paid, and we cannot un-charge
 * them. So: never fail on a duplicate, never reject a product we do not
 * recognise, and be loud when something does go wrong.
 *
 * See docs/decisions/enrolment.md before changing any of this.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env['FUNNEL_SHARED_SECRET']
  if (!secret) {
    // Fail closed. Without a secret we cannot tell the funnel from a stranger.
    console.error('[enrol] FUNNEL_SHARED_SECRET is not set; refusing every request')
    return new NextResponse(null, { status: 401 })
  }

  // Read the raw bytes. Verifying anything else means verifying something other
  // than what was sent.
  const rawBody = await request.text()
  const signature = request.headers.get('x-funnel-signature')

  if (!verifySignature(rawBody, signature, secret)) {
    // No detail: an error that explains itself is an error that helps whoever
    // is guessing.
    return new NextResponse(null, { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'body is not valid JSON' }, { status: 400 })
  }

  const parsed = parseEnrolPayload(json)
  if (!parsed.ok) {
    // Signed but malformed is a bug on the funnel side, so say what was wrong.
    console.error(`[enrol] rejected a signed but invalid payload: ${parsed.reason}`)
    return NextResponse.json({ error: parsed.reason }, { status: 400 })
  }

  try {
    const result = await enrol(getDb(), courseConfig, parsed.payload)

    if (result.unmappedProductIds.length > 0) {
      // Loud on purpose. The customer has paid and cannot see their course
      // until the owner adds the mapping.
      console.error(
        `[enrol] order ${parsed.payload.orderId} bought ` +
          `${result.unmappedProductIds.join(', ')}, which course.config.ts does not map ` +
          `to any course. The purchase is recorded. Add the mapping and access ` +
          `will appear with nothing to re-send.`,
      )
    }

    return NextResponse.json(
      {
        ok: true,
        orderId: parsed.payload.orderId,
        duplicate: result.duplicate,
        courses: result.grantedCourseIds,
        unmappedProducts: result.unmappedProductIds,
        // Built from the address the funnel actually called, not from
        // site.url: that value is hand-typed at setup, and a typo there would
        // send every paying customer a dead link into their course.
        // Null on a repeat delivery: the first link is already with them.
        claimUrl: result.claimToken
          ? `${siteUrlFor(request, courseConfig.site.url)}/claim/${result.claimToken}`
          : null,
      },
      { status: 200 },
    )
  } catch (error) {
    // Somebody has been charged and has nothing. This must be findable.
    console.error(
      `[enrol] FAILED for order ${parsed.payload.orderId}. The customer has paid. ` +
        `This call is safe to retry.`,
      error,
    )
    return NextResponse.json({ error: 'enrolment failed' }, { status: 500 })
  }
}
