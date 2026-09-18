export interface EmailMessage {
  to: string
  subject: string
  /** Plain text. Sign-in emails are short and plain text always arrives. */
  text: string
}

export type SendOutcome =
  | { ok: true }
  | { ok: false; error: string; /** True when the provider's cap was hit. */ quotaExceeded: boolean }

/** What every provider adapter implements. Adding one is a file this size. */
export interface EmailSender {
  readonly name: string
  send(message: EmailMessage, from: string): Promise<SendOutcome>
}
