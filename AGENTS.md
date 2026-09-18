# Notes for the coding agent

You are probably reading this because somebody bought this template and asked you
to set it up. They may never have opened GitHub before. Assume that.

## What this is

A course platform that runs on its owner's own accounts. They pay their hosting
provider and their video host directly; there is no platform in the middle
taking a cut, and no subscription to this software. Keeping it that way is the
point of the product, so it constrains what you may add (see **The rule** below).

## Who you are working for

The owner is a course creator, not a developer. Two things follow.

**Talk in outcomes, not mechanisms.** "Your students will be able to sign in with
a link sent to their email" — not "I have added a magic-link auth provider."

**Never hand them a decision they have no way to make.** Some choices genuinely
are theirs: where videos live, whether comments are on, whether refunds revoke
access. Those have a document each in `docs/`, written for them and not for you —
read it, summarise the trade-off in two sentences, recommend one, and say why.
Everything else, decide yourself and tell them what you did.

## The rule that shapes everything

> Does adding this mean the owner now needs a paid account they did not need
> before?

If yes, it needs a very good reason, a documented free alternative, or it does
not go in. This is not a style preference. It is the product's entire pitch, and
a dependency that quietly adds a subscription damages what they bought.

When you genuinely need something new, say what it costs before you add it.

## Where things are

| Path | What it is |
|---|---|
| `course.config.ts` | **Everything specific to one course business.** The only file most owners ever touch |
| `src/config/types.ts` | The shape of that config. Explains each option in the comments |
| `content/` | Lesson text, as Markdown files. One folder per course |
| `docs/` | Written for the owner, not for you. Plain English, no jargon |
| `docs/decisions/` | Why things are the way they are. Read before changing an architectural choice |
| `src/` | The application |

**When you need to add something the owner will want to change later, it goes in
`course.config.ts`, not in the code.** This repo gets resold. Anything you
hardcode is something a future buyer has to hunt for.

## Working here

- `npm run check` — typecheck, lint, tests. Must pass before you tell anyone
  something is done.
- `npm test` needs nothing installed. Tests run against Postgres compiled to
  WebAssembly, in process.
- TypeScript is strict, including `noUncheckedIndexedAccess`. Do not loosen it.
- Migrations are plain SQL with a hand-written runner. No migration framework.
  Write the SQL.
- Write the failing test first when fixing something.

## Before you tell the owner it works

A test suite you wrote proves only that the code agrees with you. Both can be
wrong together, and this has happened on this codebase's sibling project more
than once.

So before you say something works, name the thing **outside this repository**
that agrees with you, and go and check it:

- A real HTTP request that got a real response
- A real video that actually played in a browser
- A real deployment that a real person can open

If you have not done that, say "the tests pass" — which is true — rather than
"it works", which you do not know yet.

## The bit that is easy to get wrong

Students arrive here because they **already paid**, somewhere else. The funnel
sends one HTTP call to `/api/enrol` and that call is the only thing standing
between a paying customer and the thing they bought.

It will arrive more than once, sometimes several times, for the same purchase.
It may arrive with no email address. If it fails, somebody has been charged and
has nothing, and you cannot un-charge them.

So: verify the signature against the raw body before parsing it, treat `orderId`
as the unique key, make the endpoint an upsert, and return `200` to duplicates —
that is correct, not a shortcut. `docs/decisions/enrolment.md` has the detail.
Do not redesign this endpoint without reading it.
