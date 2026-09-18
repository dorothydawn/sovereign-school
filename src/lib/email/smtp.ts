import { createTransport } from 'nodemailer'
import type { EmailMessage, EmailSender, SendOutcome } from './types'

export interface SmtpSettings {
  host: string
  port: number
  user: string
  pass: string
  secure?: boolean
}

/** Gmail's SMTP server. The account needs an app password, not its normal one. */
export const GMAIL_SMTP = { host: 'smtp.gmail.com', port: 465, secure: true }

/**
 * Anything that speaks SMTP: Gmail, your own server, or Amazon SES.
 *
 * SES is reached through its SMTP endpoint rather than the AWS SDK, which keeps
 * the cheapest provider available without adding a large dependency and an
 * unfamiliar credential format.
 */
export function smtpSender(settings: SmtpSettings, label = 'smtp'): EmailSender {
  const transport = createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure ?? settings.port === 465,
    auth: { user: settings.user, pass: settings.pass },
  })

  return {
    name: label,
    async send(message: EmailMessage, from: string): Promise<SendOutcome> {
      try {
        await transport.sendMail({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
        })
        return { ok: true }
      } catch (error) {
        const text = String(error)
        // Gmail says this when the daily cap is spent. It is not a broken
        // configuration and telling the owner to check their settings would
        // send them looking in the wrong place.
        const quotaExceeded =
          /quota|rate limit|too many|limit exceeded|4\.7\.0|550 5\.4\.5/i.test(text)
        return { ok: false, error: text.slice(0, 300), quotaExceeded }
      }
    },
  }
}
