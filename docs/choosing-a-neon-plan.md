# Choosing your database plan

Your database stores accounts, who bought what, progress, and comments. It does
**not** store video, so it stays small. This platform uses [Neon](https://neon.com),
a Postgres host with a free plan that is genuinely free — no card, no trial
period.

Most people reading this should start on the free plan. This page is here so you
can tell whether you are one of the people who shouldn't.

## What free actually gets you

| | Free | Launch (the next one up) |
|---|---|---|
| **Cost** | $0 | Pay per use, roughly $5–25/mo at course scale |
| **Storage** | 0.5 GB | Unlimited, $0.35/GB-month |
| **Compute** | 100 CU-hours/month | Unmetered, $0.106/CU-hour |
| **Sleeps when idle** | Yes, after 5 min | Yes, configurable |
| **If you run out** | **Database suspends until next month** | You get a bill |

Two numbers matter, and only one of them is likely to bite you.

**Storage: not your problem.** 5,000 students across 20 lessons is about **8 MB**
of progress data. Add accounts and comments and you are still comfortably under
50 MB, against a 500 MB limit. You would need to be very successful indeed, for
years, to fill it.

**Compute: this is the one to watch.** Neon bills for time your database is
*awake*. It falls asleep after five minutes of nobody using it and wakes up
instantly when somebody arrives. The free plan gives you 100 CU-hours a month,
which at the free plan's size works out to roughly **400 hours of being awake**,
out of about 730 hours in a month.

So the real question is not how many students you have. **It is how spread out
they are.**

- 500 students who all watch on a Tuesday evening → barely any awake time → free
  plan is fine.
- 500 students scattered across every timezone, dipping in at all hours → the
  database rarely gets five quiet minutes → it stays awake → you may run out.

## The part worth knowing before you choose

If you exhaust the free compute allowance, **your database suspends until the
next billing cycle**. Not slower. Off. Your students see errors and your course
is down, potentially for weeks.

Nothing is deleted, and upgrading restores it immediately — but if it happens
mid-launch, it happens at the worst possible moment and you may not be watching.

## How to decide

**Start on Free if:**
- You are launching to a list of a few hundred or fewer, or
- Your audience is concentrated in one or two timezones, or
- You are still building and have no students yet — which is almost everyone
  reading this on day one.

**Start on Launch if:**
- You are launching to a large audience at once (a big list, a big following),
  or
- Your students are spread worldwide, or
- The course going down for a week would cost you more than $25 would.

**Switch from Free to Launch when:** Neon's dashboard shows you past about 70% of
your compute allowance before the month is out. Check it in week one of a launch,
then monthly. Upgrading takes a click and no migration.

Set it up in `docs/setup.md`. The platform behaves identically either way — the
plan is a billing setting on Neon's side, not something this code knows about.

## If you would rather not use Neon at all

Anything that speaks Postgres will work: Supabase, Railway, a Postgres server you
run yourself. Change `DATABASE_URL` and the platform will not notice the
difference. Neon is the default in the docs because its free plan is the most
generous and it sleeps when idle, which is what makes $0 realistic.
