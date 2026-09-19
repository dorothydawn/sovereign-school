/**
 * Decides where a form is allowed to send somebody after a POST.
 *
 * A naive `target.startsWith('/')` is not enough, and this was live for a while:
 * `//evil.example` starts with a slash, passes that check, and `new URL()`
 * resolves it to a different host. So does `/\evil.example`, because browsers
 * treat a backslash there like a second slash.
 *
 * Rather than blocking the shapes one at a time, this resolves the candidate
 * against the site's own address and keeps it only if it lands on the same
 * origin. Anything else falls back.
 */
export function safeRedirectPath(target: unknown, siteUrl: string, fallback: string): string {
  if (typeof target !== 'string' || target.length === 0) return fallback

  // Cheap rejection of the shapes that mean "somewhere else" before parsing.
  if (!target.startsWith('/')) return fallback
  if (target.startsWith('//') || target.startsWith('/\\')) return fallback

  try {
    const site = new URL(siteUrl)
    const resolved = new URL(target, site)
    if (resolved.origin !== site.origin) return fallback
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return fallback
  }
}
