# Production Event Processing System & MQTT Dashboard

## 1. Project Overview
This repository contains a robust, full-stack event processing system designed for NorthBridge Garments (built by CSI Smart Tech Ltd). The system handles highly concurrent manufacturing line data, providing real-time analytics, strict transactional guarantees to prevent double-counting, and a resilient MQTT integration for IoT hardware.

## 2. Architecture & Tech Stack
- **Backend**: Node.js (v20+), Express.js (v5). We use a Modular Monolith architecture where domain logic is strictly isolated in service layers.
- **Database**: PostgreSQL 16. We deliberately avoided ORMs (like Prisma or TypeORM) in favor of the raw `pg` driver to utilize advanced database features such as `pg_advisory_xact_lock`, composite unique indexes, and `ON CONFLICT DO NOTHING` for bulletproof concurrency control.
- **MQTT Worker**: Built with `mqtt.js` (v5). It handles Quality of Service (QoS 1) subscriptions, automatic reconnections with exponential backoff, and heartbeat generation.
- **Frontend**: React + Vite + Tailwind CSS. Served statically by the Express backend to simplify deployment.
- **Testing**: `vitest` combined with `supertest` for fast, real-database integration testing.

## 3. Local Setup & Installation

### Step 3.1: Environment Configuration
Clone the repository and duplicate the environment template:
```bash
cp .env.example .env
```
Open `.env` and fill in the values (see the `.env.example` comments for guidance).

### Step 3.2: Database Initialization
The system requires PostgreSQL. You can use Docker or a native installation.

**Option A: Using Docker (Recommended)**
```bash
# Starts a local PostgreSQL 16 container on port 5433
docker compose up -d
```

**Option B: Using Native PostgreSQL**
If you do not have Docker installed, ensure PostgreSQL is running locally. Open your terminal and run:
```bash
createdb fse01
createdb fse01_test
```
*Note: Update the `DATABASE_URL` in your `.env` to point to `postgresql://postgres:postgres@127.0.0.1:5432/fse01` if using a native install on the default port.*

### Step 3.3: Install and Migrate
```bash
# Install all dependencies (backend and frontend)
npm install

# Run the database schema migrations
npm run migrate
```

### Step 3.4: Booting the Application
We use `concurrently` to run both the backend server and the frontend Vite build pipeline simultaneously:
```bash
npm run dev
```
- Open `http://localhost:3000` in your web browser to view the interactive dashboard.
- The MQTT worker will automatically connect to the broker defined in your `.env`.

---

## 4. API Documentation & Examples

### 4.1 Submit Events (`POST /api/events`)
Handles batch and single event submissions. Invalid items are rejected individually while valid items in the same batch succeed (Partial Failure tolerance).

**Submit a standard COUNT event (e.g. 450, Accepted):**
```bash
curl -X POST http://localhost:3000/api/events \
  -H 'Content-Type: application/json' \
  -d '{
    "source_id": "LINE-01",
    "event_id": "EV-450",
    "type": "COUNT",
    "quantity": 450,
    "event_time": "2026-10-09T10:30:00Z"
  }'
```

**Submit a standard COUNT event over 500 (Rejected):**
```bash
curl -X POST http://localhost:3000/api/events \
  -H 'Content-Type: application/json' \
  -d '{
    "source_id": "LINE-01",
    "event_id": "EV-501",
    "type": "COUNT",
    "quantity": 501,
    "event_time": "2026-10-09T10:30:00Z"
  }'
```

**Submit a VOID event (Correction):**
*Note: A VOID submitted before its target COUNT arrives is safely queued as `PENDING_REFERENCE` and resolves automatically later.*
```bash
curl -X POST http://localhost:3000/api/events \
  -H 'Content-Type: application/json' \
  -d '{
    "source_id": "LINE-01",
    "event_id": "EV-VOID-1",
    "type": "VOID",
    "target_event_id": "EV-101",
    "event_time": "2026-10-09T10:35:00Z"
  }'
```

### 4.2 Query State (`GET /api/state`)
Fetch real-time metrics, pending events, and exceptions directly from the database views. The dashboard features a Source Filter bar that allows filtering these views, and displays a seventh indicator card for "Rejected Submissions".

**Get Global Summary (Includes `rejected_submissions`):**
```bash
curl "http://localhost:3000/api/state?view=summary"
```

**Get Filtered Summary for LINE-01:**
```bash
curl "http://localhost:3000/api/state?view=summary&source_id=LINE-01"
```

**Get Pending Events (Requires Manual Acknowledgment):**
```bash
curl "http://localhost:3000/api/state?view=pending&source_id=LINE-01"
```

### 4.3 Acknowledge Events (`POST /api/ack`)
Moves events out of the supervisor's pending queue.
```bash
curl -X POST http://localhost:3000/api/ack \
  -H 'Content-Type: application/json' \
  -d '{"event_ids":["EV-101"]}'
```

### 4.4 Sample MQTT Response
The MQTT response state includes the seven fields:
```json
{
  "challenge_id": "CH-123",
  "status": "COMPLETED",
  "results": [
    { "event_id": "EV-501", "status": "REJECTED", "reason": "COUNT quantity 501 exceeds the maximum of 500 per event" }
  ],
  "state": {
    "net_total": 0,
    "processed_events": 0,
    "pending_ack": 0,
    "unresolved": 0,
    "duplicates": 0,
    "conflicts": 0,
    "rejected_submissions": 1
  }
}
```

---

## 5. MQTT Integration Details
The system acts as an MQTT client connecting to the central broker. 
- **Broker**: `mqtt://152.42.238.142:1883`
- **Assigned Candidate ID**: Configurable via `CANDIDATE_ID` in `.env` (Default: `09`)
- **Client Identity**: `fse01-{CANDIDATE_ID}-{random_hex}`
- **Topics**:
  - `fse-01/{CANDIDATE_ID}/challenge`: (Subscribe) Listens for event batches from IoT simulators.
  - `fse-01/{CANDIDATE_ID}/response`: (Publish) Pushes `COMPLETED` or `FAILED` resolution receipts.
  - `fse-01/{CANDIDATE_ID}/status`: (Publish) Pushes `ONLINE`, `HEARTBEAT` (every 20s), and `OFFLINE` (Last Will and Testament).

## 6. Testing Strategy
Our test suite relies on `vitest`. We truncate the test database between every run to ensure pristine isolation.

To run the automated test suite:
```bash
npm test
```
