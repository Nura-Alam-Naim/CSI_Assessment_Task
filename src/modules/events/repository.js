async function lockKeys(tx, keys) {
  for (const key of keys) {
    // pg_advisory_xact_lock requires a 64-bit int, we can hash the text to a 32-bit int
    // or use two 32-bit ints. Using hashtext(key) works.
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [key]);
  }
}

async function ensureSource(tx, sourceId) {
  await tx.query(
    `INSERT INTO production_sources (source_id, display_name) 
     VALUES ($1, $2) ON CONFLICT (source_id) DO NOTHING`,
    [sourceId, sourceId]
  );
}

async function getEventForUpdate(tx, eventId) {
  const { rows } = await tx.query(
    `SELECT * FROM production_events WHERE event_id = $1 FOR UPDATE`,
    [eventId]
  );
  return rows[0];
}

async function insertSubmissionAttempt(tx, attempt) {
  await tx.query(
    `INSERT INTO submission_attempts 
     (batch_id, item_index, channel, challenge_id, raw_payload, normalized, source_id, event_id, classification, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      attempt.batch_id,
      attempt.item_index,
      attempt.channel,
      attempt.challenge_id || null,
      attempt.raw_payload,
      attempt.normalized || null,
      attempt.source_id || null,
      attempt.event_id || null,
      attempt.classification,
      attempt.error || null
    ]
  );
}

async function insertCountEvent(tx, v, hash) {
  const { rows } = await tx.query(
    `INSERT INTO production_events 
     (event_id, source_id, type, quantity, event_time, status, normalized_hash)
     VALUES ($1, $2, $3, $4, $5, 'ACCEPTED', $6)
     ON CONFLICT (event_id) DO NOTHING RETURNING *`,
    [v.event_id, v.source_id, v.type, v.quantity, v.event_time_utc, hash]
  );
  return rows[0];
}

async function insertPendingVoid(tx, v, hash) {
  try {
    const { rows } = await tx.query(
      `INSERT INTO production_events 
       (event_id, source_id, type, target_event_id, event_time, status, normalized_hash)
       VALUES ($1, $2, $3, $4, $5, 'PENDING_REFERENCE', $6)
       RETURNING *`,
      [v.event_id, v.source_id, v.type, v.target_event_id, v.event_time_utc, hash]
    );
    return { ok: true, event: rows[0] };
  } catch (err) {
    if (err.constraint === 'uq_one_live_void_per_target') {
      return { ok: false, reason: `Another VOID already targets ${v.target_event_id} (first stored wins)` };
    }
    throw err;
  }
}

async function applyVoidToCount(tx, voidEventData, countEvent, hash) {
  // Insert the VOID as ACCEPTED and auto-acked
  const { rows } = await tx.query(
    `INSERT INTO production_events 
     (event_id, source_id, type, target_event_id, event_time, status, normalized_hash, acknowledged_at, ack_mode)
     VALUES ($1, $2, $3, $4, $5, 'ACCEPTED', $6, now(), 'AUTO')
     RETURNING *`,
    [
      voidEventData.event_id, 
      voidEventData.source_id, 
      voidEventData.type, 
      voidEventData.target_event_id, 
      voidEventData.event_time_utc, 
      hash
    ]
  );
  const newVoid = rows[0];

  // Update the COUNT to point to this VOID
  await tx.query(
    `UPDATE production_events SET voided_by_event_id = $1 WHERE event_id = $2`,
    [voidEventData.event_id, countEvent.event_id]
  );

  return newVoid;
}

async function getPendingVoidsForTarget(tx, targetEventId) {
  const { rows } = await tx.query(
    `SELECT * FROM production_events 
     WHERE type = 'VOID' AND status = 'PENDING_REFERENCE' AND target_event_id = $1 
     ORDER BY seq FOR UPDATE`,
    [targetEventId]
  );
  return rows;
}

async function resolvePendingVoid(tx, pendingVoid, countEvent) {
  if (pendingVoid.source_id === countEvent.source_id) {
    await tx.query(
      `UPDATE production_events 
       SET status = 'ACCEPTED', resolved_at = now(), acknowledged_at = now(), ack_mode = 'AUTO'
       WHERE event_id = $1`,
      [pendingVoid.event_id]
    );
    await tx.query(
      `UPDATE production_events SET voided_by_event_id = $1 WHERE event_id = $2`,
      [pendingVoid.event_id, countEvent.event_id]
    );
    return { status: 'ACCEPTED' };
  } else {
    await tx.query(
      `UPDATE production_events 
       SET status = 'REJECTED', failure_reason = 'SOURCE_MISMATCH', resolved_at = now()
       WHERE event_id = $1`,
      [pendingVoid.event_id]
    );
    return { status: 'REJECTED', reason: 'SOURCE_MISMATCH' };
  }
}

async function insertAudit(tx, action, eventId, sourceId, detail) {
  await tx.query(
    `INSERT INTO audit_log (action, event_id, source_id, detail) VALUES ($1, $2, $3, $4)`,
    [action, eventId || null, sourceId || null, detail]
  );
}

module.exports = {
  lockKeys,
  ensureSource,
  getEventForUpdate,
  insertSubmissionAttempt,
  insertCountEvent,
  insertPendingVoid,
  applyVoidToCount,
  getPendingVoidsForTarget,
  resolvePendingVoid,
  insertAudit
};
