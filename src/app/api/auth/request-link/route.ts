import { NextResponse } from 'next/server'
import courseConfig from '../../../../../course.config'
import { getDb } from '@/lib/db/client'
import { requestSignInLink } from '@/lib/auth/signin'
import { ensureOwnerAccount } from '@/lib/auth/owner'
import { normaliseEmail } from '@/lib/enrol/payload'
import { signInEmail } from '@/lib/auth/emails'
import { dailyQuotaWarning, sendEmail } from '@/lib/email/send'
import { isSameOrigin } from '@/lib/http/same-origin'
import { redirectTo } from '@/lib/http/redirect'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  // Second lock alongside the SameSite cookie. See lib/http/same-origin.
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 })

  if (!courseConfig.auth.magicLink) {
    return redirectTo(request, '/signin')
  }

  const form = await request.formData()
  const email = form.get('email')

  if (typeof email === 'string' && email.includes('@')) {
    const db = getDb()

    // The owner has usually bought nothing, so no purchase ever made them an
    // account. This creates one for the exact address in OWNER_EMAIL and no
    // other, the first time they ask to sign in.
    await ensureOwnerAccount(db, email)

    const issued = await requestSignInLink(db, email)

    if (issued) {
      // Send to the normalised address, not the raw field. Nothing with a
      // newline in it can match a stored account today — normalisation and the
      // accounts_email_is_normalised constraint both prevent it — so this is
      // not exploitable. But the address reaches an email header, and a header
      // built from raw form input is one refactor away from being a problem.
      await sendEmail(
        db,
        courseConfig,
        signInEmail(courseConfig, normaliseEmail(email), issued.token),
      )

      const warning = await dailyQuotaWarning(db, courseConfig)
      if (warning) {
        // The owner needs to know before students stop receiving links, not
        // after they start complaining.
        console.error(
          `[email] ${warning.sent} of about ${warning.cap} emails sent today — past ` +
            `${warning.threshold}%. When the cap is reached, sign-in links stop ` +
            `arriving. See docs/choosing-an-email-sender.md.`,
        )
      }
    }
  }

  // The same answer whether or not that address has an account. Anything more
  // specific tells a stranger which of the owner's students exist.
  return redirectTo(request, '/signin?sent=1')
}
