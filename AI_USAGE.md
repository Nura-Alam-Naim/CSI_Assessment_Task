# AI Usage & Collaboration

This document outlines the usage of Artificial Intelligence tooling during the development of this assessment.

## Tools Utilized
- **IDE**: Antigravity IDE
- **Models**: Gemini Models (Deepmind)
- **Role**: Pair-Programming Assistant / Autonomous Agent

## Development Process
The AI was heavily utilized to autonomously scaffold, implement, and refactor the backend architecture, PostgreSQL migrations, the React frontend, and the MQTT protocol layers according to the strict guidelines provided in `FSE01_MEGAPLAN.md`.

### What the AI Generated
1. **PostgreSQL Migrations**: Generated the exact `CREATE TABLE` and `CREATE INDEX` constraints to handle transactional integrity (e.g., partial unique indices, ON CONFLICT strategies).
2. **Backend Express Handlers**: Implemented the modular monolith service architecture (`routes.js` -> `service.js` -> `db.js`) and REST APIs.
3. **MQTT Protocol Logic**: Designed the QoS 1 reconnection logic, LWT (Last Will and Testament), and the idempotent `handle_mqtt_challenge` processor.
4. **React Dashboard**: Built the responsive Vite + TailwindCSS frontend, adding complex UI logic for mixed batch submission, JSON validation, and MQTT status polling.
5. **Testing**: Configured the `vitest` suite and wrote the automated test logic.

### Human Intervention & Review
The human developer (Candidate) performed the following critical oversight:
1. **Requirements Planning**: Supplied the architectural blueprint (`FSE01_MEGAPLAN.md`) and dictated the execution phases (Phases A-H).
2. **Bug Triaging**: Intervened when the Vite frontend build pipeline threw CJS/ESM compilation warnings, directing the agent to refactor configuration files. 
3. **Route Compatibility Checks**: Supervised the migration of Express routing logic (specifically wildcards) to ensure compatibility with Express v5.
4. **Validation Auditing**: Manually checked that the AI did not hallucinate business logic and strictly followed the exact-once counting and out-of-order VOID resolution logic.
5. **Documentation & Deliverables**: Directed the AI to heavily expand upon technical decisions, assumptions, and edge-case handling in the markdown documentation.
