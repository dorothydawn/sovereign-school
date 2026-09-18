-- Signing in: magic links, passwords, and the counters that keep both honest.

-- Emailed one-time links. Separate from claim_tokens because the two differ in
-- what they prove: a claim token proves a purchase, a login token proves an
-- address.
CREATE TABLE login_tokens (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_tokens_account_id_idx ON login_tokens(account_id);

-- One live link per account, for the same reason claim tokens have it: several
-- requests can arrive at once, and a second link silently invalidates the one
-- already in somebody's inbox.
CREATE UNIQUE INDEX login_tokens_one_live_per_account
  ON login_tokens (account_id)
  WHERE used_at IS NULL;

-- Failed sign-in attempts, so a password can't be guessed at network speed.
-- Keyed on the email that was tried rather than the account, because an attempt
-- against an address with no account must look identical from outside.
CREATE TABLE sign_in_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sign_in_attempts_email_idx ON sign_in_attempts(email, attempted_at);

-- How many emails went out each day, so the platform can warn the owner before
-- a provider's daily cap stops sign-in links arriving. Every free email tier
-- caps around 100 a day, and that breaks on launch day rather than in steady
-- use. See docs/decisions/never-fail-silently.md.
CREATE TABLE email_sends (
  day   date PRIMARY KEY,
  sent  integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0
);
