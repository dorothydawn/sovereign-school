# Choosing your database plan

Your database stores accounts, who bought what, progress and comments. It does
**not** store video, so it stays small. This platform uses [Neon](https://neon.com),
a Postgres host whose free plan is genuinely free — no card, no trial period.

There are two plans worth considering, and the honest summary is: **Free is real,
but it can switch your site off, and Neon will not warn you. Launch costs about
$5–20/month and will.**

## Side by side

| | Free | Launch |
|---|---|---|
| **Monthly fee** | $0 | **$0 — there is no monthly fee** |
| **What you pay** | Nothing | $0.106 per CU-hour, $0.35/GB-month |
| **Realistic cost for a course** | $0 | **$5–20/month** |
| **Storage** | 0.5 GB | Unlimited |
| **Compute** | 100 CU-hours/month | Unmetered |
| **If you run out** | **Suspends until next month** | You get a bill |
| **Warns you first** | **No** | Yes — spending alerts |

The thing most people get wrong about Launch: **it has no minimum fee.** It is
not $19/month. You pay for what you use, and a sleepy course database uses very
little. If nobody visits, you pay almost nothing.

## What you would actually pay on Launch

You are billed for two things, and only one of them matters.

**Compute** — the time your database is *awake*. It sleeps after five minutes of
nobody using it and wakes instantly when somebody arrives. $0.106 per CU-hour.

**Storage** — $0.35/GB-month. Ignore it. 5,000 students across 20 lessons is
about 8 MB, which rounds to nothing. Even a full gigabyte would be 34 cents.

So it comes down to how much of the month your database is awake:

| How busy your course is | Awake per month | Cost |
|---|---|---|
| Very quiet — a handful of students | ~100 hours | **~$3** |
| Quiet — a few students, one timezone | ~200 hours | **~$5** |
| Steady — regular traffic most days | ~400 hours | **~$11** |
| Busy — someone on the site nearly always | ~730 hours | **~$19** |

**Realistic bill: $3–8/month while you are small, $10–20 once you are busy.**

Two honest caveats. Your database **autoscales** — those figures assume it stays
at its smallest size, which is where this kind of workload sits nearly always,
but a genuine hammering scales it up and costs more for as long as it lasts. And
the tier above Launch, called Scale, is **more** expensive per hour, not less
($0.222/CU-hour). You would move there for features like private networking,
never to save money. A course platform stays on Launch indefinitely.

## You may see a "$5 minimum" elsewhere — it is out of date

Neon used to charge a $5/month minimum on Launch. **It was removed in December
2025.** A lot of comparison articles still quote it. If you use $3 of resources,
you are billed $3.

## The part you should know before choosing Free

If a Free project uses up its 100 CU-hours, **the database suspends until the
next billing cycle.** Not slower. Off. Students see errors and cannot get into
something they paid for.

Nothing is deleted and upgrading fixes it within a minute — but **Neon's own
spending notifications are a Launch and Scale feature.** On Free, you are not
told you are close, and you are not told when it happens.

We think that is unacceptable in a product people are selling from, so **this
platform watches it for you** — see below. But the warning we can give you is an
estimate, and Launch gives you the real thing from Neon directly.

## So the free plan is fine when

- You are still setting up, with no students — everyone, on day one
- Your audience is a few hundred and concentrated in one or two timezones
- You would notice quickly and do not mind fixing it

## And you want Launch when

- You are launching to a large list at once
- Your students are spread across the world, so the database rarely gets five
  quiet minutes
- The site going down for a week would cost you more than $20
- You would rather pay $5 than watch a dashboard

There is no migration either way. Upgrading is a click, takes effect
immediately, and nothing in this code changes.

## How the platform warns you

Because Neon will not do this on the Free plan, the platform estimates it:

- Your owner dashboard shows estimated compute used this month, as a percentage
- You get an email at **70%** and again at **90%**
- The warning says what will happen, and that upgrading takes one click

**This is an estimate, not Neon's number.** We measure how long the database is
awake and work backwards; we cannot read Neon's meter on the Free plan, because
the API that reports it is not available there. Expect it to be roughly right and
to err on the cautious side. On Launch, the platform reads the real figure from
Neon instead.

You will not be silently switched off. That was a deliberate requirement.

## If you would rather not use Neon

Anything that speaks Postgres works: Supabase, Railway, a server you run
yourself. Change `DATABASE_URL`. Neon is the default because its free plan is the
most generous and it sleeps when idle, which is what makes $0 realistic.

---

*Prices last checked 2026-09-18. See [pricing](./pricing/README.md) — if that was
a while ago, check before relying on it.*
