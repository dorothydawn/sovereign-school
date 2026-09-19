import { NextResponse } from 'next/server'

/**
 * Builds a redirect back to a path on the site the browser is actually using.
 *
 * Not `courseConfig.site.url`, which is the obvious choice and the wrong one: it
 * is a value the owner types in by hand during setup, and if they leave it as
 * the placeholder — or deploy to a preview URL, or change domain — then every
 * form submission sends their students to somebody else's website. A comment
 * posts successfully and the student lands on `example.com`, which looks
 * catastrophic and gives no clue why.
 *
 * The host the browser addressed is authoritative and always right. Same
 * reasoning as the origin check, and the same headers.
 */
export function redirectTo(request: Request, path: string, status = 303): NextResponse {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'

  if (!host) {
    // No host to trust. A relative Location is legal and browsers resolve it.
    return NextResponse.redirect(path as unknown as URL, status)
  }

  return NextResponse.redirect(new URL(path, `${proto}://${host}`), status)
}
