# Course platform — brief for a new repository

You are starting a **separate** codebase. It is not part of the funnel kit and must never
import from it. The two connect over HTTP, once, at the moment somebody buys.

Read this whole file before writing anything.

---

## 1. What this is

A place to hold a video-based course: lessons, written material, checklists, and a record
of who has access and how far they have got.

It is built for one customer (Justin) and **templated to sell**, the same way the funnel
kit was. That second half is most of the work and it is invisible while you build the
first half. Anything you hardcode for Justin is a thing a buyer will have to find and
change, so put it in a config file with his values in it rather than in the code.

### The commercial constraint, which is a technical constraint

The product being sold is **a platform template that runs on the buyer's own accounts**.
The pitch is: pay for Vercel and your coding agent, not for a stack of monthly
subscriptions. So every dependency you add has to survive this question:

> Does adding this mean a buyer now needs a paid account they did not need before?

If yes, it needs a very good reason, a documented free alternative, or it does not go in.
This is the single rule that most shapes what you build.

**Video hosting is where this gets hard, and you should settle it before writing code.**
Video is the one thing that is genuinely expensive to serve. Serving it from Vercel's
bandwidth is the costly option people discover too late. Research the real options,
price them at a realistic size (say 20 lessons, 15 minutes each, 200 students), and put
the comparison to the owner as a decision rather than picking one silently. Expect the
honest answer to be that video hosting is the one subscription that cannot be avoided,
and that the product should let the buyer choose their provider rather than bake one in.

---

## 2. How the funnel talks to this

The funnel (a separate repo, `dorothydawn/funnel-kit`) sells things. When somebody buys a
product whose fulfillment is a course, the funnel calls this platform to grant access.

**The adapter on the funnel side does not exist yet.** This brief describes the contract
both sides should be built to. If you design something different, say so clearly — the
funnel end has not been written and can still move.

### The call

One HTTP POST from the funnel to this platform, on purchase.

```
POST /api/enrol
X-Funnel-Signature: <hex HMAC-SHA256 of the raw body, shared secret>

{
  "orderId":        "ord_...",     // the funnel's primary key. THE IDEMPOTENCY KEY
  "email":          "a@b.com",     // may be null: the funnel does not force an email
  "productIds":     ["course-x"],  // what was bought. May contain several
  "amountMinorUnits": 29700,
  "currency":       "usd",
  "purchasedAt":    "2026-09-18T12:00:00.000Z"
}
```

### Five things about that call, each of which will bite you if ignored

**1. It will arrive more than once, and you must not enrol twice.**
The funnel confirms every payment from two racing entrances — Stripe's webhook and the
customer's browser returning — and a database constraint decides which one wins. On top
of that, networks lose responses and retries happen. Treat `orderId` as a unique key and
make the endpoint an upsert. Returning `200` to a duplicate is correct behaviour, not a
shortcut.

**2. Verify the signature against the RAW body, before parsing.**
Same discipline the funnel uses for Stripe. Parse first and you are verifying something
other than what was sent. Reject anything unsigned with a `401` and no detail.

**3. The customer has already paid when you are called.**
If enrolment fails, somebody has been charged and has nothing. You cannot fail the
payment — the money is gone. So this endpoint must be safe to retry, and it should be
loud when it fails rather than silent. Decide and document what a buyer should see on the
thank-you page while enrolment is pending.

**4. Email may be null and is not a user account.**
The funnel does not require an email to take a payment. Do not assume you can key
anything on it. If your access model needs an identity, the `orderId` is the only value
guaranteed to be there — design the claim flow around a link carrying a token you issue,
not around an email you might not have.

**5. Refunds exist and this call does not cover them.**
The funnel tracks refunds (`status` becomes `refunded` or `partially_refunded`). Whether
a refund revokes course access is a **product decision for the owner, not a technical
default**. Ask. If the answer is yes, that is a second endpoint and it has all the same
idempotency requirements.

---

## 3. Stack, so the two repos feel like one product

Match the funnel kit. A buyer who owns both should not have to learn two codebases.

- Next.js 15 (App Router), React 19, TypeScript **strict**, including
  `noUncheckedIndexedAccess`
- Postgres, accessed with Drizzle. **Plain SQL migrations** with a hand-written runner —
  no migration framework
- Tests in Vitest against PGlite (Postgres compiled to WASM, in-process), so `npm test`
  needs nothing installed
- Deployed on Vercel, database on Neon
- `AGENTS.md` at the root as the entry point for any coding agent, because that is how the
  buyer will actually work on it

### Neon cost, since it drives the "no subscriptions" promise

Neon's free plan is 100 CU-hours/month and 0.5 GB of storage, and compute scales to zero
after five minutes idle. A course platform's database is small and mostly asleep, so the
free plan is a realistic permanent home for a single course. Storage is the thing that
creeps — keep video **out** of Postgres, and be careful about anything per-view that
writes a row.

---

## 4. What NOT to build

The funnel kit's most expensive mistake was building more than it had buyers for. Do not
repeat it. Out of scope until somebody asks:

- Payments of any kind. **The funnel does that.** This platform never touches Stripe
- Certificates, badges, gamification, streaks
- Discussion forums, comments, community
- A drag-and-drop course builder. Content is files in the repo, edited by an agent —
  same as the funnel kit's `content/` directory, and the same pitch
- Multi-tenancy. One buyer, one deployment, one course library. That is the product
- An email system. If it needs to send, reuse the funnel kit's approach rather than
  inventing one

---

## 5. Decisions the owner needs to make, not you

Put these back as questions rather than guessing:

1. **Video hosting**, priced (see section 1)
2. **Does a refund revoke access?**
3. **How does a student get in** — a magic link, a password, a token in a URL? This is the
   security surface of the whole product and it should be chosen deliberately
4. **Is progress tracked?** Checklists imply saved state per student, which implies
   identity, which is a meaningful step up in scope
5. **Can one deployment hold more than one course?** Cheap to allow now, expensive to
   retrofit

---

## 6. How to work

- `npm run check` (typecheck, lint, tests) must pass before claiming anything is done
- **A green test suite you wrote proves only that the code agrees with your assumptions.**
  The funnel kit shipped several defects behind green suites for exactly this reason.
  Before saying something works, name the thing outside the repo that agrees with you —
  a real request, a real video that actually plays, a real deployment — and run it
- Write the failing test first when fixing anything
- Keep the commit history readable. The owner reads it
