# Sovereign School

A course platform that runs on **your** accounts.

You pay your hosting provider and your video host directly. There is no
subscription to this software, nobody takes a percentage of what you sell, and
no company can change the terms, raise the price, or switch it off.

It is a template. You own the copy you bought. You change it — or have your
coding agent change it — as much as you like.

---

## What it costs to run

A real course: 20 lessons of 15 minutes, sold to 200 students.

| | Typical cost |
|---|---|
| Hosting (Vercel) | **$0** — the free plan is enough |
| Database (Neon) | **$0**, or about $5–20/month if you would rather have headroom |
| Video | **$0** on YouTube, or from $12/month somewhere private |
| Emails | **$0** up to roughly 100 a day, then $20/month |
| This software | **$0**, now and always |

Most people starting out pay **nothing**. The first thing that usually costs
money is video, and only if you want it protected from being shared.

Every figure the documentation quotes is in [`docs/pricing`](./docs/pricing/README.md)
with the date it was checked, because prices move and a confident wrong number is
worse than none.

## What it does

- Holds video lessons, written material and checklists, across as many courses
  as you want to sell
- Gives each student one login for everything they have bought from you
- Remembers what they have finished and where they stopped watching
- Comments under each lesson, on by default, moderated only if you want that
- Takes enrolments automatically from your sales funnel
- Tells you **before** a free tier runs out and takes your site down

## What it deliberately does not do

- **Take payments.** Your funnel does that. This platform never touches Stripe
- Charge you per student, per course, or per month
- Host your video — you choose where that lives and keep your own account
- Lock you in. It is Next.js and Postgres. Any developer can work on it, and so
  can any decent coding agent

## Choosing where your videos live

This is the only decision that might cost you money, so the documentation
presents it as a decision rather than making it for you. All seven options are
equally supported and none is the default.

| | Cost at 200 students | Cost at 5,000 | Can videos be shared? |
|---|---|---|---|
| YouTube | $0 | $0 | **Yes — anyone with the link** |
| Vimeo | $25/mo | $25/mo | No, with domain privacy on |
| Bunny | ~$6 | ~$141 | No |
| Mux | ~$1 | ~$1,400 | No |
| Cloudflare Stream | ~$65 | ~$1,505 | No |

Loom and any other host that gives you an embed link are supported too.

[The full comparison](./docs/choosing-a-video-host.md) explains the trade-off,
including why "unlisted" on YouTube does not mean private, and where each option
stops being cheap.

## Getting started

If you have a coding agent, point it at [`AGENTS.md`](./AGENTS.md) and it will
know what to do.

If you are doing it yourself, follow [`docs/setup.md`](./docs/setup.md). It
assumes you have not done any of this before.

Three decisions are worth reading about first — they are the only ones that
involve money:

- [Where your videos live](./docs/choosing-a-video-host.md)
- [Which database plan](./docs/choosing-a-neon-plan.md)
- [How your emails get sent](./docs/choosing-an-email-sender.md)

Everything else you configure lives in one file,
[`course.config.ts`](./course.config.ts), and every setting in it is explained in
plain English next to the setting itself.

## Your lessons are files

A lesson is a Markdown file in `content/`:

```markdown
---
title: Getting started
video: dQw4w9WgXcQ
---

The lesson, written in Markdown.
```

There is no course builder to learn and no editor to log into. You write lessons,
or you tell your agent what you want and it writes them. They live in your
repository alongside everything else, so they are backed up, versioned, and
yours.

## Working on it

```bash
npm install
npm run check   # typecheck, lint, tests
npm run dev
```

Tests need nothing installed — they run Postgres compiled to WebAssembly.

## Why it is built the way it is

Every significant decision is written down in
[`docs/decisions`](./docs/decisions/README.md): what was chosen, what else was
considered, and why. If you or your agent are about to change something
architectural, the reasoning is there — it may still hold, or it may have been
overtaken, and either way you will know which.

That includes [an honest account of the security](./docs/decisions/security.md):
what is defended, how each was verified against a running site, and what is
deliberately left open.
