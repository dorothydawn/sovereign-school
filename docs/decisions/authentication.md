# Signing in: magic link and password

**Status: settled.** Both, with magic link built first.

## What was decided

Students can sign in with an emailed one-time link, or with a password. Both are
available; an owner may switch either off in `course.config.ts`.

## Why both, rather than choosing

Two reasons, and the second is the load-bearing one.

**Password reset is a magic link.** If you build passwords you have to build the
emailed-token flow anyway. So supporting both costs barely more than supporting
passwords alone. Framing it as a choice was a mistake.

**Some students have no email address.** The funnel can take a payment without
one. Those students cannot be sent a link, so their only route in is the claim
token issued at purchase — and after that they need a credential of their own. A
password is the natural answer for exactly those people.

So "both" is not indulgence. Without passwords, students who bought without an
email would have nothing but a token in a URL, forever.

## How somebody gets in

1. They buy. The funnel calls `/api/enrol`.
2. The platform issues a single-use **claim token** and returns a claim URL. The
   thank-you page shows it — this works with no email address.
3. Claiming creates the account and signs them in.
4. They set a password, or add an email for magic links, or both.
5. Later purchases attach to the same account, so everything they own is in one
   place.

## Rejected

**Shared password for the whole course.** Leaks immediately, cannot be revoked per
student, and the owner never finds out.

**A permanent token in the URL as the only credential.** It ends up in browser
history, screenshots and forwarded emails, and there is no way to tell one
student from a hundred sharing the same link.
