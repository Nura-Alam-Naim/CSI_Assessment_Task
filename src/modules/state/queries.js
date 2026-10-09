const { pool } = require('../../shared/db');

async function getSummary(sourceId = null) {
  let paramClause = '';
  const params = [];
  if (sourceId) {
    paramClause = 'AND source_id = $1';
    params.push(sourceId);
  }
  
  // net_total = SUM(quantity) of ACCEPTED COUNTs not voided
  // processed_events = COUNT(*) FILTER (WHERE status='ACCEPTED')
  // pending_ack = COUNT(*) FILTER (WHERE status='ACCEPTED' AND acknowledged_at IS NULL)
  // unresolved = COUNT(*) FILTER (WHERE status='PENDING_REFERENCE')
  
  const eventQuery = `
    SELECT 
      COALESCE(SUM(quantity) FILTER (WHERE type='COUNT' AND status='ACCEPTED' AND voided_by_event_id IS NULL), 0)::int AS net_total,
      COUNT(*) FILTER (WHERE status='ACCEPTED')::int AS processed_events,
      COUNT(*) FILTER (WHERE status='ACCEPTED' AND acknowledged_at IS NULL)::int AS pending_ack,
      COUNT(*) FILTER (WHERE status='PENDING_REFERENCE')::int AS unresolved
    FROM production_events
    WHERE 1=1 ${paramClause}
  `;

  // duplicates/conflicts from submission_attempts
  const attemptsQuery = `
    SELECT
      COUNT(*) FILTER (WHERE classification='DUPLICATE')::int AS duplicates,
      COUNT(*) FILTER (WHERE classification='CONFLICT')::int AS conflicts
    FROM submission_attempts
    WHERE 1=1 ${paramClause}
  `;

  const [eventRes, attemptRes] = await Promise.all([
    pool.query(eventQuery, params),
    pool.query(attemptsQuery, params)
  ]);

  return {
    ...eventRes.rows[0],
    ...attemptRes.rows[0]
  };
}

async function getPending(sourceId = null) {
  let paramClause = '';
  const params = [];
  if (sourceId) {
    paramClause = 'AND source_id = $1';
    params.push(sourceId);
  }

  const query = `
    SELECT event_id, source_id, quantity, event_time, received_at, voided_by_event_id
    FROM production_events
    WHERE status='ACCEPTED' AND type='COUNT' AND acknowledged_at IS NULL
    ${paramClause}
    ORDER BY seq ASC
  `;

  const { rows } = await pool.query(query, params);
  return rows.map(r => ({
    event_id: r.event_id,
    source_id: r.source_id,
    quantity: r.quantity,
    event_time: r.event_time,
    received_at: r.received_at,
    voided: !!r.voided_by_event_id,
    voided_reason: r.voided_by_event_id ? `Reversed by ${r.voided_by_event_id}` : null
  }));
}

async function getExceptions(sourceId = null) {
  let paramClauseEvents = '';
  let paramClauseAttempts = '';
  const params = [];
  if (sourceId) {
    paramClauseEvents = 'AND source_id = $1';
    paramClauseAttempts = 'AND (source_id = $1 OR source_id IS NULL)';
    params.push(sourceId);
  }

  // Union of unresolved pending VOIDs, REJECTED/CONFLICT attempts, rejected-on-resolve events
  const unresolvedQuery = `
    SELECT 'UNRESOLVED_VOID' as kind, event_id, source_id, 
           'Waiting for COUNT ' || target_event_id as reason, 
           received_at, null::jsonb as raw_payload
    FROM production_events
    WHERE status='PENDING_REFERENCE' ${paramClauseEvents}
  `;

  const rejectedAttemptsQuery = `
    SELECT classification as kind, event_id, source_id, error as reason, received_at, raw_payload
    FROM submission_attempts
    WHERE classification IN ('REJECTED', 'CONFLICT') ${paramClauseAttempts}
  `;

  const query = `
    SELECT * FROM (${unresolvedQuery} UNION ALL ${rejectedAttemptsQuery}) as un
    ORDER BY received_at DESC
  `;

  const { rows } = await pool.query(query, params);
  return rows;
}

module.exports = {
  getSummary,
  getPending,
  getExceptions
};
