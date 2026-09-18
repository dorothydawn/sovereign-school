import type { EmailMessage, EmailSender, SendOutcome } from './types'

/**
 * Resend, over its HTTP API.
 *
 * No SDK: it is one POST, and a dependency that does nothing but wrap fetch is
 * a dependency a buyer has to trust and update for no benefit.
 */
export function resendSender(apiKey: string): EmailSender {
  return {
    name: 'resend',
    async send(message: EmailMessage, from: string): Promise<SendOutcome> {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
        })

        if (response.ok) return { ok: true }

        const body = await response.text()
        // 429 is Resend saying you have hit the daily or monthly cap. The owner
        // needs to hear about that one differently: their students are not
        // getting sign-in links.
        return {
          ok: false,
          error: `Resend responded ${response.status}: ${body.slice(0, 200)}`,
          quotaExceeded: response.status === 429,
        }
      } catch (error) {
        return { ok: false, error: String(error), quotaExceeded: false }
      }
    },
  }
}
