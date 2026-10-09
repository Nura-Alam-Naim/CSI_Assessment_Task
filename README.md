# Production Event Processing Dashboard + MQTT

## Prerequisites
- Node.js v20+
- PostgreSQL 16 (via Docker or local installation)
- npm

## Setup
1. Clone the repository
2. Copy the `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Start PostgreSQL using Docker:
   ```bash
   docker compose up -d
   ```
   *If you do not have Docker, create a local PostgreSQL database named `fse01` and update `DATABASE_URL` in `.env`.*
4. Install dependencies:
   ```bash
   npm install
   ```
5. Run migrations:
   ```bash
   npm run migrate
   ```
6. Start the server (backend + frontend concurrently):
   ```bash
   npm run dev
   ```
7. Open `http://localhost:3000` in your browser.

## Testing
Run the automated test suite against the test database:
```bash
npm test
```

## REST API Examples
**Submit single COUNT:**
```bash
curl -X POST http://localhost:3000/api/events -H 'Content-Type: application/json' -d '{"source_id":"LINE-01","event_id":"EV-101","type":"COUNT","quantity":5,"event_time":"2026-10-09T10:30:00Z"}'
```

**Submit DUPLICATE:**
```bash
curl -X POST http://localhost:3000/api/events -H 'Content-Type: application/json' -d '{"source_id":"LINE-01","event_id":"EV-101","type":"COUNT","quantity":5,"event_time":"2026-10-09T10:30:00Z"}'
```

**Submit VOID before COUNT:**
```bash
curl -X POST http://localhost:3000/api/events -H 'Content-Type: application/json' -d '{"source_id":"LINE-01","event_id":"EV-VOID","type":"VOID","target_event_id":"EV-MISSING","event_time":"2026-10-09T10:35:00Z"}'
```

**Bad Body -> 400:**
```bash
curl -X POST http://localhost:3000/api/events -H 'Content-Type: application/json' -d '"string_instead_of_object"'
```

**Get State:**
```bash
curl http://localhost:3000/api/state?view=summary
curl http://localhost:3000/api/state?view=pending
curl http://localhost:3000/api/state?view=exceptions
```

**Acknowledge Events:**
```bash
curl -X POST http://localhost:3000/api/ack -H 'Content-Type: application/json' -d '{"event_ids":["EV-101"]}'
```

## MQTT
- **Broker**: `mqtt://152.42.238.142:1883`
- **Candidate ID**: Set `CANDIDATE_ID` in `.env` (Default: `09`)
- **Client ID**: `fse01-09-xxxxxx`
- **Topics**:
  - `fse-01/09/challenge` (Subscribe to receive events)
  - `fse-01/09/response` (Publish COMPLETED/FAILED responses)
  - `fse-01/09/status` (Publish LWT and Heartbeats)

## Troubleshooting
- **Database Connection Error**: Ensure PostgreSQL is running on port 5433 (default via docker-compose) or update `.env`.
- **MQTT Errors**: The dashboard displays live connection status and last errors in the MQTT Status Panel.
