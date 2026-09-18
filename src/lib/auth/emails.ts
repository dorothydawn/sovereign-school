import type { CourseConfig } from '@/config/types'
import type { EmailMessage } from '@/lib/email/types'

/**
 * The sign-in email.
 *
 * Plain text, short, and it says what to expect. A student who did not ask for
 * this needs to know they can ignore it, and one who did needs the link to be
 * the obvious thing on the page.
 */
export function signInEmail(config: CourseConfig, to: string, token: string): EmailMessage {
  const url = `${config.site.url}/signin/link/${token}`

  return {
    to,
    subject: `Sign in to ${config.site.name}`,
    text: [
      `Open this link to sign in to ${config.site.name}:`,
      '',
      url,
      '',
      'The link works once and expires in 30 minutes.',
      '',
      `If you did not ask to sign in, you can ignore this — nobody can get into`,
      `your account without this email.`,
      '',
      `Trouble? Reply to this message or write to ${config.site.supportEmail}.`,
    ].join('\n'),
  }
}
