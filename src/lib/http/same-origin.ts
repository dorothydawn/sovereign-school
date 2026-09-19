/**
 * Whether a state-changing request came from this site's own pages.
 *
 * The session cookie is `SameSite=Lax`, which already stops a browser attaching
 * it to a cross-site POST — verified by pointing a real Chromium at a
 * self-submitting form on another origin and watching the request arrive with
 * no session. This is a second lock on the same door, because resting every
 * buyer's deployment on one browser behaviour is thin.
 *
 * **Do not compare against `request.url`.** Next rewrites it to `localhost`, so
 * a check written that way rejects every legitimate request — it did here, and
 * only a live test showed it. The host the browser actually addressed is in
 * `Host`, or `X-Forwarded-Host` once a proxy like Vercel is in front.
 *
 * Compared against the request's own host rather than `site.url`, so it keeps
 * working on preview deployments, on localhost, and before the owner has filled
 * `site.url` in. A check that breaks whenever somebody deploys to a new URL is
 * a check that gets switched off, and then it protects nobody.
 *
 * A missing `Origin` is allowed. Browsers send it on every POST, so absence
 * means a non-browser client, which is not what CSRF describes; rejecting those
 * would break server-to-server callers for no security gain.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true

  // X-Forwarded-Host first: behind a proxy, Host is the internal name.
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!host) return false

  try {
    // Host only, not scheme. Vercel terminates TLS and forwards plain HTTP
    // internally, so comparing schemes rejects real traffic. Same host is the
    // boundary that matters: an attacker on the same host has already won.
    return new URL(origin).host === host
  } catch {
    return false
  }
}
