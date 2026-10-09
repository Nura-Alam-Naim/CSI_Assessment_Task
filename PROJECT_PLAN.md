# Project Plan: Production Event Processing System

## 1. Project Overview
A full-stack modular monolith system designed to process production events (COUNT and VOID) natively through MQTT ingestion and REST APIs. The system ensures data integrity using PostgreSQL, handles concurrency, and provides a modern React dashboard for real-time monitoring.

## 2. Technology Stack
- **Backend:** Node.js (v20+), Express.js 4 (Plain JavaScript, **NO TypeScript**)
- **Database:** PostgreSQL 16 (via `pg` driver, using raw SQL/transactions)
- **MQTT Client:** `mqtt` (MQTT.js v5)
- **Testing:** `vitest` and `supertest` for comprehensive endpoint testing
- **Frontend:** React.js, Vite, TailwindCSS (for modern, dynamic UI)

## 3. MQTT Broker Configuration & Data Flow
The system's primary data ingestion relies on connecting to the MQTT broker:
- **Broker IP:** `152.42.238.142`
- **Port:** `1883`
- **URL Format:** `mqtt://152.42.238.142:1883`
- **Data Ingestion:** The MQTT worker will continuously listen for events/challenges. Data received via MQTT will be processed and saved directly into the PostgreSQL database.

## 4. Architecture Rules
1. **Single Source of Truth:** PostgreSQL is the only state store. No in-memory storage for totals or events.
2. **Shared Business Logic:** Both REST APIs and MQTT handlers route to a shared `process_events` logic layer.
3. **Comprehensive Testing:** Every single API endpoint and MQTT interaction must have automated tests.
4. **Version Control:** A `git commit` will be made at the completion of every single implementation phase.

## 5. File Structure
The exact folder structure to be strictly followed (adapted for JavaScript and React):

```text
fse01/
├─ src/
│  ├─ app.js                     # build express app (no listen) for tests
│  ├─ server.js                  # start HTTP + MQTT worker, graceful shutdown
│  ├─ config.js                  # env parsing (DATABASE_URL, CANDIDATE_ID, MQTT_*)
│  ├─ modules/
│  │  ├─ events/
│  │  │  ├─ routes.js            # POST /api/events (thin)
│  │  │  ├─ validation.js        # validate_event(): pure function
│  │  │  ├─ service.js           # process_events/process_event/process_count/process_void/resolve_pending_voids
│  │  │  └─ repository.js        # SQL only
│  │  ├─ ack/
│  │  │  ├─ routes.js            # POST /api/ack
│  │  │  ├─ service.js           # acknowledge_events()
│  │  │  └─ repository.js
│  │  ├─ state/
│  │  │  ├─ routes.js            # GET /api/state
│  │  │  ├─ service.js           # get_summary/get_pending/get_exceptions
│  │  │  └─ queries.js
│  │  ├─ mqtt/
│  │  │  ├─ worker.js            # connect, subscribe, heartbeat, reconnect, LWT
│  │  │  ├─ protocol.js          # validate envelope, build responses, error codes
│  │  │  ├─ service.js           # handle_mqtt_challenge()
│  │  │  └─ routes.js            # GET /api/mqtt/status (read-only)
│  │  └─ audit/
│  │     ├─ service.js
│  │     └─ repository.js
│  └─ shared/
│     ├─ db.js                   # pg Pool, withTransaction()
│     ├─ contracts.js            # shapes for event, item result, summary, challenge
│     ├─ domain_events.js        # tiny in-process bus: EVENT_ACCEPTED, VOID_RESOLVED, EVENT_ACKNOWLEDGED
│     └─ errors.js               # safe error mapper (no stack traces to clients)
├─ migrations/
│  ├─ 001_init.sql
│  └─ run.js
├─ frontend/                     # React application created via Vite
│  ├─ src/
│  ├─ package.json
│  └─ vite.config.js
├─ tests/                        # Comprehensive automated tests for all endpoints
├─ scripts/                      # (smoke.sh with curl examples, simulate_challenge.js)
├─ docker-compose.yml
├─ .env.example
├─ .gitignore                    # node_modules, .env, dist, coverage, *.zip
├─ README.md
├─ PROJECT_PLAN.md
└─ package.json
```

## 6. Implementation Phases & Git Strategy

### Phase 1: Setup & Infrastructure
- Initialize Node.js backend (no TypeScript).
- Setup file structure exactly as defined above.
- Setup PostgreSQL via `docker-compose.yml`.
- Write SQL migrations for tables: `production_sources`, `production_events`, `submission_attempts`, `mqtt_challenges`.
- **Commit:** `chore: initialize project and database schema`

### Phase 2: Core Event Logic & REST API
- Implement pure validation functions.
- Implement transactional event processing (`process_count`, `process_void`, `resolve_pending_voids`).
- Build REST endpoints:
  - `POST /api/events` (Submit batches)
  - `POST /api/ack` (Acknowledge reviewed events)
  - `GET /api/state` (Fetch summary, pending, and exceptions)
- **Commit:** `feat: implement core event processing and REST APIs`

### Phase 3: MQTT Worker & Data Ingestion
- Implement the MQTT client connecting to `mqtt://152.42.238.142:1883`.
- Ingest MQTT challenges, process them using the core logic, and persist data to PostgreSQL.
- Handle connection lifecycles (LWT, heartbeats) and expose `GET /api/mqtt/status`.
- **Commit:** `feat: integrate MQTT worker and data ingestion`

### Phase 4: Automated Testing Suite
- Write automated tests using `vitest` and `supertest`.
- Cover **EVERY endpoint**:
  - `POST /api/events` (Success, validation errors, partial batches)
  - `POST /api/ack` (Acknowledge, repeated acks, unknown IDs)
  - `GET /api/state` (Verify correct summary maths, pending lists, and exceptions)
  - `GET /api/mqtt/status`
- Test MQTT processing via function injection.
- **Commit:** `test: add comprehensive automated test suite for all endpoints`

### Phase 5: React & Vite Frontend Dashboard
- Initialize a React application using Vite (`npm create vite@latest`) inside the `frontend/` directory.
- Build a responsive dashboard featuring: 
  - Real-time metrics cards (Net Total, Pending, Exceptions).
  - Data tables for reviewing and acknowledging pending events.
  - MQTT Connection status panel.
  - Manual event submission interface for testing edge cases.
- **Commit:** `feat: build React and Vite dashboard frontend`

### Phase 6: Final Hardening & Integration
- E2E testing of the full flow (MQTT ingestion -> Database -> React UI).
- Ensure graceful shutdown of HTTP and MQTT connections.
- **Commit:** `fix: hardening, e2e integration, and graceful shutdown`
