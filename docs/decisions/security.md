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

**Comment flooding — closed.** This was first left open on the reasoning that
an attacker needs a paying account, so the damage is one removable customer.
That reasoning was wrong, and the arithmetic is why: a comment can be 4,000
characters and a free Neon database is 500 MB, so roughly 125,000 comments fills
it. A full database stops accepting sign-ins and purchases, not just comments.
At one a second that is about 35 hours of scripting, and the entry price is a
single course purchase.

`comments.maxPerHour` now caps it, defaulting to 20 — generous for a person,
useless for a script. Counted from the comments table including removed rows, so
deleting spam does not hand the spammer a fresh allowance. The owner is never
limited on their own site.

Verified live: 30 scripted attempts produced 20 comments, the owner's 30 all
went through, and the refused attempt explains itself.

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

## An account takeover, found by a question from the funnel side

The funnel's agent asked us to confirm that a repeat buyer lands in one account.
Checking that turned up something worse.

A claim link could sign somebody into an account that already existed. The
funnel shows that link to **whoever paid**, so the attack was: buy the cheapest
course, type another student's address at checkout, open the link you are handed,
and you are signed in as them with access to everything they own. No access to
the victim's inbox at any point. Confirmed against a running server before it was
fixed.

The cause was that account lookup happened at claim time and merged by email,
treating "I bought something with this address" as proof of owning it. It is not.

Now the account is found or created at **purchase**, and a claim link grants a
session only when that purchase created the account — or when the person holding
it is already signed in as that student. Otherwise the course is attached and
they are sent to sign in, which is the only thing that proves the address.

This also fixed a plain bug in the same place: a second purchase did not reach
the student until they opened its own claim link, so an upsell bought minutes
after the main course simply did not appear.

Re-run after the fix: the attacker gets no session, is redirected to sign-in, and
the victim's account is untouched. A signed-in student's upsell now appears with
no link opened at all.

## Two lessons worth keeping

**Do not compare against `request.url`.** Next rewrites it to `localhost`, so an
origin check written that way rejects every legitimate request. The host the
browser addressed is in `Host`, or `X-Forwarded-Host` behind a proxy. This was
caught only by testing the running site — it passed unit tests and would have
failed in production on the first request.

**Do not build redirects from `course.config.ts`.** `site.url` is typed in by
hand at setup. If it is wrong, every form submission sends students to somebody
else's website, and nothing explains why. Redirects use the request's own host.
