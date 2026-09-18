# Sovereign School

A course platform that runs on **your** accounts. You pay your hosting provider
and your video host directly. There is no subscription to this software and
nobody takes a cut of what you sell.

It is a template. You own the copy you bought, and you change it — or have your
coding agent change it — as much as you like.

## What it does

- Holds video lessons, written material and checklists, across as many courses
  as you want to sell
- Gives students one login for everything they have bought from you
- Tracks what they have finished and remembers where they stopped watching
- Comments under each lesson, moderated, on or off as you prefer
- Takes enrolments automatically from your sales funnel

## What it deliberately does not do

- **Take payments.** Your funnel does that. This platform never touches Stripe
- Charge you per student, per course, or per month
- Host your video — you choose where that lives, and keep your own account with
  them

## Getting started

If you have a coding agent, point it at [`AGENTS.md`](./AGENTS.md) and it will
know what to do.

If you are setting it up yourself, start with [`docs/setup.md`](./docs/setup.md).

Two choices are worth reading about before you begin, because they are the only
two that cost money:

- [Where your videos live](./docs/choosing-a-video-host.md) — from free upwards
- [Which database plan](./docs/choosing-a-neon-plan.md) — free is realistic for
  most people

Everything else you configure lives in one file:
[`course.config.ts`](./course.config.ts).

## Working on it

```bash
npm install
npm run check   # typecheck, lint, tests
npm run dev
```

Tests need nothing installed — they run Postgres compiled to WebAssembly.
