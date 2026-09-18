# Choosing how your emails get sent

The platform sends a small number of emails: sign-in links, a welcome message
when somebody buys, and a nudge when a comment is waiting for approval.

It does not send marketing. Your funnel does that. So the volumes here are
smaller than you might expect, and most owners will never pay anything.

## The number that matters is the daily one

Every free option has a **daily** cap of around 100 emails, and that is what
actually catches people out — not the monthly limit.

A launch is the problem. If 300 students buy on Tuesday and all try to sign in
that evening, that is 300 emails in a few hours. On any free tier, the 101st
person does not get their link, and you find out when they email you asking why
they cannot get in.

Steady-state is fine. **Launch day is where free tiers break.**

## The options

| | Cost | Daily cap | Setup | Good for |
|---|---|---|---|---|
| **Gmail** (your normal account) | Free | **100/day via SMTP** | Easy — an app password | Getting started, small courses |
| **Google Workspace** | From ~$7/user/mo | 2,000 recipients/day | Easy if you already have it | Anyone already paying for it |
| **Resend** free | Free | 100/day, 3,000/month | Medium — verify a domain | Small courses, proper deliverability |
| **Resend** Pro | $20/mo | No daily cap, 50,000/month | Same as above | Launches, anything over a few hundred students |

Resend beyond Pro: $0.90 per 1,000 emails over 50,000. You are very unlikely to
reach it — 50,000 emails is roughly 15,000 students signing in three times each.

## What it costs you in practice

| Your size | What you need | Cost |
|---|---|---|
| Under ~100 students | Gmail or Resend free | **$0** |
| A few hundred, trickling in | Resend free | **$0** |
| A few hundred arriving at once | Resend Pro, at least for launch month | **$20** |
| Thousands | Resend Pro | **$20/mo** |

If you do hit the point where this costs money, you are selling enough courses
that $20 is not the problem. And you can switch on Resend Pro for one month and
back down again.

## Gmail's catch

Sending through your own Gmail is free and takes five minutes. Two things to
know before you rely on it:

- **100 emails a day through SMTP**, which is lower than the 500 Gmail allows
  from the web interface. The limit resets on a rolling 24-hour basis, not at
  midnight.
- Sign-in links sent from a personal Gmail are more likely to land in spam than
  ones sent from your own verified domain. For a student who cannot get into
  something they paid for, that is a bad first experience.

Good for starting. Worth moving off before a launch.

## How to decide

1. **Just setting up, no students yet?** Gmail. It takes five minutes and costs
   nothing. You can change it later in one config line.
2. **Have a domain and want links that arrive reliably?** Resend free.
3. **About to launch to a list?** Resend Pro for that month. Assume everybody
   signs in on day one, because they do.

Set it in `course.config.ts`:

```ts
email: {
  provider: 'gmail',   // or 'resend', 'smtp', 'ses'
  from: 'hello@yourdomain.com',
}
```

Your credentials go in environment variables, not in that file. See
[setup](./setup.md).

## If you would rather use something else

Anything that speaks SMTP works — set `provider: 'smtp'` and supply the details.
Amazon SES is the cheapest at volume by a wide margin (pennies per thousand) and
the most awkward to set up; it is there if you want it.

---

*Prices last checked 2026-09-18. See [pricing](./pricing/README.md) — if that was
a while ago, check before relying on it.*
