# Security: what is defended, and what is not

Reviewed in full on 2026-09-19, by testing the running site rather than reading
the code. What follows is the state as verified, including the gaps.

## What an attacker would try, and what stops it

| Attack | Defence | Verified how |
|---|---|---|
| Forging a purchase | HMAC-SHA256 over the raw body, compared in constant time | A tampered body and a wrong secret both get a bare `401` |
| Replaying a purchase | `orderId` is unique and the endpoint upserts | 8 simultaneous deliveries: one enrolment |
| Reading somebody else's course | Access checked on every page and every write | A student with a different purchase gets `307` to the library, `403` on writes |
| Guessing a password | Ten attempts per address per fifteen minutes | The 11th returns `rate-limited`, for real and unknown addresses alike |
| Learning which addresses have accounts | Identical answers and identical timing | Wrong password and unknown address are byte-identical; scrypt runs on a dummy hash when no account matches |
| Stealing a session from the database | Sessions and tokens stored hashed, keyed with `SESSION_SECRET` | Stored value never equals the issued token |
| Script in a comment | Bodies stored verbatim, rendered as text | A comment with `<script>` and `onerror` produced no dialog and no injected nodes in Chromium |
| SQL injection | Every value from the network is a bound parameter | No interpolation of untrusted values anywhere in `src/` |
| CSRF | `SameSite=Lax`, plus an Origin check on every state-changing POST | A self-submitting form on another origin arrived with no session; an attacker `Origin` gets `403` |
| Clickjacking | `X-Frame-Options: DENY` and `frame-ancestors 'none'` | Headers present on every response |
| Open redirect | Same-origin check on the one user-supplied redirect target | `//evil.example` and `/\evil.example` both fall back |
| Reaching the owner's page | `OWNER_EMAIL`, checked server-side | A student gets `404`, not `403` — they should not learn it exists |

## Known gaps, deliberately

**Comment flooding.** Nothing limits how many comments one account can post. It
requires a paying account, so the blast radius is one customer who can be
removed, and the owner can delete anything. Worth adding if it ever happens;
not worth pre-building.

**No full Content-Security-Policy.** `script-src` needs per-request nonces
threaded through every page, and a strict `frame-src` would break the
`custom-embed` video host — whose point is a provider we have never heard of. A
policy that breaks the product is one the buyer deletes. The directives that
work without that cost are set: `form-action`, `base-uri`, `object-src`,
`frame-ancestors`.

**Lesson Markdown is rendered as HTML.** That is the owner's own content from
their own repository, and it is how a lesson embeds anything interesting. A
student's comment is never treated this way, and the two must not be confused.

**The claim link is as strong as the student's inbox.** Anybody holding the link
can claim the purchase. It is single-use, expires in thirty days, and is the
only route in for somebody who bought without an email address.

## Things that were wrong and are now fixed

**`SESSION_SECRET` was documented but unread.** Tokens were hashed with a
hardcoded key. Not a break — the tokens are 256 bits of randomness either way —
but a documented step that does nothing leaves somebody believing in protection
they do not have.

**Open redirect on the moderation form.** `startsWith('/')` passes
`//evil.example`, which `new URL()` resolves to another host. Replaced with a
resolve-and-compare-origin check.

**An unused dependency carrying a SQL-injection advisory.** `drizzle-orm` was in
`package.json` and imported nowhere. Removed. `postcss` is pinned forward past
its advisories with an override.

## Two lessons worth keeping

**Do not compare against `request.url`.** Next rewrites it to `localhost`, so an
origin check written that way rejects every legitimate request. The host the
browser addressed is in `Host`, or `X-Forwarded-Host` behind a proxy. This was
caught only by testing the running site — it passed unit tests and would have
failed in production on the first request.

**Do not build redirects from `course.config.ts`.** `site.url` is typed in by
hand at setup. If it is wrong, every form submission sends students to somebody
else's website, and nothing explains why. Redirects use the request's own host.
