import { NextResponse } from 'next/server'
import courseConfig from '../../../../../course.config'
import { verifySignature } from '@/lib/enrol/signature'
import { siteUrlFor } from '@/lib/http/site-url'

export const dynamic = 'force-dynamic'

/**
 * A handshake, so the two sides can prove they agree before real money moves.
 *
 * Signed exactly like `/api/enrol` and answering the three things the funnel
 * needs to know: that the shared secret matches, what this platform's address
 * actually is, and the exact product id strings it will recognise.
 *
 * It writes nothing. Without it the first test of a new integration is a real
 * enrolment, which leaves a fake order in the owner's database and on their
 * dashboard — and if the secret is wrong, a `401` that says nothing about which
 * side is wrong.
 *
 * This is no more of an oracle than `/api/enrol` already is: that endpoint
 * distinguishes a bad signature from a bad body too. The difference is only
 * that this one has no side effects.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env['FUNNEL_SHARED_SECRET']
  if (!secret) {
    console.error('[enrol/check] FUNNEL_SHARED_SECRET is not set on the platform')
    return new NextResponse(null, { status: 401 })
  }

  const rawBody = await request.text()
  if (!verifySignature(rawBody, request.headers.get('x-funnel-signature'), secret)) {
    return new NextResponse(null, { status: 401 })
  }

  const mapping = courseConfig.productToCourses
  const known = new Set(courseConfig.courses.map((course) => course.id))

  return NextResponse.json({
    ok: true,
    // The address to call, as this request reached it. Worth checking against
    // whatever the funnel has configured.
    platformUrl: siteUrlFor(request, courseConfig.site.url),
    enrolUrl: `${siteUrlFor(request, courseConfig.site.url)}/api/enrol`,
    // Exactly what to send as productIds. Copy these strings.
    productIds: Object.keys(mapping),
    // What each one will unlock, so a mapping pointing at a deleted course is
    // visible here rather than discovered by a customer who cannot see it.
    unlocks: Object.fromEntries(
      Object.entries(mapping).map(([productId, courseIds]) => [
        productId,
        courseIds.map((id) => (known.has(id) ? id : `${id} (NO SUCH COURSE)`)),
      ]),
    ),
    courses: courseConfig.courses.map((course) => course.id),
  })
}
