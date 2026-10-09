
CREATE TABLE production_sources (
  source_id    text PRIMARY KEY,
  display_name text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Logical events that actually exist in the business ledger (never deleted)
CREATE TABLE production_events (
  seq                 bigserial UNIQUE NOT NULL,                  -- global arrival order ("first stored wins")
  event_id            text NOT NULL,
  source_id           text NOT NULL REFERENCES production_sources(source_id),
  type                text NOT NULL CHECK (type IN ('COUNT','VOID')),
  quantity            integer,
  target_event_id     text,
  event_time          timestamptz NOT NULL,                       -- device time
  received_at         timestamptz NOT NULL DEFAULT now(),         -- server receipt time
  status              text NOT NULL CHECK (status IN ('ACCEPTED','PENDING_REFERENCE','REJECTED')),
  failure_reason      text,
  normalized_hash     text NOT NULL,                              -- sha256 of normalized payload
  voided_by_event_id  text,                                       -- on a COUNT: which VOID reversed it
  resolved_at         timestamptz,                                -- when a pending VOID was resolved
  acknowledged_at     timestamptz,
  ack_mode            text CHECK (ack_mode IN ('MANUAL','AUTO')),
  PRIMARY KEY (source_id, event_id),
  CONSTRAINT uq_event_id_global UNIQUE (event_id),                -- U1: globally unique event id
  CONSTRAINT chk_shape CHECK (
    (type = 'COUNT' AND quantity IS NOT NULL AND quantity > 0 AND target_event_id IS NULL) OR
    (type = 'VOID'  AND quantity IS NULL AND target_event_id IS NOT NULL)
  )
);
-- DB-level guarantee: at most ONE live VOID per target COUNT (first stored wins)
CREATE UNIQUE INDEX uq_one_live_void_per_target
  ON production_events (target_event_id)
  WHERE type = 'VOID' AND status IN ('ACCEPTED','PENDING_REFERENCE');
CREATE UNIQUE INDEX uq_count_voided_once
  ON production_events (voided_by_event_id) WHERE voided_by_event_id IS NOT NULL;
CREATE INDEX ix_events_source ON production_events (source_id);
CREATE INDEX ix_events_pending_ack ON production_events (source_id)
  WHERE status = 'ACCEPTED' AND acknowledged_at IS NULL;
CREATE INDEX ix_events_pending_ref ON production_events (target_event_id)
  WHERE status = 'PENDING_REFERENCE';

-- EVERY received item, including duplicates, conflicts, rejects, invalid whole requests
CREATE TABLE submission_attempts (
  id              bigserial PRIMARY KEY,
  batch_id        uuid NOT NULL,
  item_index      integer NOT NULL,
  channel         text NOT NULL CHECK (channel IN ('REST','MQTT')),
  challenge_id    text,
  raw_payload     jsonb NOT NULL,                                 -- original exactly as received
  normalized      jsonb,
  source_id       text,                                           -- null if unusable
  event_id        text,
  classification  text NOT NULL CHECK (classification IN
                   ('ACCEPTED','DUPLICATE','CONFLICT','PENDING_REFERENCE','REJECTED')),
  error           text,                                           -- clear human reason
  received_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_attempts_class ON submission_attempts (classification, source_id);

CREATE TABLE mqtt_challenges (
  challenge_id    text PRIMARY KEY,
  candidate_id    text,
  request_digest  text NOT NULL,                                  -- sha256 of canonical request body
  request_body    jsonb NOT NULL,
  response        jsonb NOT NULL,                                 -- serialized response (COMPLETED or FAILED)
  status          text NOT NULL CHECK (status IN ('COMPLETED','FAILED')),
  error_code      text,
  received_at     timestamptz NOT NULL DEFAULT now(),
  responded_at    timestamptz,
  published_at    timestamptz                                     -- set after PUBACK
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL, event_id text, source_id text, detail jsonb
);
