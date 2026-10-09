# PostgreSQL Database Initialization & Migrations

This document explains how to set up the PostgreSQL database from scratch, how the schema is structured, and how migrations run automatically.

## 1. Database Installation & Initialization

You must have a running instance of PostgreSQL (Version 16 recommended) to run this application.

### Method A: Docker Compose (Recommended)
If you have Docker installed on your machine, simply run:
```bash
docker compose up -d
```
This automatically downloads the official `postgres:16` image, creates a database named `fse01_db` on port `5433` (as defined in `docker-compose.yml`), and initializes it with the user and password specified in `.env.example`.

### Method B: Native PostgreSQL Installation
If you prefer not to use Docker, or if you are running this on a machine where Docker is unavailable:

1. Install PostgreSQL natively for your OS (e.g., via Homebrew on Mac: `brew install postgresql@16`).
2. Start the PostgreSQL service.
3. Open your terminal and create the databases using the `createdb` command-line utility:
```bash
createdb fse01_db
createdb fse01_test_db
```
4. Update your `.env` file to point to your local installation (which defaults to port `5432`):
```env
DATABASE_URL=postgres://your_mac_username:@localhost:5432/fse01_db
TEST_DATABASE_URL=postgres://your_mac_username:@localhost:5432/fse01_test_db
```

## 2. Schema Migrations

This project does **not** rely on an ORM (like Prisma) for database migrations. Instead, it uses raw SQL files to guarantee that we can create advanced indexes, constraints, and triggers that ORMs often struggle with.

### How it Works
1. All SQL migration files are located in the `/migrations/` folder.
2. The custom `migrations/run.js` script connects to the database via the `pg` driver.
3. It creates a tracking table called `schema_migrations`.
4. It reads all `.sql` files, checks if they exist in `schema_migrations`, and if they don't, executes them sequentially in a transaction.

### Executing Migrations
To run the migrations manually, execute:
```bash
npm run migrate
```
*Note: The application is also configured to run migrations automatically when `npm run dev` boots up.*

## 3. The SQL Schema (`001_init.sql`)

The initial migration file contains the foundational tables for the system:

1. **`production_sources`**: A lookup table for factory line names.
2. **`production_events`**: The core ledger. 
   - **Crucial Constraint**: `CONSTRAINT uq_event_id_global UNIQUE (event_id)`. This forces the database engine to block any duplicate events globally, ensuring exactly-once processing regardless of network concurrency.
   - **Crucial Index**: `CREATE UNIQUE INDEX uq_one_live_void_per_target ... WHERE type = 'VOID' AND status = 'PENDING_REFERENCE'`. This guarantees that if two different void requests try to target the exact same count simultaneously, one will instantly be rejected at the database level.
3. **`submission_attempts`**: An append-only audit log tracking every single request (whether successful or rejected).
4. **`mqtt_challenges`**: An idempotent request store holding MQTT payload digests and their corresponding responses to prevent processing replayed messages.
