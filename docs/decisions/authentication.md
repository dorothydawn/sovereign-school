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

## One-time links are spent by a POST, never a GET

Both the claim link and the sign-in link open a page with a button. The page
does not sign anybody in; the button does.

This is not ceremony. Corporate mail scanners follow every URL in an email
before it reaches the inbox, browsers prefetch links, and chat apps fetch them
to build previews. A one-time token consumed by a GET is spent before the
student ever clicks, and they are then told — correctly — that their link has
already been used.

Verified against a real server: five GETs of a claim page and three of a sign-in
page leave the token untouched, the POST spends it, and a second POST is
refused.

## Email addresses are stored lowercase, and the database enforces it

Found by buying a course as `Student@Example.com` against a real server.

The funnel sends whatever the customer typed. The account stored it verbatim.
Sign-in normalises to lowercase before looking an address up, so it found
nothing — and because the "if that address has an account, a link is on its way"
message is deliberately identical whether or not the account exists, the student
saw the same reassuring sentence every time. Locked out of something they had
paid for, permanently, with no error recorded anywhere.

The same fault split one person across two accounts when two purchases were
capitalised differently.

Addresses are now normalised as soon as a payload is parsed, and
`accounts_email_is_normalised` makes an unnormalised address impossible to
store. Normalising in application code alone would have fixed the paths that
existed that day and left the next one to rediscover this.

Migration `0004` repairs existing data: it merges accounts differing only by
case, keeping the earliest and moving their purchases, progress and comments
across, then lowercases what remains. Confirmed against a real database that
already carried the broken row.

## Guessing a password

Ten failed attempts against an address pause it for fifteen minutes, counted on
the address tried rather than the account found — limiting only real accounts
would itself reveal which addresses are real. A wrong password and an unknown
address return the same answer and take the same time, because scrypt runs
against a dummy hash when no account matches.

## Rejected

**Shared password for the whole course.** Leaks immediately, cannot be revoked per
student, and the owner never finds out.

**A permanent token in the URL as the only credential.** It ends up in browser
history, screenshots and forwarded emails, and there is no way to tell one
student from a hundred sharing the same link.
