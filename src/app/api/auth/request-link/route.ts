import { NextResponse } from 'next/server'
import courseConfig from '../../../../../course.config'
import { getDb } from '@/lib/db/client'
import { requestSignInLink } from '@/lib/auth/signin'
import { signInEmail } from '@/lib/auth/emails'
import { dailyQuotaWarning, sendEmail } from '@/lib/email/send'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  if (!courseConfig.auth.magicLink) {
    return NextResponse.redirect(new URL('/signin', courseConfig.site.url), 303)
  }

  const form = await request.formData()
  const email = form.get('email')

  if (typeof email === 'string' && email.includes('@')) {
    const db = getDb()
    const issued = await requestSignInLink(db, email)

    if (issued) {
      await sendEmail(db, courseConfig, signInEmail(courseConfig, email.trim(), issued.token))

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
  return NextResponse.redirect(new URL('/signin?sent=1', courseConfig.site.url), 303)
}
