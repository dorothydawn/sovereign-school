# Notes for the coding agent

You are probably reading this because somebody bought this template and asked you
to set it up or change it. They may never have opened GitHub before. Assume that.

## What this is

A course platform that runs on its owner's own accounts. They pay their hosting
provider and their video host directly; there is no platform in the middle
taking a cut, and no subscription to this software. Keeping it that way is the
point of the product, so it constrains what you may add.

Students arrive having already paid, somewhere else. A separate repository — the
funnel — sells things and calls this one to grant access.

## Who you are working for

The owner is a course creator, not a developer. Two things follow.

**Talk in outcomes, not mechanisms.** "Your students will be able to sign in with
a link sent to their email" — not "I have added a magic-link auth provider."

**Never hand them a decision they have no way to make.** Some choices genuinely
are theirs: where videos live, whether comments are on, which database plan,
whether a refund revokes access. Those have a document each in `docs/`, written
for them and not for you — read it, summarise the trade-off in two sentences,
recommend one, and say why. Everything else, decide yourself and tell them what
you did.

## The rule that shapes everything

> Does adding this mean the owner now needs a paid account they did not need
> before?

If yes, it needs a very good reason, a documented free alternative, or it does
not go in. This is not a style preference. It is the product's entire pitch, and
a dependency that quietly adds a subscription damages what they bought.

Prefer the standard library. Passwords use node's `scrypt` rather than bcrypt or
argon2, because those are native modules and a buyer's install failing for
reasons neither they nor you can diagnose is worse than the difference between
the algorithms. The front matter reader is forty lines rather than a YAML
dependency. Resend is one `fetch` rather than an SDK.

When you genuinely need something new, say what it costs before you add it.

## Where things are

| Path | What it is |
|---|---|
| `course.config.ts` | **Everything specific to one course business.** The only file most owners ever touch |
| `src/config/types.ts` | The shape of that config, with every option explained |
| `content/<course>/` | Lessons, as Markdown files. `01-name.md` sets the order |
| `docs/` | Written for the owner. Plain English, no jargon |
| `docs/decisions/` | Why things are the way they are. Read before changing an architectural choice |
| `docs/pricing/` | Every price quoted anywhere, with the date it was checked |
| `docs/funnel-integration.md` | The whole contract, for whoever builds the selling side |
| `migrations/` | Plain SQL, applied in filename order |
| `src/lib/db/` | The migration runner and the database client |
| `src/lib/enrol/` | The funnel's call, and reconciling purchases the config did not map |
| `src/lib/auth/` | Claim, sessions, sign-in, access checks, who the owner is |
| `src/lib/comments/` | Posting, visibility, moderation, the rate limit |
| `src/lib/content/` | Reading lessons off disk |
| `src/lib/video/` | Turning a lesson's video id into an embed, per host |
| `src/lib/email/` | Providers, and counting sends against the daily cap |
| `src/lib/usage/` | Estimating database usage and warning before a free tier stops the site |
| `src/lib/http/` | Same-origin checks and safe redirects. **Read the comments before touching** |

**Anything the owner will want to change later goes in `course.config.ts`, not in
the code.** This repository gets resold. Anything you hardcode is something a
future buyer has to hunt for.

## Settings live in two places, and the split matters

`course.config.ts` holds everything the owner chooses and nothing secret. It is
committed to their repository and they will share that repository with you.

**Secrets are environment variables.** Never write one into `course.config.ts`, a
lesson, or a commit — not even briefly, not even on a branch. If you need to show
an owner what to set, name the variable and let them paste the value in.

Two are easy to miss because nothing obviously breaks without them:

- **`OWNER_EMAIL`** decides which account is the owner's. Unset means nobody is,
  so `/owner` returns 404 for everybody and no free-tier warnings are sent.
- **`SESSION_SECRET`** keys the hashing of session, claim and sign-in tokens.
  Changing it signs everybody out and invalidates unused links, so it is set once
  at setup and left alone. In production an unset value throws rather than
  silently falling back.

`docs/setup.md` lists every variable the code reads. **When you add one, add it
there in the same change** — a variable that exists only in the code is one the
buyer will never set.

## Traps that have already caught somebody here

Each of these looked right, passed its tests, and was wrong. They are the most
useful thing in this file.

**`count(*)` is a string in real Postgres and a number in PGlite.** Postgres
returns `bigint` as a string to avoid losing precision; PGlite does not. So a
count compared against a number passes every test and fails in production. Cast
aggregates explicitly: `count(*)::int`.

**`request.url` is `localhost` whatever host the browser used.** Next rewrites
it. An origin check written against it rejects every legitimate request — it did
here, and only a live test caught it. The real host is in `Host`, or
`X-Forwarded-Host` behind a proxy. See `src/lib/http/same-origin.ts`.

**Do not build anything a customer will click from `courseConfig.site.url`.** It is typed in by hand
at setup. If it is wrong or still the placeholder, every form submission sends
students to somebody else's website with nothing explaining why. Use
`redirectTo()` from `src/lib/http/redirect.ts`, which uses the request's own
host.

**`target.startsWith('/')` is not a same-origin check.** `//evil.example` passes
it and `new URL()` resolves it to another host; so does `/\evil.example`. Use
`safeRedirectPath()`.

**Checking before writing is not enough when requests arrive at once.** The
funnel delivers from two racing sources by design, so concurrency is the normal
case. Reading "does a token exist" and then inserting one produced eight live
claim links for one purchase. Anything that must be true exactly once belongs in
a database constraint, not in application logic.

**A GET must never spend a one-time token.** Mail scanners follow every URL in an
email, browsers prefetch, chat apps fetch previews. The claim and sign-in links
open a page with a button; the POST does the work.

**Email addresses are stored lowercase, and the database enforces it.** The
funnel sends whatever the customer typed. Storing `Student@Example.com` verbatim
while sign-in normalises to lowercase means the account is never found — and
because the "if that address has an account, a link is on its way" message is
deliberately identical either way, the student is locked out silently, forever.

**A comment is not a lesson.** Lesson Markdown is the owner's own content and is
rendered as HTML deliberately. A comment is a stranger's typing and is rendered
as text, always. Never pass a comment to `dangerouslySetInnerHTML`, and never
add a Markdown renderer to comments without reading
`docs/decisions/security.md` first.

## Security rules that must not be relaxed

`docs/decisions/security.md` has the full picture and how each was verified.
These are the ones a change is most likely to break:

- **Every value from the network is a bound parameter.** No exceptions, no
  string interpolation into SQL.
- **The funnel's signature is verified against the raw body, before parsing.**
  Parse first and you are verifying something other than what was sent.
- **Access is checked on every page and every write**, not once at the door. A
  session is not a course.
- **A wrong password and an unknown address answer identically**, and take the
  same time. Telling them apart hands over a list of who has an account.
- **The owner's page returns 404 to a student**, not 403. They should not learn
  it exists.
- **State-changing POSTs carry an origin check**, on top of the SameSite cookie.
  `/api/enrol` is deliberately exempt: the funnel is server-to-server and sends
  no Origin.

## Prices go stale, and quoting a wrong one does real damage

Every price this repository quotes is in `docs/pricing/README.md` with the date
it was verified.

- **Under 90 days** — use it, and say when it was checked.
- **Over 90 days** — fetch the source and confirm before advising anybody, then
  update the table and the docs that cite it.
- **Never quote a price from memory.** You do not reliably know today's date
  relative to what you were trained on, and free tiers shrink.

If a price has moved enough to change the advice, **tell the owner** rather than
quietly editing the table. They may have chosen that provider because of the old
number.

## Free tiers must never fail silently

The product's promise is that it runs on free tiers. That promise is only honest
if the owner hears about a ceiling before their students do.

Neon suspends a free database when its monthly compute runs out and warns
nobody, because spending alerts are a paid feature. Email providers stop sending
at about 100 a day. Both are watched, and the owner is emailed once per threshold
per month. If you add anything with a free-tier limit that can stop the product
working, it needs a warning path too.

See `docs/decisions/never-fail-silently.md`.

## Doing the usual jobs

**Add a lesson.** A Markdown file in `content/<course's contentDir>/`, named
`NN-slug.md`. Front matter takes `title`, `video`, and optionally `videoHost` to
override the course's.

**Add a course.** An entry in `courses`, a folder under `content/`, and an entry
in `productToCourses` mapping the funnel's product id. Students who already
bought it get access without the funnel re-sending anything.

**Change video host.** One line in `course.config.ts`, plus whatever credentials
that host needs — `docs/choosing-a-video-host.md` has the table.

**Add a config option.** Type and comment it in `src/config/types.ts`, give it a
value in `course.config.ts`, and assert something about it in
`src/config/config.test.ts`. A buyer edits that file by hand; a typo there is the
likeliest way they break their own site.

**Add a migration.** A new `NNNN_name.sql` in `migrations/`. Never edit one that
has shipped. If you are adding a constraint, repair existing data in the same
file — migration `0004` is the worked example.

## Working here

- `npm run check` — typecheck, lint, tests. Must pass before you tell anyone
  something is done.
- `npm test` needs nothing installed. Tests run against Postgres compiled to
  WebAssembly, in process.
- `npm run migrate` applies migrations. Safe to run repeatedly.
- TypeScript is strict, including `noUncheckedIndexedAccess`. Do not loosen it.
- Migrations are plain SQL with a hand-written runner. No migration framework.
- Write the failing test first when fixing something, and make it fail for the
  right reason before you fix it.

## Before you tell the owner it works

A test suite you wrote proves only that the code agrees with you. Both can be
wrong together, and on this codebase they repeatedly have been: the eight claim
links, the silently locked-out student, the origin check that would have
rejected every request in production. Every one of those passed its tests.

So before you say something works, name the thing **outside this repository**
that agrees with you, and go and check it:

- A real HTTP request that got a real response
- A real video that actually played in a browser
- A real deployment a real person can open

If you have not done that, say "the tests pass" — which is true — rather than
"it works", which you do not know yet.

When a test passes first time on something subtle, break the thing it guards and
confirm the test fails. A test that cannot fail is not protecting anything.

## The bit that is easiest to get wrong

Students arrive because they **already paid**. The funnel sends one HTTP call to
`/api/enrol`, and that call is the only thing between a paying customer and the
thing they bought.

It will arrive more than once for the same purchase. It may arrive with no email
address. If it fails, somebody has been charged and has nothing, and you cannot
un-charge them.

Verify the signature against the raw body before parsing, treat `orderId` as the
unique key, make the endpoint an upsert, and return `200` to duplicates — that is
correct, not a shortcut. A product the config does not recognise is recorded and
flagged, never rejected: refusing leaves somebody who paid with nothing.

`docs/decisions/enrolment.md` has the detail. Do not redesign this endpoint
without reading it.
