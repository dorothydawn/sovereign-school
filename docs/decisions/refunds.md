# Refunds and revoking access

**Status: open.** Built so it is possible. Switched off by default. No decision
needed to ship.

## The question, which is really four questions

It is tempting to treat "does a refund revoke access" as one decision. It is
four, and only the first is expensive.

**A. Can access ever be taken away once granted?**
Architectural. The access check either understands a revoked state or it does
not, and retrofitting that means revisiting every query that asks whether
somebody may watch something.

**B. Who sets the policy — this template, or each owner?**
Each owner. It is a moral call about their own customers, and course businesses
differ honestly on it.

**C. What is the policy?**
Revoke on refund, never revoke, or something conditional.

**D. What about partial refunds, and what does a revoked student see?**
Details, decidable any time.

## What was decided

**A is yes** — the data model supports revocation from the first migration.
Enrolments carry a state rather than merely existing, and refunds are always
recorded whether or not they act on anything.

**B is the owner**, via `access.refundRevokesAccess` in `course.config.ts`.

**C and D are deliberately unanswered.** Shipped as `false`. Turning it on later
is a config change that takes effect immediately, with no migration and no
backfill, because the refund history is already there.

## Why this way

The expensive half and the contentious half of this question are different
halves. Building for revocation costs almost nothing now and a great deal later.
Deciding the policy costs nothing at any point.

So we did the expensive thing early and left the cheap thing open, rather than
blocking the build on a question that deserves a slower answer.

## If you turn it on

A full refund moves the enrolment to revoked and the student loses access at
their next request. Partial refunds are governed separately by
`partialRefundRevokesAccess`, off by default, on the reasoning that a partial
refund is usually a discount after the fact rather than a withdrawal.

Consider what the student should see. "Your access ended because your order was
refunded, contact us at —" is kinder than a login that silently stops working,
and generates less support mail.
