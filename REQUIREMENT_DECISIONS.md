# Requirement Decisions & Assumptions

This document outlines how specific ambiguities or edge-cases in the original requirements brief were interpreted and resolved in the codebase.

| ID | Edge Case | Decision | Implementation Details |
|---|---|---|---|
| **U1** | Is `event_id` globally unique, or unique per `source_id`? | **Globally Unique**. | A global `UNIQUE(event_id)` constraint is enforced in PostgreSQL. Receiving the same `event_id` from a different source is flagged as a `CONFLICT`. |
| **U2** | Should a batch transaction rollback entirely if a single item is invalid? | **Partial Failure Tolerated**. | Only infrastructure errors trigger a DB rollback. Logical validation failures mark individual items as `REJECTED`, allowing valid siblings to persist successfully. |
| **U3** | Does a voided `COUNT` stay in the pending-ack list? | **Yes.** | Completed COUNTs stay reviewable until acknowledged by the supervisor. The UI visually flags them with a `VOIDED` badge. |
| **U4** | What happens if `view` is omitted in `GET /api/state`? | **Default to summary.** | Handled natively in the Express controller. Invalid views return HTTP 400. |
| **U5** | Can a `VOID` event originate from a different `source_id` than its target `COUNT`? | **No.** | It is flagged as `REJECTED` with the reason `SOURCE_MISMATCH`. |
| **U6** | What is the shape of the MQTT `/status` endpoint payload? | **Custom Shape.** | Defined as `{ connected, candidate_id, client_id, subscribed, last_connected_at, last_error, last_challenge, counts }` to power the React dashboard UI. |
| **U7** | The brief requires exactly 3 REST APIs, but the frontend needs MQTT data. | **Added a 4th read-only API.** | `GET /api/mqtt/status` was added exclusively to serve UI telemetry without polluting the mandatory business APIs. |
| **U8** | What happens if an MQTT Challenge has expired relative to receipt time? | **Failed Response.** | The broker responds with `FAILED` and `CHALLENGE_EXPIRED`. The original logical events are *not* processed. |
| **U9** | Can a `VOID` have an `event_time` earlier than its target `COUNT`? | **Yes.** | The `event_time` is strictly an IoT device timestamp. Arrival order governs resolution mechanics. |
| **U10**| What happens if an MQTT Simulator resends an identical payload? | **Idempotent Return.** | We compute a SHA256 digest of the request. Identical requests instantly return the historically saved `COMPLETED` response without hitting the event service. |
