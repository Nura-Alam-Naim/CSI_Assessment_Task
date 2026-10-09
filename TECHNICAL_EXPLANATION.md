# Technical & Architectural Explanation

This document explains the deep technical decisions, concurrency strategies, and the data model designed for the FSE-01 Production Event Processing system.

## 1. Database Entity Model
The system relies entirely on PostgreSQL for strict consistency, eliminating the need for complex distributed memory locks like Redis.

### Core Tables
1. **`production_events`**: The immutable ledger of reality. It strictly contains logical events (COUNTs and VOIDs). Data is never physically deleted. 
   - **Constraints**: 
     - `UNIQUE(event_id)`: Prevents identical payloads from being processed twice.
     - Partial Unique Index `uq_one_live_void_per_target`: Ensures a specific COUNT can only have a single active VOID applied to it at any given time.
2. **`submission_attempts`**: An audit log storing *every* payload received via REST or MQTT, including invalid requests, duplicates, and conflicts. It acts as the raw historical truth before business logic classification.
3. **`mqtt_challenges`**: An idempotent log of MQTT payloads. Because MQTT guarantees at-least-once delivery (QoS 1), this table prevents duplicate challenge processing by storing and re-publishing the previously calculated response.

## 2. Core Processing Flow
All inputs (whether from the Express HTTP controllers or the MQTT `on('message')` handler) converge into a single pure business logic entrypoint: `process_events()` in `events/service.js`.

**Why converge them?** 
Having a single pipeline ensures that REST and MQTT share identical validation rules, state resolution behaviors, and database transactional guarantees. It prevents architectural drift.

## 3. Concurrency Strategy (Handling High Throughput)
When 20 concurrent network requests try to insert `EV-101` at the exact same millisecond, race conditions are mitigated natively inside PostgreSQL:

1. **Advisory Locks**: 
   Before processing a batch, `process_events()` generates a sorted array of all `event_id` and `target_event_id` strings, hashes them, and acquires a Postgres advisory lock (`pg_advisory_xact_lock`). Sorting prevents deadlocks. This serializes requests targeting the same logical event without locking the whole table.
2. **`ON CONFLICT DO NOTHING`**: 
   The SQL `INSERT` statement relies on the unique constraint on `event_id`. If a concurrent transaction wins the lock and inserts `EV-101`, the loser's `INSERT` simply does nothing. 
3. **State Recovery**:
   The losing transaction detects that no row was returned, requeries the database, compares the payload hash, and gracefully categorizes the attempt as a `DUPLICATE` (if identical) or a `CONFLICT` (if the quantities differ).

## 4. Pending VOID Resolution Strategy
In distributed systems, out-of-order delivery is common. A `VOID` (reversal) might arrive *before* the `COUNT` it intends to reverse.
- **Arrival of premature VOID**: Inserted with status `PENDING_REFERENCE`. It does not affect the `net_total`.
- **Arrival of COUNT later**: Once the COUNT successfully inserts, the service triggers `resolve_pending_voids()`. This looks for any `PENDING_REFERENCE` VOIDs targeting this new COUNT, resolves them to `ACCEPTED`, and updates the counts atomically in the same transaction.

## 5. Transaction Boundaries & Partial Failures
Each batch submitted via `/api/events` or MQTT is wrapped in a single `BEGIN ... COMMIT` PostgreSQL transaction.
- **Validation Failures**: If an item in a batch is invalid (e.g. missing `quantity`), it is recorded as `REJECTED` in `submission_attempts`. The transaction *continues* and processes the remaining valid items.
- **Infrastructure Failures**: If the database throws a serialization error or runs out of memory, the entire transaction rolls back cleanly, ensuring no partial phantom writes occur.

## 6. Future Microservices Migration Path
Currently implemented as a Modular Monolith, this system is structurally prepared to be split into Microservices:
1. **Events Service**: Takes ownership of the `production_events` table and exposes gRPC/HTTP endpoints for payload ingestion.
2. **State & Read-Model Service**: Listens to an external message broker (e.g., Kafka) instead of the Node.js `EventEmitter`. It would consume `EVENT_ACCEPTED` messages to build materialized views for the frontend dashboard.
3. **MQTT Gateway Service**: An isolated Node.js worker that only subscribes to the broker, validates MQTT envelopes, and pushes them onto a Kafka queue for the Events Service to process, fully separating network I/O from heavy database transactions.

## 7. Change Request FSE-01 CR1
### Changes Made
| Module | Change |
| --- | --- |
| `events/validation` | Added `MAX_COUNT_QUANTITY = 500` and validation rejection logic. |
| `state/queries` | Added `rejected_submissions` to the `attemptsQuery` to automatically count `REJECTED` attempts. |
| `tests/api.test.js` | Added T1-T6 and T14 test coverage for quantity limit rules and Phase 3 summary tests. |
| `frontend` | Upgraded `App.jsx` to feature a `datalist`-backed text input filter for `source_id`, full URL parameter persistence, an active filter chip, a stale-response guard via `AbortController`, and a distinct seventh "Rejected Submissions" indicator card on the dashboard. |

### Why No Rewrite Was Needed
The application architecture was successfully leveraged without requiring structural rewrites:
- The 500 cap is a strict validation rule owned by one pure function (`validate_event`). Since both REST and MQTT pipelines already route through this validation logic, the rule applied globally with zero handler modifications.
- The `rejected_submissions` metric is a simple aggregate over the `submission_attempts` table, which already perfectly stores every attempt alongside its `classification` and `source_id`.
- The MQTT handler `handle_mqtt_challenge` uses `get_summary()` directly to build the response state, meaning the new field was injected immediately without touching the MQTT logic.
- The frontend filter leverages an API parameter (`source_id`) that already existed.

### Assumptions
- **A1**: `rejected_submissions` counts `REJECTED` attempts from REST and MQTT, not "rejected-on-resolve" ledger rows.
- **A2**: The 500 cap is not retroactive; pre-existing accepted COUNTs stay valid.
- **A3**: Filter is an exact-match on `source_id`, trimmed, case-sensitive. The source list is derived from existing responses without requiring a new endpoint.
- **A4**: Rejected `event_id`s remain reusable because no ledger row exists.
