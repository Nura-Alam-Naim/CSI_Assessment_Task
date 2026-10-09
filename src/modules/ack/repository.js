async function getEventsForAck(tx, eventIds) {
  const { rows } = await tx.query(
    `SELECT * FROM production_events WHERE event_id = ANY($1) FOR UPDATE`,
    [eventIds]
  );
  return rows;
}

async function markAcknowledged(tx, eventId) {
  await tx.query(
    `UPDATE production_events SET acknowledged_at = now(), ack_mode = 'MANUAL' WHERE event_id = $1`,
    [eventId]
  );
}

module.exports = {
  getEventsForAck,
  markAcknowledged
};
