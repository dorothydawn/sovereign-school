-- Attach a purchase to its student at the moment of purchase, and record
-- whether that purchase is what created the account.
--
-- Two problems, one cause.
--
-- 1. A second order did not reach the student until they opened its own claim
--    link. Somebody who bought an upsell three minutes after the main product
--    was already inside the course and had no reason to check their email
--    again, so the thing they had just paid for did not appear.
--
-- 2. Worse: a claim link could sign somebody into an EXISTING account. The
--    funnel shows that link to whoever paid, so anybody could buy the cheapest
--    course, type another student's address at checkout, and be signed in as
--    them — without ever touching that person's inbox. Confirmed against a
--    running server.
--
-- Both are fixed by moving the account lookup to enrolment time and recording
-- the result. The purchase attaches to whoever owns that address immediately,
-- and the claim link only grants a session when it created the account itself.
-- Access to an account that already existed has to be proved by email.

ALTER TABLE enrolments
  ADD COLUMN created_account boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN enrolments.created_account IS
  'True when this enrolment created the account it is attached to. A claim link '
  'grants a session only for these; otherwise the buyer must prove the address '
  'by signing in, or an attacker could take over an account by buying with '
  'somebody else''s email.';
