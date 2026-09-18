-- Initial schema.
--
-- Two things here exist before they are used, deliberately:
--
--  * course_access.state supports 'revoked' although nothing revokes yet. The
--    refund policy is undecided (docs/decisions/refunds.md) and retrofitting a
--    revoked state means revisiting every access check.
--  * db_activity exists so the platform can estimate its own database usage.
--    Neon's free plan suspends without warning and will not report usage to us
--    (docs/decisions/never-fail-silently.md).

CREATE TABLE accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: the funnel can take a payment without one. Never assume it exists.
  email         text UNIQUE,
  password_hash text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per purchase. order_id is the funnel's primary key and our idempotency
-- key: the enrol endpoint upserts on it, because the same purchase arrives more
-- than once by design.
CREATE TABLE enrolments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            text NOT NULL UNIQUE,
  account_id          uuid REFERENCES accounts(id) ON DELETE SET NULL,
  email               text,
  product_ids         text[] NOT NULL,
  -- Products the funnel sent that course.config.ts does not map to a course.
  -- The customer has already paid, so we record rather than reject; the owner
  -- adds the mapping and access appears with nothing to re-send.
  unmapped_products   text[] NOT NULL DEFAULT '{}',
  amount_minor_units  integer NOT NULL,
  currency            text NOT NULL,
  purchased_at        timestamptz NOT NULL,
  refund_state        text NOT NULL DEFAULT 'none'
                        CHECK (refund_state IN ('none', 'partial', 'full')),
  refunded_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX enrolments_account_id_idx ON enrolments(account_id);
CREATE INDEX enrolments_email_idx ON enrolments(email) WHERE email IS NOT NULL;

-- What a purchase actually unlocks. Separate from enrolments because one
-- purchase can grant several courses, and access is what gets revoked.
CREATE TABLE course_access (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrolment_id uuid NOT NULL REFERENCES enrolments(id) ON DELETE CASCADE,
  course_id    text NOT NULL,
  state        text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'revoked')),
  granted_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  UNIQUE (enrolment_id, course_id)
);

CREATE INDEX course_access_course_id_idx ON course_access(course_id);

-- Single-use link issued at purchase. The only way in for a student who bought
-- without an email address, so it is the identity bridge, not a convenience.
CREATE TABLE claim_tokens (
  token_hash   text PRIMARY KEY,
  enrolment_id uuid NOT NULL REFERENCES enrolments(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX claim_tokens_enrolment_id_idx ON claim_tokens(enrolment_id);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_account_id_idx ON sessions(account_id);

-- One row per student per lesson. Upserted, never appended: a row per view would
-- grow without limit and storage is the one Neon free-tier limit we can blow.
CREATE TABLE progress (
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  course_id      text NOT NULL,
  lesson_id      text NOT NULL,
  completed_at   timestamptz,
  -- Where they stopped watching. Written on pause and on leaving the page, not
  -- on a timer: at 5,000 students a 30-second timer is millions of writes.
  video_position integer NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, course_id, lesson_id)
);

CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  course_id  text NOT NULL,
  lesson_id  text NOT NULL,
  parent_id  uuid REFERENCES comments(id) ON DELETE CASCADE,
  body       text NOT NULL,
  -- Defaults to pending: course.config.ts ships with requireApproval on, so an
  -- owner sees comments before their students do.
  state      text NOT NULL DEFAULT 'pending'
               CHECK (state IN ('pending', 'published', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comments_lesson_idx ON comments(course_id, lesson_id, state);
CREATE INDEX comments_pending_idx ON comments(created_at) WHERE state = 'pending';

-- Five-minute buckets in which the database was awake, for estimating compute
-- against Neon's free allowance. At most 8,928 rows a month; pruned monthly.
CREATE TABLE db_activity (
  bucket timestamptz PRIMARY KEY
);
