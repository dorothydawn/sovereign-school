-- Stop keeping what a customer paid.
--
-- This platform never takes money. The funnel does that, and Stripe is behind
-- it, so both already hold the authoritative record of every amount. Keeping a
-- third copy here bought nothing: the columns were written on every enrolment
-- and never read back by anything.
--
-- What it cost was real. A database that holds no financial data cannot leak
-- any, and a platform whose job is access control has no business being a
-- secondary record of what people spent.
--
-- The funnel still sends both fields — the contract is shared and unchanged, and
-- the endpoint still validates them, so a funnel sending nonsense is still
-- caught. They are simply not persisted.
--
-- If the owner ever wants revenue shown here, the values arrive on every call
-- and this is one migration to reverse.

ALTER TABLE enrolments DROP COLUMN amount_minor_units;
ALTER TABLE enrolments DROP COLUMN currency;
