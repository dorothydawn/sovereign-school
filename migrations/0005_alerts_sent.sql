-- Which warnings have already gone out, so the owner is told once rather than
-- on every page load.
--
-- Keyed by month as well as threshold: crossing 70% again in October is news,
-- crossing it twice in September is not.

CREATE TABLE alerts_sent (
  kind      text NOT NULL,
  threshold integer NOT NULL,
  month     date NOT NULL,
  sent_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, threshold, month)
);
