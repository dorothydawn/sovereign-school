/**
 * The address this site is actually reachable at, as the caller reached it.
 *
 * `courseConfig.site.url` is typed in by hand at setup and is wrong more often
 * than anybody expects — left as the placeholder, stale after a domain change,
 * or never filled in at all. Anything built from it inherits that mistake.
 *
 * For the claim link that matters more than anywhere else: the funnel calls the
 * platform at the address its owner configured, so the host on that request is
 * by definition an address that works. Building the customer's way into their
 * course out of a hand-typed config value instead means one typo sends every
 * buyer a dead link, and the payment has already gone through.
 */
export function siteUrlFor(request: Request, fallback: string): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!host) return fallback.replace(/\/$/, '')

  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}
