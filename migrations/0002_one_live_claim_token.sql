-- One live claim link per purchase, enforced by the database.
--
-- Found by firing eight simultaneous deliveries of one order at a real server:
-- the application checked for an existing token before inserting, all eight
-- checks ran before any insert landed, and eight working links into the same
-- account were issued. Sequential tests passed throughout.
--
-- No amount of checking before writing fixes this. Only a constraint does.

-- Any duplicates already issued: keep the newest, drop the rest.
DELETE FROM claim_tokens ct
 WHERE ct.used_at IS NULL
   AND EXISTS (
     SELECT 1 FROM claim_tokens newer
      WHERE newer.enrolment_id = ct.enrolment_id
        AND newer.used_at IS NULL
        AND (newer.created_at, newer.token_hash) > (ct.created_at, ct.token_hash)
   );

-- Partial: a used token stays in the table as a record, and a student who has
-- claimed and needs a fresh link later is a normal case.
CREATE UNIQUE INDEX claim_tokens_one_live_per_enrolment
  ON claim_tokens (enrolment_id)
  WHERE used_at IS NULL;
