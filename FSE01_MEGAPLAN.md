# FSE-01 MEGAPLAN — Production Event Processing Dashboard + MQTT Integration

Candidate: M. Nura Alam Naim · Candidate ID: **09** (handwritten on the sheet; confirm with the examiner, it reads 09 or 04) · 100 marks · 1h45m total
Customer: NorthBridge Garments (fictional) · Vendor: CSI Smart Tech Ltd
Deliverable: a working full-stack system (modular monolith + PostgreSQL + MQTT worker + dashboard).

> How to use this file in Antigravity: put it in the repo root as `PLAN.md`. Paste **Section 0** as the workspace rules. Then run **Section 13 (phase prompts)** one at a time. Tick the checkboxes as you go. **Do not let the agent run ahead of the phase you are on.**

---

## 0. Agent rules (paste as workspace/system rules)

```
You are pair-programming on a timed assessment. Follow PLAN.md strictly.
1. Architecture: ONE backend app, ONE PostgreSQL DB, function-based modular monolith. No microservices, Kafka or RabbitMQ.
2. Routes/controllers stay thin. Business rules live in services. SQL lives in repositories. MQTT handlers only parse/validate envelope and CALL the same process_events() used by REST.
3. COUNT/VOID logic must exist in exactly ONE place (events/service). Never duplicate it in routes, MQTT, frontend, or other modules.
4. Use exact function names: validate_event, process_events, process_event, process_count, process_void, resolve_pending_voids, acknowledge_events, get_summary, get_pending, get_exceptions, handle_mqtt_challenge.
5. PostgreSQL only (no SQLite, no in-memory state). Totals are read from the DB, never from process memory.
6. Never expose stack traces, SQL errors or credentials in API responses. Never commit .env, node_modules, dist, caches.
7. Write small, readable code with short comments explaining WHY. I must be able to explain every function live and change one rule on request.
8. After each phase: run tests, tell me what changed in 3 lines, stop and wait.
9. Do not add features not in PLAN.md. Mark assumptions in TECHNICAL_EXPLANATION.md.
```

---

## 1. Time plan (105 min)

| Min | Stage | Do |
|---|---|---|
| 0–10 | Read brief (NO code, NO AI) | Actors, entities, rules, unclear points (Section 3) |
| 10–20 | Clarify with examiner (NO AI) | Ask up to 7 questions (Section 4) |
| 20–30 | Scaffold + DB | repo, git init, deps, docker-compose, migrations, **commit 1** |
| 30–50 | Core events service + `POST /api/events` | validate, process, resolve, transactions |
| 50–58 | State + Ack APIs | **commit 2** |
| 58–70 | MQTT worker | challenge handling, status, reconnect |
| 70–82 | Frontend dashboard | **commit 3** |
| 82–92 | Tests (5 required + extras) | |
| 92–100 | README, TECHNICAL_EXPLANATION, AI_USAGE, screenshots | **commit 4 + push** |
| 100–105 | Final check + dry-run of demo + ZIP + Google Form | |

Priority if time runs short (marks): REST+logic+DB (38) → MQTT (17) → Frontend (12) → Reliability (10) → Understanding (10) → Tests (5) → Docs/Git (4) → Architecture (4). **Never skip the five required tests and the docs.**

Scoring-first rule: a correct explanation plus a small working change beats extra code you cannot explain.

---

## 2. Stage 1 (no code): reading the brief

**Actors**
- Production supervisor: sees reliable totals, inspects exceptions, acknowledges reviewed events.
- Factory floor operator: submits a count or correction manually.
- Support/engineering: checks device connection, last challenge, traces errors without losing history.
- MQTT device simulator (examiner): sends challenges, expects a correct response.

**Entities**: production_source, production_event (COUNT/VOID), submission_attempt, acknowledgement (a column on the event), mqtt_challenge. (Plus optional audit_log.)

**Core business rules**
- COUNT adds quantity once. Same message twice must not add again.
- VOID reverses exactly one COUNT, same `source_id`, only once.
- VOID before COUNT → `PENDING_REFERENCE`, auto-resolved when the COUNT arrives.
- Several pending VOIDs for the same COUNT → first stored valid wins, others rejected with clear reasons.
- Batch processed in submitted order; response keeps the same order; invalid item REJECTED but valid items still succeed.
- Every rejected submission, duplicate and conflict is persisted.
- History is never deleted. Corrections reverse, they do not delete.
- Concurrency-safe with PostgreSQL constraints and transactions.
- VOIDs are auto-acknowledged when complete. The Pending table shows COUNT events only.

**Unclear or contradictory points (found in the brief)**

| # | Issue | Where | My default assumption |
|---|---|---|---|
| U1 | "event_id is globally unique across all sources" (5.1) vs "composite unique key on (source_id, event_id) allowing different lines to use the same event ID" (7) | 5.1 vs 7 | **Global uniqueness wins** (business rule + ack API takes only event_id). Same event_id from another source = CONFLICT. Keep composite unique as defense in depth. |
| U2 | "Batch = one transaction, roll back if any event fails validation" (7) vs "invalid item is REJECTED, valid items still succeed" (5.2, 6.1) | 7 vs 5.2/6.1 | One DB transaction per batch for **infrastructure** failure (all-or-nothing on DB error). **Validation failures are item results, not exceptions**, so they are recorded and the rest commits. |
| U3 | Voided COUNT: still in pending-ack list? | 6.2 | Yes. Completed COUNT stays reviewable until acknowledged. UI shows a VOIDED badge. |
| U4 | `view` missing in GET /api/state | 6.2 | Default `summary`. Invalid value → 400. |
| U5 | VOID whose source differs from target COUNT's source | 5.2 | REJECTED with reason `SOURCE_MISMATCH`. If it was pending, it becomes REJECTED on resolution attempt. |
| U6 | Status message shape for `/status` | 8 | `{candidate_id,status:ONLINE|HEARTBEAT|OFFLINE,at,client_id}` |
| U7 | Frontend needs MQTT info but the API list has only 3 endpoints | 9 | Add read-only `GET /api/mqtt/status` + `GET /health`. Three required APIs stay exactly as specified. |
| U8 | Candidate ID format ("09" vs "CAND-017" in sample) | 8 | Use `CANDIDATE_ID` env var, exactly what the examiner assigns. |
| U9 | Does an expired challenge get a FAILED response? | 8.2 | Yes: FAILED / CHALLENGE_EXPIRED, persisted. |
| U10 | VOID event_time earlier than COUNT event_time | 5 | Allowed. Arrival order governs, event_time is stored only. |

---

## 3. Stage 2: the 7 questions to ask the examiner (pick the most valuable)

1. U1: Is event_id unique globally, or per (source_id, event_id)? Should the same event_id from another line be CONFLICT or a different event?
2. U2: In a batch, if one item is invalid, should the others commit (REJECTED item only) or the whole batch roll back?
3. Is the expected candidate_id the numeric "09" or a string like "CAND-09"? Which topic prefix exactly?
4. When a COUNT is voided, should it still appear in the pending acknowledgement list?
5. VOID with a different source_id than the target COUNT: reject or leave pending?
6. May I add a read-only `GET /api/mqtt/status` for the dashboard's MQTT panel?
7. Should an expired challenge still get a FAILED response, and what if the simulator re-sends it?

Record the examiner's answers in `TECHNICAL_EXPLANATION.md` → "Assumptions". Unanswered ones keep the defaults above.

---

## 4. Tech stack (chosen for speed + explainability)

- Runtime: Node.js 20+, TypeScript run with `tsx` (no build step to break), ESM.
- HTTP: Express 4.
- DB: PostgreSQL 16 via `pg` (raw SQL, no ORM: easier to explain constraints/locks).
- MQTT: `mqtt` (mqtt.js) v5.
- Tests: `vitest` against a real Postgres test database.
- Frontend: single static page (HTML + CSS + vanilla ES modules), served by the same Express app. No build tooling, so it always works.
- Migrations: plain `.sql` files plus a ~40-line runner with a `schema_migrations` table.
- Local DB: `docker-compose.yml` (postgres:16). Fallback instructions for a locally installed Postgres in the README.

Swap freely if you are stronger in another stack (FastAPI, Spring, Go). The architecture and rules below are language-neutral.

---

## 5. Repository layout

```
fse01/
├─ src/
│  ├─ app.ts                     # build express app (no listen) for tests
│  ├─ server.ts                  # start HTTP + MQTT worker, graceful shutdown
│  ├─ config.ts                  # env parsing (DATABASE_URL, CANDIDATE_ID, MQTT_*)
│  ├─ modules/
│  │  ├─ events/
│  │  │  ├─ routes.ts            # POST /api/events (thin)
│  │  │  ├─ validation.ts        # validate_event(): pure function
│  │  │  ├─ service.ts           # process_events/process_event/process_count/process_void/resolve_pending_voids
│  │  │  └─ repository.ts        # SQL only
│  │  ├─ ack/
│  │  │  ├─ routes.ts            # POST /api/ack
│  │  │  ├─ service.ts           # acknowledge_events()
│  │  │  └─ repository.ts
│  │  ├─ state/
│  │  │  ├─ routes.ts            # GET /api/state
│  │  │  ├─ service.ts           # get_summary/get_pending/get_exceptions
│  │  │  └─ queries.ts
│  │  ├─ mqtt/
│  │  │  ├─ worker.ts            # connect, subscribe, heartbeat, reconnect, LWT
│  │  │  ├─ protocol.ts          # validate envelope, build responses, error codes
│  │  │  ├─ service.ts           # handle_mqtt_challenge()
│  │  │  └─ routes.ts            # GET /api/mqtt/status (read-only)
│  │  └─ audit/
│  │     ├─ service.ts
│  │     └─ repository.ts
│  └─ shared/
│     ├─ db.ts                   # pg Pool, withTransaction()
│     ├─ contracts.ts            # TS types for event, item result, summary, challenge
│     ├─ domain_events.ts        # tiny in-process bus: EVENT_ACCEPTED, VOID_RESOLVED, EVENT_ACKNOWLEDGED
│     └─ errors.ts               # safe error mapper (no stack traces to clients)
├─ migrations/
│  ├─ 001_init.sql
│  └─ run.ts
├─ frontend/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ tests/
├─ scripts/ (smoke.sh with curl examples, simulate_challenge.ts)
├─ docker-compose.yml
├─ .env.example
├─ .gitignore                    # node_modules, .env, dist, coverage, *.zip
├─ README.md
├─ TECHNICAL_EXPLANATION.md
├─ AI_USAGE.md
├─ PLAN.md  (this file)
└─ package.json
```

Dependency direction: `routes → service → repository → db`. Modules talk through service functions and domain events, never through each other's tables. This is what makes later microservice extraction possible.

---

## 6. Database design (`migrations/001_init.sql`)

```sql
CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());

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
```

Why this works:
- `uq_event_id_global` plus `ON CONFLICT DO NOTHING` makes double counting impossible even under concurrent requests.
- `uq_one_live_void_per_target` makes "VOID reverses only once" and "first pending VOID wins" a database guarantee, not just app logic.
- Rejected, duplicate and conflict items live in `submission_attempts`. The original logical event is never overwritten.
- `net_total` is derived from durable rows (`SUM(quantity)` of ACCEPTED COUNTs not voided). It is a query, not a memory counter.

Migration command: `npm run migrate` (applies `.sql` files in order, idempotent via `schema_migrations`). Also run migrations automatically on server start (`AUTO_MIGRATE=true`).

---

## 7. Domain logic design (the heart: 38 marks depend on it)

### 7.1 `validate_event(raw) → {ok:true, value} | {ok:false, reason, partial}` (pure, no DB)

Rules:
- `raw` must be a plain object, else REJECTED `"Item is not a JSON object"`.
- `source_id`: string, trimmed non-empty.
- `event_id`: string, trimmed non-empty.
- `type`: exactly `"COUNT"` or `"VOID"` (case-sensitive).
- COUNT: `quantity` positive integer (`Number.isInteger`, > 0, reject strings like "5", 5.5, 0, negatives); `target_event_id` must be null/undefined.
- VOID: `quantity` must be null/undefined; `target_event_id` non-empty string; `target_event_id !== event_id`.
- `event_time`: string matching strict ISO-8601 **with timezone** (`Z` or `±hh:mm`), and a valid date. Reject naive timestamps. Normalize to UTC ISO.
- Return `partial` (whatever `source_id`/`event_id` were usable) so the attempt can still be recorded and filtered.
- Normalization output: `{source_id, event_id, type, quantity|null, target_event_id|null, event_time_utc}`. Duplicate vs conflict is decided by comparing `sha256(canonical JSON of normalized)`, so `10:30:00Z` equals `13:30:00+03:00` and `null` equals omitted.

### 7.2 `process_events(items[], ctx) → results[]` (one transaction per batch)

```
withTransaction(tx):
  lock_keys = sorted unique of all event_id and target_event_id in the batch   # avoids deadlocks
  for key in lock_keys: pg_advisory_xact_lock(hashtext(key))
  results = []
  for (i, raw) in items (in order):
     r = process_event(tx, raw, i, ctx)      # never throws for business problems
     results.push(r)
  commit
after commit: emit domain events collected during the tx
return results (same order, same length)
```
Infrastructure error (DB down, serialization failure) → rollback the whole batch → HTTP 500 with a safe message (`{"error":"INTERNAL_ERROR"}`), no partial writes (U2).

### 7.3 `process_event(tx, raw, idx, ctx)`

1. `v = validate_event(raw)`. If invalid → insert attempt REJECTED (reason) → result `REJECTED`.
2. Ensure the source exists (`INSERT ... ON CONFLICT DO NOTHING`, display_name = source_id).
3. `existing = SELECT * FROM production_events WHERE event_id = $1 FOR UPDATE`.
   - Exists and `normalized_hash` equal → attempt `DUPLICATE`, result `DUPLICATE` ("already processed"), **no state change**.
   - Exists and hash different (including a different source) → attempt `CONFLICT`, original untouched, result `CONFLICT` with reason like `"event_id EV-101 already exists with different data (quantity 5 vs 7)"`.
   - Also check an earlier REJECTED-on-resolve logical event. It still counts as existing, so the same rules apply.
4. Not existing → dispatch by type: `process_count` or `process_void`.

### 7.4 `process_count(tx, v)`

- Insert event `ACCEPTED`, `ON CONFLICT (event_id) DO NOTHING RETURNING` (if no row returned, a concurrent request won: re-read, classify DUPLICATE/CONFLICT).
- Attempt `ACCEPTED`, audit `COUNT_ACCEPTED`, queue domain event `EVENT_ACCEPTED`.
- Call `resolve_pending_voids(tx, v.event_id)` (below).
- Result `ACCEPTED`, "Event processed".

### 7.5 `process_void(tx, v)`

- Load target COUNT: `SELECT ... WHERE event_id = v.target_event_id FOR UPDATE`.
- **No target row** → insert VOID as `PENDING_REFERENCE`. Rely on `uq_one_live_void_per_target`: unique violation (another VOID already live for this target) → record REJECTED `"Another VOID already targets EV-x (first stored wins)"`. Result `PENDING_REFERENCE` or `REJECTED`.
- Target exists but `type != 'COUNT'` → REJECTED `"Target is not a COUNT"`.
- Target source differs → REJECTED `"SOURCE_MISMATCH"` (U5).
- Target already has `voided_by_event_id` (or a live VOID exists) → REJECTED `"COUNT already reversed by EV-y"`.
- Target is a COUNT in `ACCEPTED` and unvoided → insert VOID `ACCEPTED` with `acknowledged_at = now(), ack_mode='AUTO'`; set `count.voided_by_event_id = void.event_id`; audit; queue domain event `EVENT_ACCEPTED`. Result `ACCEPTED`.

### 7.6 `resolve_pending_voids(tx, count_event_id)`

- `SELECT ... FROM production_events WHERE type='VOID' AND status='PENDING_REFERENCE' AND target_event_id=$1 ORDER BY seq FOR UPDATE`.
- The partial unique index means there is normally at most one. For each: if source matches → set `status='ACCEPTED'`, `resolved_at=now()`, `acknowledged_at=now()`, `ack_mode='AUTO'`, and set `count.voided_by_event_id`. If source mismatches → `status='REJECTED'`, `failure_reason='SOURCE_MISMATCH'`.
- Queue domain event `VOID_RESOLVED`. Audit `VOID_RESOLVED`. `processed_events` increases by the resolved VOID; `unresolved` decreases.
- Resolved VOID's own original submission attempt stays `PENDING_REFERENCE` (history preserved). A new audit row records resolution.

### 7.7 `acknowledge_events(ids[])` (POST /api/ack)

- Validate body: object with `event_ids` array of non-empty strings, else HTTP 400. Empty array → `{"results":[]}`.
- One transaction; `SELECT ... WHERE event_id = ANY($1) FOR UPDATE` (sorted). Walk ids **in the request order**, keeping a local `seen` map so repeated IDs in one request behave:
  - not in DB → `NOT_FOUND`
  - status `PENDING_REFERENCE` or `REJECTED` → `NOT_READY` (a rejected submission that never became a logical event is also `NOT_FOUND`)
  - `acknowledged_at` not null (incl. auto-acked VOIDs) → `ALREADY_ACKED`
  - else `UPDATE ... SET acknowledged_at=now(), ack_mode='MANUAL'` → `ACKED`; second copy of the same ID in the same request → `ALREADY_ACKED`
- Never deletes, never blocks later VOIDs. Domain event `EVENT_ACKNOWLEDGED`, audit row.
- Response: `{"results":[{"event_id":"EV-101","status":"ACKED"}, ...]}`.

### 7.8 State queries (`GET /api/state?source_id=&view=`)

All SQL, all from durable tables:

- `summary` → `{net_total, processed_events, pending_ack, unresolved, duplicates, conflicts}`
  - `net_total = COALESCE(SUM(quantity) FILTER (WHERE type='COUNT' AND status='ACCEPTED' AND voided_by_event_id IS NULL),0)` (equivalent to counts minus applied VOID quantities; add a test asserting both formulas agree)
  - `processed_events = COUNT(*) FILTER (WHERE status='ACCEPTED')` (resolved VOIDs included, unresolved excluded)
  - `pending_ack = COUNT(*) FILTER (WHERE status='ACCEPTED' AND acknowledged_at IS NULL)`
  - `unresolved = COUNT(*) FILTER (WHERE status='PENDING_REFERENCE')`
  - `duplicates`/`conflicts` = counts of `submission_attempts` by classification, filtered by the **attempt's** `source_id`.
- `pending` → COUNT events `status='ACCEPTED' AND acknowledged_at IS NULL` (VOIDs are auto-acked so they never show). Fields: event_id, source_id, quantity, event_time, received_at, `voided` flag/reason.
- `exceptions` → union of: unresolved pending VOIDs (reason "waiting for COUNT X"), attempts classified REJECTED (reason), attempts classified CONFLICT (reason), rejected-on-resolve events. Without `source_id`, includes attempts where `source_id IS NULL`. Each row: kind, event_id, source_id, reason, received_at, raw_payload.
- Invalid `view` → 400 `{"error":"INVALID_VIEW","allowed":["summary","pending","exceptions"]}`.
- Unknown `source_id` → zeros / empty lists, not 404.

### 7.9 HTTP contract for `POST /api/events`

- Body is an object → treat as one-item batch. Array → batch. Anything else (string, number, null, malformed JSON, missing body) → **400** `{"error":"INVALID_REQUEST","message":"Body must be an event object or an array of events"}` and record an attempt (best effort).
- Empty array → 200 `{"results":[]}`.
- Otherwise **200** with `{"results":[{"event_id":..., "status":..., "message":...}]}`, same order and length. For an unusable item, `event_id` is `null`.
- JSON parse errors are caught by a custom Express error handler (no stack trace leakage).
- Body size limit (e.g. 1 MB) and a max batch size (e.g. 1000 → 400 if exceeded; document it).

### 7.10 Domain events (internal bus)

`EVENT_ACCEPTED`, `VOID_RESOLVED`, `EVENT_ACKNOWLEDGED`. Services collect them during the transaction and flush **only after commit**. Subscribers today: a logger and the audit/metrics hook. Later these become broker messages.

---

## 8. MQTT design (17 marks)

Config: `MQTT_URL=mqtt://152.42.238.142:1883`, `CANDIDATE_ID=09`, protocol 3.1.1 (`protocolVersion: 4`) or 5, QoS 1, retain false.
Client ID: `fse01-${CANDIDATE_ID}-${random6}` (new suffix per process start).
Topics: `fse-01/${CANDIDATE_ID}/challenge` (subscribe), `/response`, `/status` (publish).

### Worker lifecycle (`worker.ts`)
1. Connect with `will: {topic: status, payload: OFFLINE JSON, qos:1, retain:false}`, `reconnectPeriod` with exponential backoff plus jitter (1s → 30s cap), `clean: true`.
2. On every `connect`: **re-subscribe** (don't trust persistent sessions) to the challenge topic QoS 1; after the SUBACK callback, publish `ONLINE`.
3. Heartbeat timer every **20 s** (requirement: at most 30 s), publishing `HEARTBEAT`; cleared on close; restarted after reconnect.
4. On graceful shutdown: publish `OFFLINE`, then `end()`.
5. Track in memory for the status endpoint (fed from the DB where relevant): connected flag, last connect/disconnect time, last error, client id, subscribed flag. Challenge counts and last challenge/response come from `mqtt_challenges` (durable).
6. Never crash on bad payloads: wrap the message handler in try/catch, log, and record `last_error`.

### `handle_mqtt_challenge(rawPayload, deps) → {response, publish}` (`service.ts`)
Order matters:
1. Parse JSON. Unparseable / not an object → publish FAILED `VALIDATION_ERROR` (challenge_id null), record last_error.
2. Compute `request_digest = sha256(canonicalJSON(body))` (sorted keys).
3. If `challenge_id` is a non-empty string, acquire `pg_advisory_xact_lock(hashtext('ch:'+challenge_id))` and `SELECT` from `mqtt_challenges`:
   - **Found, same digest** → re-publish the **stored response**, no processing.
   - **Found, different digest** → publish FAILED / `CHALLENGE_CONFLICT` (this conflict response is not allowed to overwrite the original; store it as a log/attempt, keep the original row).
4. Validate envelope in this order, each with its stable error code: `protocol_version === "1.0"` (else `UNSUPPORTED_PROTOCOL`), `candidate_id === CANDIDATE_ID` (else `CANDIDATE_MISMATCH`), `challenge_id` present (else `VALIDATION_ERROR`), `command === "PROCESS_EVENTS"` (else `VALIDATION_ERROR`), `events` is an array (else `VALIDATION_ERROR`), `expires_at` valid and in the future relative to **receipt time** (else `CHALLENGE_EXPIRED`), `sent_at` valid (else `VALIDATION_ERROR`).
5. If valid → **inside one DB transaction**: `process_events(events, {channel:'MQTT', challenge_id})` (the same function as REST), `get_summary()` for the six-field state, build the COMPLETED response, and INSERT into `mqtt_challenges` with the serialized response. Because processing and persistence share a transaction, a crash cannot leave "processed but no stored response". On restart a retry reprocesses safely.
6. Failed validations also persist a FAILED response row (when `challenge_id` exists).
7. Publish to `/response` at QoS 1, wait for the PUBACK, then set `published_at`. If `now > expires_at` after processing, still publish (document the behavior), but log the late condition.
8. Any unexpected error → FAILED / `INTERNAL_ERROR` response, safe message.

Response shapes (match the spec exactly):
```json
{"protocol_version":"1.0","candidate_id":"09","challenge_id":"CH-…","status":"COMPLETED",
 "processed_at":"…Z","results":[{"event_id":"EV-101","status":"ACCEPTED"}],
 "state":{"net_total":5,"processed_events":1,"pending_ack":1,"unresolved":0,"duplicates":0,"conflicts":0}}
```
```json
{"protocol_version":"1.0","candidate_id":"09","challenge_id":"CH-…","status":"FAILED",
 "error_code":"CHALLENGE_EXPIRED","message":"Challenge expired at …","processed_at":"…Z"}
```
- `candidate_id` is envelope metadata only and is **not** part of event identity.
- A COMPLETED response may contain REJECTED items.
- `results` entries include `message` too (same item shape as REST).
- The `state` is global (no source filter) and read **after** the processing transaction's writes inside the same transaction, so it reflects this challenge.

### MQTT tests (no broker needed)
`handle_mqtt_challenge` receives an injected `publish` function. Tests call it directly. A manual real-broker run is done once with `scripts/simulate_challenge.ts` or the examiner's simulator.

---

## 9. Frontend design (12 marks)

Single page `frontend/index.html` + `app.js`, served at `/`. Responsive CSS grid (mobile ≤ 600 px: single column, tables become horizontally scrollable cards).

Sections:
1. **Header**: app name, backend health dot, source filter dropdown (All + sources loaded from the data), Refresh button, auto-refresh every 5 s (toggle).
2. **Submit panel**: `<textarea>` for one JSON event or array, "Submit" button, "Format JSON" and quick-fill samples (COUNT +5 LINE-01, duplicate, VOID-before-COUNT, mixed batch, invalid item). Sample fillers generate fresh IDs so the demo is repeatable. Client-side check: not-JSON → inline error (no request sent). Results area: one row per item with a colored status badge (ACCEPTED, DUPLICATE, CONFLICT, PENDING_REFERENCE, REJECTED) and the message. API failure (400/500/network) shows a clear error banner.
3. **Six indicator cards**: Net total, Processed events, Pending ack, Unresolved, Duplicates, Conflicts (values from `/api/state?view=summary`).
4. **Tabs: Pending | Exceptions** with a table each.
   - Pending: checkbox per row, "select all", columns event_id, source, quantity, event time, received, VOIDED badge. Button "Acknowledge selected (n)" → POST /api/ack → show per-ID result → refresh. Disabled when nothing is selected.
   - Exceptions: kind, event_id, source, reason, received_at, expandable raw payload.
   - States: loading skeleton, empty message ("Nothing waiting for review"), error with Retry.
5. **MQTT panel** (from `GET /api/mqtt/status`): connection state badge, assigned candidate ID, client ID, last challenge ID + time, last response status, counts (received / completed / failed), last error. All values are real backend values, never hard-coded.
6. Accessibility basics: labels, focus styles, `aria-live` for toasts.
7. Guard against XSS: render with `textContent`, never `innerHTML` of server data.

`GET /api/mqtt/status` returns: `{connected, candidate_id, client_id, subscribed, last_connected_at, last_error, last_challenge:{challenge_id,received_at,status,error_code}, counts:{received,completed,failed}}`.

---

## 10. Reliability and edge cases checklist (10 marks)

- [ ] Concurrent identical requests (20 parallel same event_id) → exactly 1 ACCEPTED, 19 DUPLICATE, `net_total` correct. Mechanism: advisory locks plus unique index plus `ON CONFLICT`.
- [ ] Concurrent COUNT and VOID race (VOID arrives while COUNT inserts) → both orders end in the same final state (net_total 0, VOID applied once).
- [ ] Two VOIDs for one COUNT → second REJECTED with a clear reason; DB index prevents a double reversal.
- [ ] Deadlock avoidance: locks taken in sorted order at batch start.
- [ ] Batch with invalid middle item: items 1 and 3 succeed, item 2 REJECTED, order preserved.
- [ ] In-batch dependency: `[VOID(EV-9→EV-8), COUNT EV-8]` resolves in the same batch.
- [ ] Same event_id twice in one batch → ACCEPTED then DUPLICATE.
- [ ] Server restart: all data in PG, `net_total` identical after restart (test: new pool, same numbers).
- [ ] MQTT reconnect: resubscribe, republish ONLINE, heartbeat resumes.
- [ ] Replayed challenge: same id and body → same stored response, zero new events. Same id and changed body → CHALLENGE_CONFLICT.
- [ ] Expired challenge → FAILED/CHALLENGE_EXPIRED, nothing processed.
- [ ] No stack traces or SQL in any error response; test one forced DB failure.
- [ ] Ack: repeated, duplicated-in-request, unknown, not-ready, ack-then-late-VOID still reverses.
- [ ] Huge or odd payloads: body size limit, batch size limit, non-object items.

---

## 11. Automated tests (5 required + extras) — `vitest`, real Postgres test DB

Setup: `TEST_DATABASE_URL`, `beforeEach` truncate all tables (`RESTART IDENTITY CASCADE`), migrations run once in `globalSetup`.

**Required five (must be meaningful):**
1. `COUNT and total`: submit COUNT +5 (LINE-01) → ACCEPTED; `get_summary` gives `net_total 5, processed_events 1, pending_ack 1`; add COUNT +3 → 8; VOID of first → 3.
2. `Duplicate without double counting`: same payload twice → second DUPLICATE; net_total unchanged; `duplicates = 1`; both attempts exist in `submission_attempts`.
3. `VOID-before-COUNT resolution`: VOID first → PENDING_REFERENCE, `unresolved 1`, net_total 0; then COUNT → resolved automatically, `unresolved 0`, net_total 0, VOID auto-acked, COUNT appears (VOIDED) in pending.
4. `Repeated acknowledgement`: ack ["EV-101"] → ACKED; again → ALREADY_ACKED; ["EV-101","EV-101"] fresh → ACKED, ALREADY_ACKED; unknown → NOT_FOUND; pending VOID → NOT_READY.
5. `Repeated MQTT challenge`: `handle_mqtt_challenge` with the same challenge twice → identical responses, event processed once, one `mqtt_challenges` row; same ID with changed body → FAILED/CHALLENGE_CONFLICT.

**Extra reliability credit (do if time):**
6. Conflict: same event_id, different quantity → CONFLICT, original unchanged, `conflicts = 1`.
7. Concurrency: `Promise.all` of 20 identical POSTs → net_total stays correct.
8. Mixed batch order and partial success.
9. Restart recovery: close the pool, reopen, same summary.
10. MQTT validation failures: wrong candidate, expired, bad protocol, bad command, each with the expected code.
11. REST contract: HTTP 400 for string/number/null bodies, 200 for arrays with rejected items, invalid view → 400.
12. Invariant test: `net_total == SUM(counts) − SUM(applied void quantities)`.
13. Source filtering for summary/pending/exceptions.

Run: `npm test`. Take a screenshot of the green run.

---

## 12. Documentation deliverables

**README.md**: prerequisites; `cp .env.example .env`; `docker compose up -d` (or local Postgres commands); `npm install`; `npm run migrate`; `npm run dev`; open `http://localhost:3000`; `npm test`; **all REST examples as curl** (single COUNT, duplicate, VOID-before-COUNT, mixed batch with an invalid item, bad body → 400, GET state ×3 views and with `source_id`, POST ack incl. repeated); MQTT topics, client ID format, and a sample challenge/response; env var table; troubleshooting.

**TECHNICAL_EXPLANATION.md**: entity model (with ER sketch), module/function boundaries and call diagram (`REST|MQTT → validate_event → process_events → PostgreSQL → domain events → state/ack/audit`), which function owns COUNT (`process_count`), why REST and MQTT share the service, transaction and duplicate strategy (advisory locks, unique indexes, `ON CONFLICT`, per-batch transaction), pending VOID resolution, restart behavior, **future microservice migration path** (events, query/state, ack, mqtt-gateway services; replace the in-process bus with a broker via an outbox table, give each module its own schema/DB, contracts already isolated in `shared/contracts`), known assumptions table (U1–U10 plus examiner answers), known limitations.

**AI_USAGE.md**: tools used (Antigravity and which models), what was AI-generated vs hand-written, what you reviewed/changed, and the link or export of the AI conversation record (required; export the chat before submission). No secrets.

**Screenshots** (`/screenshots`): dashboard overall, after COUNT, duplicate result, VOID-before-COUNT resolved, pending acknowledged, REST tests (Postman/curl), successful MQTT challenge + response, error state, test run output.

---

## 13. Phase prompts for the Antigravity agent (run one at a time)

**Phase A: scaffold (target 10 min)**
> Following PLAN.md sections 4–6 and Agent Rules, scaffold the Node 20 + TypeScript (tsx) project with Express, pg, mqtt, vitest. Create the folder layout, `config.ts`, `shared/db.ts` with `withTransaction`, `docker-compose.yml`, `.env.example` (DATABASE_URL, TEST_DATABASE_URL, PORT, CANDIDATE_ID, MQTT_URL), `.gitignore`, and `migrations/001_init.sql` + `migrations/run.ts` exactly as in section 6. Add npm scripts: dev, migrate, test. `git init` and make the first commit "chore: scaffold project and PostgreSQL schema". Stop after running the migration successfully.

**Phase B: events core (20 min)**
> Implement section 7.1–7.6 and 7.9: `validate_event`, `process_events`, `process_event`, `process_count`, `process_void`, `resolve_pending_voids`, repository SQL, and `POST /api/events` with a safe error handler. Keep routes thin. Use sorted advisory locks per batch and `ON CONFLICT`. Add the in-process domain event bus (flush after commit). Write tests 1–3 from section 11. Stop and show me the function call chain.

**Phase C: state and ack (8 min)**
> Implement 7.7–7.8: `GET /api/state` (summary, pending, exceptions with `source_id` filter) and `POST /api/ack` with ordered results and ALREADY_ACKED handling. Add test 4. Commit "feat: events, state and acknowledgement APIs with tests".

**Phase D: MQTT (12 min)**
> Implement section 8: `protocol.ts`, `handle_mqtt_challenge` (calls the same `process_events` and `get_summary` inside one transaction, persists the response, idempotent replay, CHALLENGE_CONFLICT), the worker (LWT OFFLINE, resubscribe on connect, ONLINE after SUBACK, 20 s heartbeat, backoff reconnect, graceful OFFLINE), and `GET /api/mqtt/status`. Add test 5 using an injected publish function. Add `scripts/simulate_challenge.ts` that publishes a sample challenge to my topic and prints the response.

**Phase E: frontend (12 min)**
> Build `frontend/` per section 9 using plain HTML/CSS/ES modules served by Express. Use real API data only. Handle loading, empty, invalid JSON, API failure. Render via textContent. Make it usable at 375 px width. Commit "feat: dashboard frontend with MQTT panel".

**Phase F: hardening and tests (10 min)**
> Implement the extra tests from section 11 (6–13) and fix any bug they reveal. Show the concurrency test result. Do not change behavior silently; list each change.

**Phase G: docs (8 min)**
> Generate README.md, TECHNICAL_EXPLANATION.md and AI_USAGE.md from section 12 and the actual code. Verify every command in the README actually works. Commit "docs: README, technical explanation and AI usage".

**Phase H: final check**
> Run the clean-clone check: fresh clone → `.env` from example → migrate → dev → submit events → restart → state unchanged → tests green. Produce a ZIP (without node_modules, .env, caches) via `git archive`.

---

## 14. Live demo script (9.1) — rehearse once

1. Open the dashboard. One-line pitch: "Supervisor sees reliable totals, exceptions, and acknowledges reviewed events; support sees device health."
2. Submit `{"source_id":"LINE-01","event_id":"EV-101","type":"COUNT","quantity":5,"target_event_id":null,"event_time":"2026-10-09T10:30:00Z"}` → ACCEPTED; net_total 5, pending_ack 1 (point out values come from PostgreSQL).
3. Submit the exact same event → DUPLICATE; net_total still 5; duplicates 1.
4. Submit VOID `EV-102` targeting `EV-103` → PENDING_REFERENCE (unresolved 1). Then COUNT `EV-103` (+4) → shows automatic resolution (unresolved 0, net_total back to 5).
5. Switch to Pending, select rows, Acknowledge → show ACKED results and a reduced pending count.
6. Show the MQTT panel with a real challenge and its response. Trigger the examiner simulator, then show the exceptions or error state (an invalid item or an expired/mismatched challenge) with a reason.
7. If asked: restart the server, refresh, state is identical.

---

## 15. Review Q&A cheat sheet (10 marks of explanation)

- **Entity model?** production_sources, production_events (the ledger), submission_attempts (audit of every request), mqtt_challenges (idempotent protocol log), audit_log.
- **Which function owns a COUNT?** `process_count` in `events/service`; everything else (REST, MQTT) calls `process_events`.
- **Why do REST and MQTT call the same service?** One set of rules → no drift, one place to test, one place to change.
- **Where are DB transactions used?** `process_events` (per batch), `acknowledge_events`, `handle_mqtt_challenge` (processing + response persistence together).
- **How do you stop double counting under concurrency?** Sorted advisory locks + `UNIQUE(event_id)` + `ON CONFLICT DO NOTHING` + re-classify as DUPLICATE/CONFLICT.
- **Why can't a COUNT be reversed twice?** Partial unique indexes on live VOIDs per target and on `voided_by_event_id`.
- **How to split into microservices later?** Events service owns the ledger tables; State becomes a read model fed by domain events (outbox → broker); Ack its own service/table; MQTT gateway translates envelope → event commands. Contracts in `shared/contracts` become the schemas. The in-process bus is already the seam.
- **Trace one challenge:** broker → worker `on message` → `handle_mqtt_challenge` → digest/replay check → envelope validation → `process_events` → PG commit (events + challenge row) → build response with `get_summary` → publish QoS 1 → PUBACK → `published_at`.
- **What happens after restart?** All state is in PG; the worker reconnects, resubscribes, republishes ONLINE; replayed challenges return the stored response.

**"Change one rule" drills (practice each in <3 min):**
1. Cap COUNT quantity at 1000 → edit only `validate_event`; other modules untouched; add a test.
2. Allow a VOID only within 24 h of the COUNT's `event_time` → edit only `process_void`.
3. Auto-acknowledge COUNT quantities of 0 / small counts → edit only `process_count`.
4. Change heartbeat from 20 s to 10 s → edit only the worker constant.
5. Make `duplicates` ignore MQTT attempts → edit only the summary query.

---

## 16. Optional bonus (up to 3 marks, only after everything above works)

- Add `proto/events.proto` (`ProductionEvent`, `ProcessEventsRequest/Response`, `StateSummary`) with explicit field numbers; never reuse numbers, reserve removed ones, add new fields as optional only.
- Use `protobufjs` to encode/decode in a small demo script and in an optional `Content-Type: application/x-protobuf` path that maps to the same `process_events`.
- JSON contracts must keep working. Explain backward/forward compatibility (unknown fields ignored, field numbers are the wire identity).

---

## 17. Submission checklist (final 5 minutes)

- [ ] Runnable backend + frontend; migrations; 3 REST APIs; MQTT worker connected to 152.42.238.142:1883 with my candidate topics
- [ ] ≥ 5 passing automated tests (screenshot)
- [ ] GitHub repo pushed with ≥ 3 meaningful commits (scaffold/schema, events/APIs, MQTT, frontend, docs)
- [ ] README (exact commands + REST examples + MQTT topics + sample flow), TECHNICAL_EXPLANATION, AI_USAGE + AI conversation record, `.env.example`
- [ ] Screenshots: dashboard, REST tests, successful MQTT challenge
- [ ] ZIP without node_modules/caches/.env/credentials (`git archive -o submission.zip HEAD`)
- [ ] Submitted via the Google Form before the deadline
- [ ] Final question: can another engineer run the README, open the frontend, send REST + MQTT events, restart, and still see correct PostgreSQL-backed state? Can I explain every important function?

---

## 18. Risk register (what can sink the score, and the fix)

| Risk | Fix |
|---|---|
| Docker unavailable on the exam machine | README documents local Postgres (`createdb fse01`); `DATABASE_URL` configurable |
| Broker unreachable / firewalled | Test early (phase D), log `last_error`, the dashboard shows the failure honestly; keep the offline `simulate_challenge` script |
| Wrong candidate ID in topics | Single `CANDIDATE_ID` env; the dashboard shows it; confirm with the examiner |
| AI-generated code I can't explain | Read each function after generation; keep it small; rehearse section 15 |
| Over-engineering | Skip Section 16 and extra tests until all mandatory items work |
| Spec contradictions (U1, U2) | Ask in Stage 2; document the chosen assumption |
| Leaking secrets in ZIP/Git | `.gitignore` first; `git status` check; only `.env.example` committed |
