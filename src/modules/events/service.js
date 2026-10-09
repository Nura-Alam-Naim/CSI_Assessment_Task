const crypto = require('crypto');
const { validate_event } = require('./validation');
const repo = require('./repository');
const { withTransaction } = require('../../shared/db');
const { emitEvents } = require('../../shared/domain_events');

async function process_events(items, ctx = {}) {
  const batch_id = crypto.randomUUID();
  const channel = ctx.channel || 'REST';
  const challenge_id = ctx.challenge_id || null;

  const { result, events } = await withTransaction(async (tx, domainEventsQueue) => {
    // Collect all event_id and target_event_id for locking to prevent deadlocks
    const lockKeysSet = new Set();
    for (const raw of items) {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        if (typeof raw.event_id === 'string' && raw.event_id.trim()) {
          lockKeysSet.add(raw.event_id.trim());
        }
        if (typeof raw.target_event_id === 'string' && raw.target_event_id.trim()) {
          lockKeysSet.add(raw.target_event_id.trim());
        }
      }
    }
    const lockKeys = Array.from(lockKeysSet).sort();
    await repo.lockKeys(tx, lockKeys);

    const results = [];
    for (let i = 0; i < items.length; i++) {
      const raw = items[i];
      const r = await process_event(tx, raw, i, { batch_id, channel, challenge_id, domainEventsQueue });
      results.push(r);
    }
    return results;
  });

  emitEvents(events);
  return result;
}

async function process_event(tx, raw, idx, ctx) {
  const validation = validate_event(raw);
  
  const attemptBase = {
    batch_id: ctx.batch_id,
    item_index: idx,
    channel: ctx.channel,
    challenge_id: ctx.challenge_id,
    raw_payload: raw,
    source_id: validation.partial?.source_id,
    event_id: validation.partial?.event_id
  };

  if (!validation.ok) {
    await repo.insertSubmissionAttempt(tx, {
      ...attemptBase,
      classification: 'REJECTED',
      error: validation.reason
    });
    return { event_id: attemptBase.event_id || null, status: 'REJECTED', message: validation.reason };
  }

  const { value: v, hash } = validation;
  attemptBase.normalized = v;

  await repo.ensureSource(tx, v.source_id);
  const existing = await repo.getEventForUpdate(tx, v.event_id);

  if (existing) {
    if (existing.normalized_hash === hash) {
      await repo.insertSubmissionAttempt(tx, {
        ...attemptBase, classification: 'DUPLICATE'
      });
      return { event_id: v.event_id, status: 'DUPLICATE', message: 'Already processed' };
    } else {
      const reason = `event_id ${v.event_id} already exists with different data`;
      await repo.insertSubmissionAttempt(tx, {
        ...attemptBase, classification: 'CONFLICT', error: reason
      });
      return { event_id: v.event_id, status: 'CONFLICT', message: reason };
    }
  }

  if (v.type === 'COUNT') {
    return await process_count(tx, v, hash, attemptBase, ctx);
  } else {
    return await process_void(tx, v, hash, attemptBase, ctx);
  }
}

async function process_count(tx, v, hash, attemptBase, ctx) {
  const inserted = await repo.insertCountEvent(tx, v, hash);
  if (!inserted) {
    // Concurrent insert won, re-read and return conflict/duplicate logic
    const existing = await repo.getEventForUpdate(tx, v.event_id);
    if (existing.normalized_hash === hash) {
      await repo.insertSubmissionAttempt(tx, { ...attemptBase, classification: 'DUPLICATE' });
      return { event_id: v.event_id, status: 'DUPLICATE', message: 'Already processed' };
    } else {
      await repo.insertSubmissionAttempt(tx, { ...attemptBase, classification: 'CONFLICT', error: 'Concurrent conflict' });
      return { event_id: v.event_id, status: 'CONFLICT', message: 'Concurrent conflict' };
    }
  }

  await repo.insertSubmissionAttempt(tx, { ...attemptBase, classification: 'ACCEPTED' });
  await repo.insertAudit(tx, 'COUNT_ACCEPTED', v.event_id, v.source_id, v);
  ctx.domainEventsQueue.push({ type: 'EVENT_ACCEPTED', payload: v });

  await resolve_pending_voids(tx, v.event_id, ctx.domainEventsQueue);

  return { event_id: v.event_id, status: 'ACCEPTED', message: 'Event processed' };
}

async function process_void(tx, v, hash, attemptBase, ctx) {
  const target = await repo.getEventForUpdate(tx, v.target_event_id);

  if (!target) {
    const res = await repo.insertPendingVoid(tx, v, hash);
    if (!res.ok) {
      await repo.insertSubmissionAttempt(tx, { ...attemptBase, classification: 'REJECTED', error: res.reason });
      return { event_id: v.event_id, status: 'REJECTED', message: res.reason };
    }
    await repo.insertSubmissionAttempt(tx, { ...attemptBase, classification: 'PENDING_REFERENCE' });
    return { event_id: v.event_id, status: 'PENDING_REFERENCE', message: 'Waiting for target COUNT' };
  }

  if (target.type !== 'COUNT') {
    const reason = 'Target is not a COUNT';
    await repo.insertSubmissionAttempt(tx, { ...attemptBase, classification: 'REJECTED', error: reason });
    return { event_id: v.event_id, status: 'REJECTED', message: reason };
  }

  if (target.source_id !== v.source_id) {
    const reason = 'SOURCE_MISMATCH';
    await repo.insertSubmissionAttempt(tx, { ...attemptBase, classification: 'REJECTED', error: reason });
    return { event_id: v.event_id, status: 'REJECTED', message: reason };
  }

  if (target.voided_by_event_id) {
    const reason = \`COUNT already reversed by \${target.voided_by_event_id}\`;
    await repo.insertSubmissionAttempt(tx, { ...attemptBase, classification: 'REJECTED', error: reason });
    return { event_id: v.event_id, status: 'REJECTED', message: reason };
  }

  await repo.applyVoidToCount(tx, v, target, hash);
  await repo.insertSubmissionAttempt(tx, { ...attemptBase, classification: 'ACCEPTED' });
  await repo.insertAudit(tx, 'VOID_ACCEPTED', v.event_id, v.source_id, v);
  ctx.domainEventsQueue.push({ type: 'EVENT_ACCEPTED', payload: v });

  return { event_id: v.event_id, status: 'ACCEPTED', message: 'Event processed' };
}

async function resolve_pending_voids(tx, countEventId, domainEventsQueue) {
  const countEvent = await repo.getEventForUpdate(tx, countEventId);
  const pending = await repo.getPendingVoidsForTarget(tx, countEventId);

  for (const p of pending) {
    const res = await repo.resolvePendingVoid(tx, p, countEvent);
    if (res.status === 'ACCEPTED') {
      await repo.insertAudit(tx, 'VOID_RESOLVED', p.event_id, p.source_id, p);
      domainEventsQueue.push({ type: 'VOID_RESOLVED', payload: p });
      // Only one can win based on unique index, but just in case, we break. The DB constraints guarantee this too.
      break; 
    } else {
      await repo.insertAudit(tx, 'VOID_REJECTED_ON_RESOLVE', p.event_id, p.source_id, { reason: res.reason });
    }
  }
}

module.exports = {
  process_events,
  process_event,
  process_count,
  process_void,
  resolve_pending_voids
};
