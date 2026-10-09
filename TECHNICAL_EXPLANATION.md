# Technical Explanation

## Entity Model & Call Diagram
The database strictly enforces correctness using the following entities:
- **`production_events`**: The core ledger table storing only logical, un-overwritten events (COUNT / VOID).
- **`submission_attempts`**: An audit table storing every single request received (valid, invalid, duplicate, conflict).
- **`mqtt_challenges`**: An idempotent log of broker payloads and server responses.
- **`production_sources`**: Foreign key constraints for line IDs.

**Call Flow**:
`REST / MQTT` -> `events/validation.js` -> `events/service.js (process_events)` -> `PostgreSQL` -> `events/service.js (process_count / process_void / resolve_pending)` -> `Domain Event Queue`

## Logic Ownership
The `process_count` function (inside `src/modules/events/service.js`) is the absolute sole owner of inserting and applying COUNT logic. REST controllers and the MQTT worker merely parse envelopes and pass the payload directly to `process_events`.

## Transaction & Concurrency Strategy
- **Advisory Locks**: `pg_advisory_xact_lock(hashtext(event_id))` is called for every event at the start of a batch, sorted alphabetically to eliminate deadlocks.
- **`ON CONFLICT DO NOTHING`**: Eliminates any possibility of a race condition double inserting. If an insert fails, we re-query and gracefully mark it as `DUPLICATE` or `CONFLICT`.
- **Pending VOID Resolution**: Resolved safely inside the same transaction block as the COUNT insertion.

## Microservice Migration Path
While currently a Modular Monolith, this architecture is primed for a microservices split:
1. **Events Service**: Retains `production_events` and the core `events/service.js`.
2. **State Service**: Listens to an outbox broker pattern (replacing the internal `EventEmitter`) to build its read models.
3. **MQTT Gateway**: Runs independently, translating the MQTT envelope into a Kafka/RabbitMQ queue message feeding into the Events Service.

## Assumptions
- (U1) Event IDs are globally unique.
- (U2) If a single item in a batch fails logical validation, the item is marked `REJECTED` and the rest proceed. Only infrastructure DB faults rollback the whole batch.
- (U5) A VOID from a different source ID than its target COUNT is treated as a `SOURCE_MISMATCH` rejection.
- (U9) Expired MQTT challenges receive a stored `FAILED` response.
