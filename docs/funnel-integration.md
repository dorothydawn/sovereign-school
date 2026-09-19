# For the agent building the funnel

Everything the selling side needs in order to talk to this course platform. Hand
this file to whoever is building the funnel.

The two repositories share exactly **one HTTP call**, made when somebody buys.
Neither imports from the other.

---

## The call

```
POST https://<the course platform>/api/enrol
Content-Type: application/json
X-Funnel-Signature: <hex HMAC-SHA256 of the raw body>

{
  "orderId":          "ord_...",      // your primary key. THE IDEMPOTENCY KEY
  "email":            "a@b.com",      // send it whenever you have it; null is accepted
  "productIds":       ["course-x"],   // what was bought. May contain several
  "amountMinorUnits": 29700,          // validated, deliberately not stored
  "currency":         "usd",          // same
  "purchasedAt":      "2026-09-18T12:00:00.000Z"
}
```

Send it as soon as the payment is confirmed. The customer is already waiting.

## Signing

`X-Funnel-Signature` is the lowercase hex HMAC-SHA256 of **the exact bytes you
send**, keyed with the shared secret.

```js
const signature = crypto
  .createHmac('sha256', process.env.FUNNEL_SHARED_SECRET)
  .update(rawBody, 'utf8')
  .digest('hex')
```

Sign the string you actually transmit. Do not build an object, sign it, and then
serialise it again for the request — key order, whitespace and number formatting
can all differ between the two, and the signature will not match.

### Test vector

Check your implementation against this before you send anything real.

**Secret**

```
test_secret_do_not_use_in_production
```

**Body** (exactly these bytes, no trailing newline)

```
{"orderId":"ord_test_0001","email":"student@example.com","productIds":["flagship-course"],"amountMinorUnits":29700,"currency":"usd","purchasedAt":"2026-09-19T12:00:00.000Z"}
```

**Expected signature**

```
208f839eec80034786637cb6c8bca374df9f5445a36e275db2b9209fb66de3b5
```

If you get something else, you are almost certainly signing different bytes than
you send. As a demonstration: the same data with `email` moved before `orderId`
signs to `71d2228…`, a completely different value.

## What comes back

`200` with:

```json
{
  "ok": true,
  "orderId": "ord_test_0001",
  "duplicate": false,
  "courses": ["flagship"],
  "unmappedProducts": [],
  "claimUrl": "https://school.example/claim/xK3f..."
}
```

**`claimUrl` is the important one.** It is how a customer gets into what they
just bought. Show it on your thank-you page as the main thing on the screen, and
include it in your receipt email if you send one.

It is `null` on a repeat delivery, because a link was already issued for that
order and issuing a second one would silently invalidate the first. So: keep the
`claimUrl` from the first successful response for that `orderId`, and if a later
call returns `null`, show the one you already have.

It comes back as a full absolute URL, built from **the address you called**.
Call the platform at the address you want your customers to see, and the link
will match. (It is not taken from the platform's own config: that value is typed
in by hand at setup, and one typo there would send every paying customer a dead
link.)

## Status codes

| Code | Meaning | What to do |
|---|---|---|
| `200` | Enrolled. Also the answer for a duplicate | Show the claim link. Done |
| `400` | Signed correctly, but the body is wrong | A bug on your side. The response says what is wrong. Do not retry unchanged |
| `401` | Signature missing or wrong | Check the secret matches on both sides. No detail is given on purpose |
| `500` | Something broke on the platform | **Retry.** The endpoint is safe to call again |

Retry `500`s with backoff and keep retrying for a while. The customer has paid;
giving up leaves them with nothing.

## Five things that will bite you if you ignore them

**1. Send the same call more than once. That is expected, not a bug.**
`orderId` is the idempotency key. The platform upserts on it and returns `200`
to repeats. If you confirm payments from two racing sources — a Stripe webhook
and the customer's browser returning, say — let both call. That is the design.

**2. Send the email whenever you have one.**
It is optional, and the platform works without it. But a student with no email
on file can only ever get in through the claim link. With an email they can
request a fresh sign-in link from any device, forever. Stripe Checkout collects
one for receipts, so you usually have it. **Send it.**

**3. Your product ids must match the platform's config.**
The platform maps `productIds` to courses in its `course.config.ts`. If you send
`flagship-course` and the owner mapped `flagship_course`, the customer is still
enrolled and still gets a claim link — but sees no course until the owner fixes
the mapping. Nothing is lost, and it shows on the owner's page, but agree the
strings up front.

**4. Never key anything on the email.**
It may be null, it may change, and two people may share one. `orderId` is the
only value guaranteed to be there.

**5. The customer has already paid by the time you call.**
You cannot un-charge them. If enrolment cannot be confirmed, your thank-you page
should say access is being set up and that an email is coming — never a bare
error. From their side nothing has gone wrong.

## What the thank-you page should do

1. On `200`, show the `claimUrl` prominently. That is the whole point of the page.
2. If the call has not returned yet, say access is being set up rather than
   showing an error.
3. If it failed, say the same thing and make sure somebody is alerted. Do not
   tell a paying customer that something went wrong with their purchase when the
   payment itself succeeded.

## Refunds

**Not built yet, and deliberately.** Whether a refund takes away course access is
the owner's decision, not a technical default, and it is still open.

The platform is built so it can be switched on without a migration. When it is,
it will be a second endpoint with the same signing and the same idempotency
rules, keyed on the same `orderId`. Nothing is needed from the funnel until then
— but if you are designing refund handling now, assume you will eventually POST
a refund notification carrying `orderId` and whether it was full or partial.

## Configuration both sides need

| | Funnel | Platform |
|---|---|---|
| `FUNNEL_SHARED_SECRET` | ✅ identical value | ✅ identical value |
| The platform's URL | ✅ needs it | — |
| Product ids | ✅ sends them | ✅ maps them in `course.config.ts` |

Generate the secret once with `openssl rand -hex 32` and paste the same value
into both. If they differ, every call gets `401` and nobody gets enrolled.

## Testing it end to end

```bash
BODY='{"orderId":"ord_test_0001","email":"student@example.com","productIds":["flagship-course"],"amountMinorUnits":29700,"currency":"usd","purchasedAt":"2026-09-19T12:00:00.000Z"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$FUNNEL_SHARED_SECRET" -hex | sed 's/.* //')

curl -X POST https://your-platform.example/api/enrol \
  -H "Content-Type: application/json" \
  -H "X-Funnel-Signature: $SIG" \
  -d "$BODY"
```

Then, before either side is called done:

1. Send it **twice**. The second must return `200` with `"duplicate": true`.
2. Send one with `"email": null`. It must still return a `claimUrl`.
3. Send one with a deliberately wrong signature. It must return `401`.
4. Open the `claimUrl` in a browser and confirm you end up inside the course.

Buy your own course at the real price once, end to end, before launch. A green
test suite on either side proves only that each agrees with itself.
