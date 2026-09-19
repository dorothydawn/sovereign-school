# The enrolment endpoint

**Status: settled.** The contract is fixed and shared with the funnel repo.

> **Building the funnel side?** `docs/funnel-integration.md` has everything you
> need, including a signing test vector.

## The situation

One HTTP POST arrives from the funnel when somebody buys. By the time it arrives,
**the customer has already paid**. If we mishandle it, somebody has been charged
and has nothing, and we cannot reverse the charge from here.

```
POST /api/enrol
X-Funnel-Signature: <hex HMAC-SHA256 of the raw body, shared secret>

{
  "orderId":          "ord_...",     // the funnel's primary key, and our idempotency key
  "email":            "a@b.com",     // MAY BE NULL
  "productIds":       ["course-x"],  // may contain several
  "amountMinorUnits": 29700,
  "currency":         "usd",
  "purchasedAt":      "2026-09-18T12:00:00.000Z"
}
```

## Rules, each of which exists because ignoring it breaks something

**It will arrive more than once.** The funnel confirms payments from two racing
sources — Stripe's webhook and the customer's browser returning — and networks
retry on top of that. `orderId` is unique, the endpoint upserts, and a duplicate
gets `200`. Returning `200` to a repeat is correct behaviour, not a shortcut.

**Verify the signature against the raw body, before parsing.** Parse first and
you are verifying something other than what was sent. Unsigned or badly signed
gets `401` with no detail — an error that explains itself is an error that helps
an attacker.

**Email may be null.** It is not an account, not a key, and not guaranteed.
`orderId` is the only value always present. Identity is built on a token we
issue, never on an email we might not have.

**Failure must be loud.** A silent failure here is a paying customer with
nothing, and nobody finding out until they complain.

## Unknown product ids

If `productIds` contains something `productToCourses` does not map, the customer
has still paid.

**We record the enrolment, mark it unmapped, return `200`, and make it loud** —
rather than rejecting and leaving somebody who paid with nothing. The owner adds
the mapping and the student's access appears, with no re-delivery needed from the
funnel.

That last part is not automatic goodwill: it is `reconcileUnmapped` in
`src/lib/enrol/reconcile.ts`, which runs when a student's library loads and
grants whatever the config now maps. Without it this paragraph would be a
promise the code does not keep — which is exactly what it was until the
behaviour was checked against a real database rather than assumed.

It only looks at rows that still carry unmapped products, so it costs one cheap
query in the normal case, and it never reinstates a grant that was revoked.

Rejecting would be tidier and worse.

## What the thank-you page shows while enrolment is pending

The claim URL, as soon as it exists. If enrolment has not completed, the page
says access is being set up and that an email is coming — never a bare error,
because from the customer's side nothing has gone wrong. They paid.

## One live claim link per purchase, enforced by the database

The endpoint must not issue a second claim link on a repeat delivery: the first
may already be in the customer's hands, and a second would quietly invalidate
the one they are looking at.

The obvious implementation — look for an existing token, insert one if there is
none — **is wrong, and its tests pass.** Sequential duplicate deliveries behave
perfectly. Simultaneous ones do not: every request checks before any insert
lands, all of them find nothing, and all of them insert.

Fired at a real server, eight simultaneous deliveries of one order produced one
enrolment, one access grant, and **eight working links into the same account**.

Checking harder cannot fix a read-then-write race. A partial unique index on
`claim_tokens (enrolment_id) WHERE used_at IS NULL` can, and does: whoever loses
the race inserts nothing and returns `null`, which is the same answer a repeat
delivery already gets. Twelve simultaneous deliveries now produce exactly one
link and twelve `200`s.

The index is partial so that a used token remains as a record, and a student who
claimed months ago and needs a fresh link is still a normal case.

**The general lesson, which applies to the rest of this endpoint:** anything that
must be true exactly once belongs in a constraint, not in application logic. The
funnel delivers from two racing sources by design, so concurrent delivery is the
normal case here rather than an edge case.

## Refunds

Not this endpoint. A separate one with the same idempotency discipline. See
[refunds](./refunds.md).
