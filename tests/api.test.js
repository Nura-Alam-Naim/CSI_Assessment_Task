/**
 * FSE-01 Automated Integration Test Suite
 * 
 * This suite verifies the core business logic of the Production Event Processing System.
 * Tests are executed against a REAL PostgreSQL database (specified by TEST_DATABASE_URL).
 * We rely on `TRUNCATE CASCADE` before each test to ensure absolute isolation.
 * 
 * The suite guarantees the reliability of:
 * 1. Exactly-once processing (Duplicate detection)
 * 2. Out-of-order delivery resolution (VOID before COUNT)
 * 3. Supervisor acknowledgment state tracking
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { pool } from '../src/shared/db';

beforeAll(async () => {
  // Setup logic if necessary (pool connects automatically on query)
});

afterAll(async () => {
  // Gracefully close the DB pool to prevent test runners from hanging
  await pool.end();
});

beforeEach(async () => {
  // CRITICAL: Wipes the entire test database ledger clean before every single test.
  // This guarantees that tests do not pollute each other with leftover state.
  await pool.query('TRUNCATE TABLE production_events, submission_attempts, mqtt_challenges, audit_log, production_sources RESTART IDENTITY CASCADE');
});

describe('POST /api/events (Core Business Logic)', () => {
  
  /**
   * TEST 1: Standard Payload Insertion
   * Verifies that a valid COUNT payload increments the database totals accurately.
   */
  it('should accept a valid COUNT event and update the net total', async () => {
    const event = {
      source_id: 'LINE-01',
      event_id: 'EV-001',
      type: 'COUNT',
      quantity: 5,
      event_time: '2026-10-09T10:30:00Z'
    };
    
    const res = await request(app).post('/api/events').send(event);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].status).toBe('ACCEPTED');

    const stateRes = await request(app).get('/api/state?view=summary');
    expect(stateRes.body.net_total).toBe(5);
    expect(stateRes.body.processed_events).toBe(1);
  });

  /**
   * TEST 2: Exactly-Once Guarantee (Idempotency)
   * Verifies that submitting the exact same payload twice does not cause double counting.
   * The system should safely categorize the second attempt as a 'DUPLICATE'.
   */
  it('should identify a DUPLICATE event and prevent double counting', async () => {
    const event = {
      source_id: 'LINE-01',
      event_id: 'EV-002',
      type: 'COUNT',
      quantity: 5,
      event_time: '2026-10-09T10:30:00Z'
    };
    
    // First attempt succeeds
    await request(app).post('/api/events').send(event);
    
    // Second attempt is caught by the database UNIQUE constraint and handled gracefully
    const res = await request(app).post('/api/events').send(event);
    
    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe('DUPLICATE');

    const stateRes = await request(app).get('/api/state?view=summary');
    expect(stateRes.body.net_total).toBe(5); // Still 5!
    expect(stateRes.body.duplicates).toBe(1); // Metric incremented
  });

  /**
   * TEST 3: Out-of-Order Delivery (Distributed Systems Resilience)
   * In a distributed network, a VOID payload might physically arrive at the server
   * BEFORE the COUNT payload it intends to reverse. The system must queue the VOID
   * as 'PENDING_REFERENCE' and automatically apply it the moment the COUNT arrives.
   */
  it('should resolve a pending VOID automatically when the missing COUNT finally arrives', async () => {
    const voidEvent = {
      source_id: 'LINE-01',
      event_id: 'EV-VOID-1',
      type: 'VOID',
      target_event_id: 'EV-COUNT-1',
      event_time: '2026-10-09T10:35:00Z'
    };
    
    // Send the VOID early
    const voidRes = await request(app).post('/api/events').send(voidEvent);
    expect(voidRes.body.results[0].status).toBe('PENDING_REFERENCE');

    let state = await request(app).get('/api/state?view=summary');
    expect(state.body.unresolved).toBe(1); // Waiting for EV-COUNT-1
    expect(state.body.net_total).toBe(0);

    const countEvent = {
      source_id: 'LINE-01',
      event_id: 'EV-COUNT-1',
      type: 'COUNT',
      quantity: 10,
      event_time: '2026-10-09T10:30:00Z'
    };

    // Send the missing COUNT
    const countRes = await request(app).post('/api/events').send(countEvent);
    expect(countRes.body.results[0].status).toBe('ACCEPTED');

    // Verify atomic resolution
    state = await request(app).get('/api/state?view=summary');
    expect(state.body.unresolved).toBe(0); // Successfully resolved!
    expect(state.body.net_total).toBe(0);  // 10 (count) - 10 (void applied instantly) = 0
  });

  /**
   * TEST 4: Protocol Adherence
   * Ensures the HTTP 400 contract is respected when receiving non-JSON strings.
   */
  it('should return HTTP 400 for bad request payloads (strings instead of objects)', async () => {
    const res = await request(app).post('/api/events').send("not an object");
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ack (Supervisor Review)', () => {
  /**
   * TEST 5: State Tracking
   * Verifies that events can be acknowledged by a supervisor exactly once.
   */
  it('should acknowledge an event and gracefully reject duplicate acknowledgments', async () => {
    const event = {
      source_id: 'LINE-01',
      event_id: 'EV-003',
      type: 'COUNT',
      quantity: 5,
      event_time: '2026-10-09T10:30:00Z'
    };
    await request(app).post('/api/events').send(event);

    const ackRes = await request(app).post('/api/ack').send({ event_ids: ['EV-003'] });
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.results[0].status).toBe('ACKED');

    const ackResAgain = await request(app).post('/api/ack').send({ event_ids: ['EV-003'] });
    expect(ackResAgain.body.results[0].status).toBe('ALREADY_ACKED');
  });
});

describe('GET /api/state (Read Models)', () => {
  /**
   * TEST 6: Pending Queue API
   * Ensures that unacknowledged COUNTs appear correctly in the pending queue.
   */
  it('should fetch pending events requiring supervisor review', async () => {
    const event = {
      source_id: 'LINE-01',
      event_id: 'EV-004',
      type: 'COUNT',
      quantity: 5,
      event_time: '2026-10-09T10:30:00Z'
    };
    await request(app).post('/api/events').send(event);
    
    const res = await request(app).get('/api/state?view=pending');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].event_id).toBe('EV-004');
  });
});

describe('GET /api/mqtt/status (Telemetry)', () => {
  /**
   * TEST 7: Telemetry API
   * Confirms the telemetry endpoint required by the React dashboard is functional.
   */
  it('should return mqtt status payload containing the candidate ID', async () => {
    const res = await request(app).get('/api/mqtt/status');
    expect(res.status).toBe(200);
    expect(res.body.candidate_id).toBeDefined();
  });
});
