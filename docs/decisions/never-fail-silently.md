# The platform must not switch off without telling anybody

**Status: settled.** A requirement, not a feature.

## The problem

Neon's free plan suspends a project's database when it exhausts its monthly
compute allowance. It stays suspended until the next billing cycle.

**Neon's spending notifications are a paid-plan feature.** A free-plan owner is
not warned beforehand and is not told when it happens. The first they know is a
student emailing to say the course is broken — or, more likely, a student who
paid and simply gives up.

An owner selling courses from this platform cannot be left to find that out by
accident.

## What was decided

The platform watches its own usage and warns the owner before the ceiling.

- Estimated compute is shown in the owner dashboard as a percentage of the
  allowance
- An email goes out at **70%** and at **90%**
- The message says plainly what happens at 100% and that upgrading is one click

## How, given Neon will not tell us

Neon's consumption API (`/consumption_history/v2/projects`) returns real
CU-hours, but **it is not available on the Free plan** — it returns 403. Which
means the owners who most need the warning are the ones who cannot have the real
number.

So we estimate it. Compute time is billed for as long as the database is awake,
and it sleeps after five minutes idle. So:

- Record the timestamp of database activity, rounded down to a five-minute bucket
- Distinct buckets in a month ≈ awake time
- Awake hours × compute size ≈ CU-hours

One small table, one row per five-minute bucket — at most 8,928 rows a month,
pruned monthly. The cost of measuring is far below what it measures.

On a paid plan, read the real figure from Neon's API and use the estimate only as
a fallback.

## Built, and where it lives

`src/lib/usage/database.ts` measures and `src/lib/usage/notify.ts` warns.
Activity is recorded in `resolveSession`, which every signed-in request passes
through, and skipped when this process has already recorded the current
five-minute window — so it usually costs nothing at all.

The check runs when the owner opens their page rather than on a schedule. A
buyer should not have to configure cron to find out their site is about to
switch off.

`alerts_sent` keys a warning by kind, threshold and month, and the insert is the
claim: whoever wins sends the message, so two simultaneous requests cannot both
email. Crossing 70% is one piece of news and 90% is another, and next month
starts again.

`checkFreeTierCeilings` never throws. It runs inside page loads, and a failure
to warn must not be the thing that takes the course offline.

Confirmed against a real database: five page loads in one window recorded one
bucket; at 75% the owner's page warned and a single alert row appeared; three
reloads added nothing; pushing to 92% produced a second warning and no more.

## Honesty about the estimate

The dashboard must say it is an estimate, and that it cannot see Neon's meter on
the Free plan. An owner who believes a wrong number is worse off than one who
knows the number is approximate.

Tune it to warn early rather than late. A false alarm costs somebody a glance at
a dashboard; a missed alarm takes their course offline for weeks.

## The wider principle

This applies beyond Neon. Anywhere a free tier can silently stop the product
working — email daily caps, video host bandwidth — **the platform should notice
and say so.**

The product's promise is that you can run this on free tiers. That promise is
only honest if the owner finds out before their customers do.
