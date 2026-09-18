-- Email addresses are stored lowercase, and the database enforces it.
--
-- Found by buying a course as Student@Example.com against a real server. The
-- funnel sends whatever the customer typed, the account stored it verbatim, and
-- sign-in normalises to lowercase before looking it up — so no account was ever
-- found. The student got "if that address has an account, a link is on its way"
-- every time, because that message is deliberately the same whether or not the
-- address exists. Locked out of something they had paid for, with no error
-- anywhere.
--
-- Two purchases capitalised differently also produced two separate accounts,
-- splitting one person's library across logins they could not both reach.
--
-- Normalising in application code alone would fix today's paths and leave the
-- next one to rediscover this. The CHECK makes it impossible.

-- 1. Merge accounts that differ only by case, keeping the earliest.
CREATE TEMPORARY TABLE account_merges AS
SELECT loser.id AS loser_id, keeper.id AS keeper_id
  FROM accounts loser
  JOIN LATERAL (
    SELECT a.id
      FROM accounts a
     WHERE a.email IS NOT NULL
       AND lower(a.email) = lower(loser.email)
     ORDER BY a.created_at, a.id
     LIMIT 1
  ) keeper ON keeper.id <> loser.id
 WHERE loser.email IS NOT NULL;

-- A live sign-in link belonging to a merged-away account would collide with the
-- keeper's, and it points at an account about to disappear either way.
DELETE FROM login_tokens WHERE account_id IN (SELECT loser_id FROM account_merges);

-- Progress is keyed per account and lesson, so move only what does not collide.
UPDATE progress p
   SET account_id = m.keeper_id
  FROM account_merges m
 WHERE p.account_id = m.loser_id
   AND NOT EXISTS (
     SELECT 1 FROM progress existing
      WHERE existing.account_id = m.keeper_id
        AND existing.course_id = p.course_id
        AND existing.lesson_id = p.lesson_id
   );

DELETE FROM progress p USING account_merges m WHERE p.account_id = m.loser_id;

UPDATE enrolments e SET account_id = m.keeper_id
  FROM account_merges m WHERE e.account_id = m.loser_id;

UPDATE comments c SET account_id = m.keeper_id
  FROM account_merges m WHERE c.account_id = m.loser_id;

UPDATE sessions s SET account_id = m.keeper_id
  FROM account_merges m WHERE s.account_id = m.loser_id;

DELETE FROM accounts WHERE id IN (SELECT loser_id FROM account_merges);

DROP TABLE account_merges;

-- 2. Normalise what remains.
UPDATE accounts   SET email = lower(trim(email)) WHERE email IS NOT NULL;
UPDATE enrolments SET email = lower(trim(email)) WHERE email IS NOT NULL;

-- 3. Make it impossible to store an unnormalised address again.
ALTER TABLE accounts
  ADD CONSTRAINT accounts_email_is_normalised
  CHECK (email IS NULL OR email = lower(trim(email)));
