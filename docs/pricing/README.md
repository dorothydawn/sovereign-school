# Prices quoted in this documentation

Every price this repository quotes to an owner lives in the table below, with the
date it was last verified and the page it came from.

**This file goes stale.** Providers change pricing and free tiers get less
generous. A price quoted confidently and wrongly is worse than no price, because
somebody makes a decision with real money on it.

---

## For the coding agent: keeping this current

**Check the `Last checked` column before you quote any price to the owner.**

- **Under 90 days old** — use it, say when it was checked.
- **Over 90 days old** — fetch the source URL, confirm the figure, and update
  both this table and the doc that quotes it before you advise anybody.
- **You cannot reach the source** — say the price is unverified and give its
  date. Do not guess, and do not quote a figure from your training data. You do
  not know what month it is relative to what you learned.

When you update a row, update the docs that cite it too — they are listed in
`Used in`. Then commit with a message saying what moved and by how much, so the
owner can see it in the history.

If a change is big enough to alter advice — a free tier shrinking, a cheap
provider becoming expensive — **tell the owner rather than quietly editing the
table.** They may have chosen that provider because of the old number.

---

## Video hosting

| Provider | Price | Last checked | Source | Used in |
|---|---|---|---|---|
| YouTube | Free | 2026-09-18 | — | `choosing-a-video-host.md` |
| Vimeo Starter | $12/mo annual, $20/mo monthly | 2026-09-18 | [vimeo.com/upgrade-plan](https://vimeo.com/upgrade-plan) | `choosing-a-video-host.md` |
| Vimeo Standard | $25/mo annual, $41/mo monthly | 2026-09-18 | [vimeo.com/upgrade-plan](https://vimeo.com/upgrade-plan) | `choosing-a-video-host.md` |
| Vimeo Advanced | $75/mo annual, $125/mo monthly | 2026-09-18 | [vimeo.com/upgrade-plan](https://vimeo.com/upgrade-plan) | `choosing-a-video-host.md` |
| Bunny Stream | $0.01/GB storage, $0.005/GB delivery (volume), $1/mo minimum | 2026-09-18 | [bunny.net/pricing](https://bunny.net/pricing/) | `choosing-a-video-host.md` |
| Mux | $0.003/min storage, $0.001/min delivery, first 100,000 min/mo free | 2026-09-18 | [mux.com/pricing](https://www.mux.com/pricing) | `choosing-a-video-host.md` |
| Cloudflare Stream | $5 per 1,000 min stored, $1 per 1,000 min delivered | 2026-09-18 | [Cloudflare docs](https://developers.cloudflare.com/stream/pricing/) | `choosing-a-video-host.md` |

**Vimeo's tier prices could not be read from Vimeo's own page** (it renders in
JavaScript) and came from third-party summaries. Treat them as approximate and
confirm on Vimeo's pricing page before deciding.

## Database

| Provider | Price | Last checked | Source | Used in |
|---|---|---|---|---|
| Neon Free | $0 — 100 CU-hours/mo, 0.5 GB storage, per project | 2026-09-18 | [neon.com/pricing](https://neon.com/pricing) | `choosing-a-neon-plan.md` |
| Neon Launch | No monthly fee. $0.106/CU-hour, $0.35/GB-month | 2026-09-18 | [Neon plans](https://neon.com/docs/introduction/plans) | `choosing-a-neon-plan.md` |

## Email

| Provider | Price | Last checked | Source | Used in |
|---|---|---|---|---|
| Resend Free | $0 — 3,000/mo, **100/day**, 3 domains | 2026-09-18 | [resend.com/pricing](https://resend.com/pricing) | `choosing-an-email-sender.md` |
| Resend Pro | $20/mo for 50,000, then $0.90 per 1,000 | 2026-09-18 | [resend.com/pricing](https://resend.com/pricing) | `choosing-an-email-sender.md` |
| Gmail (free, SMTP) | $0 — **100/day via SMTP** | 2026-09-18 | [Workspace limits](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace) | `choosing-an-email-sender.md` |
| Google Workspace (SMTP) | From ~$7/user/mo — 2,000 recipients/day | 2026-09-18 | [Workspace limits](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace) | `choosing-an-email-sender.md` |

## Hosting

| Provider | Price | Last checked | Source | Used in |
|---|---|---|---|---|
| Vercel Hobby | $0 — 100 GB transfer/mo | 2026-09-18 | [vercel.com/docs/pricing](https://vercel.com/docs/pricing) | `setup.md` |
| Vercel Pro | $20/mo/seat, transfer $0.15/GB on demand | 2026-09-18 | [Vercel regional pricing](https://vercel.com/docs/pricing/regional-pricing) | `setup.md` |
