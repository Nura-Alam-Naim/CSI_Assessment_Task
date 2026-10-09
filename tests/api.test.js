import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { pool } from '../src/shared/db';

beforeAll(async () => {
  // Wait for DB pool to be ready
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  // Truncate tables for a clean slate
  await pool.query('TRUNCATE TABLE production_events, submission_attempts, mqtt_challenges, audit_log, production_sources RESTART IDENTITY CASCADE');
});

describe('POST /api/events', () => {
  it('should accept a valid COUNT event', async () => {
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

  it('should identify a DUPLICATE event', async () => {
    const event = {
      source_id: 'LINE-01',
      event_id: 'EV-002',
      type: 'COUNT',
      quantity: 5,
      event_time: '2026-10-09T10:30:00Z'
    };
    
    await request(app).post('/api/events').send(event);
    const res = await request(app).post('/api/events').send(event);
    
    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe('DUPLICATE');

    const stateRes = await request(app).get('/api/state?view=summary');
    expect(stateRes.body.net_total).toBe(5);
    expect(stateRes.body.duplicates).toBe(1);
  });

  it('should resolve a pending VOID when COUNT arrives', async () => {
    const voidEvent = {
      source_id: 'LINE-01',
      event_id: 'EV-VOID-1',
      type: 'VOID',
      target_event_id: 'EV-COUNT-1',
      event_time: '2026-10-09T10:35:00Z'
    };
    
    const voidRes = await request(app).post('/api/events').send(voidEvent);
    expect(voidRes.body.results[0].status).toBe('PENDING_REFERENCE');

    let state = await request(app).get('/api/state?view=summary');
    expect(state.body.unresolved).toBe(1);
    expect(state.body.net_total).toBe(0);

    const countEvent = {
      source_id: 'LINE-01',
      event_id: 'EV-COUNT-1',
      type: 'COUNT',
      quantity: 10,
      event_time: '2026-10-09T10:30:00Z'
    };

    const countRes = await request(app).post('/api/events').send(countEvent);
    expect(countRes.body.results[0].status).toBe('ACCEPTED');

    state = await request(app).get('/api/state?view=summary');
    expect(state.body.unresolved).toBe(0); // Resolved
    expect(state.body.net_total).toBe(0); // 10 - 10
  });

  it('should return 400 for bad request body', async () => {
    const res = await request(app).post('/api/events').send("not an object");
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ack', () => {
  it('should acknowledge an event', async () => {
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

describe('GET /api/state', () => {
  it('should fetch pending events', async () => {
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

describe('GET /api/mqtt/status', () => {
  it('should return mqtt status', async () => {
    const res = await request(app).get('/api/mqtt/status');
    expect(res.status).toBe(200);
    expect(res.body.candidate_id).toBeDefined();
  });
});
