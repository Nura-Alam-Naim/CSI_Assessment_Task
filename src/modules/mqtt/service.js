const { pool } = require('../../shared/db');
const protocol = require('./protocol');
const eventService = require('../events/service');
const stateService = require('../state/service');
const config = require('../../config');

async function handle_mqtt_challenge(rawPayloadBuffer, publishCallback) {
  let body;
  try {
    body = JSON.parse(rawPayloadBuffer.toString());
  } catch (err) {
    const resp = protocol.buildErrorResponse(null, 'VALIDATION_ERROR', 'Item is not a valid JSON object');
    await publishCallback(resp);
    return { ok: false, error: 'JSON Parse Error' };
  }

  if (!body || typeof body !== 'object') {
    const resp = protocol.buildErrorResponse(null, 'VALIDATION_ERROR', 'Payload must be an object');
    await publishCallback(resp);
    return { ok: false, error: 'Not an object' };
  }

  const requestDigest = protocol.canonicalHash(body);
  const challengeId = body.challenge_id;

  if (challengeId) {
    const client = await pool.connect();
    try {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('ch:' || $1))`, [challengeId]);

      const { rows } = await client.query(`SELECT * FROM mqtt_challenges WHERE challenge_id = $1`, [challengeId]);
      if (rows.length > 0) {
        const stored = rows[0];
        if (stored.request_digest === requestDigest) {
          // Re-publish stored response
          await publishCallback(stored.response);
          return { ok: true, stored: true };
        } else {
          // Conflict
          const resp = protocol.buildErrorResponse(challengeId, 'CHALLENGE_CONFLICT', 'Challenge already processed with different data');
          await publishCallback(resp);
          return { ok: false, error: 'CHALLENGE_CONFLICT' };
        }
      }

      const envValid = protocol.validateEnvelope(body);
      if (!envValid.valid) {
        const resp = protocol.buildErrorResponse(challengeId, envValid.code, envValid.msg);
        await client.query(
          `INSERT INTO mqtt_challenges (challenge_id, candidate_id, request_digest, request_body, response, status, error_code)
           VALUES ($1, $2, $3, $4, $5, 'FAILED', $6)`,
          [challengeId, config.candidateId, requestDigest, body, resp, envValid.code]
        );
        await publishCallback(resp);
        return { ok: false, error: envValid.code };
      }

      // Valid, process in a transaction
      await client.query('BEGIN');
      let responseObj;
      try {
        const results = await eventService.process_events(body.events, { channel: 'MQTT', challenge_id: challengeId });
        const state = await stateService.get_summary();
        
        responseObj = protocol.buildSuccessResponse(challengeId, results, state);
        
        await client.query(
          `INSERT INTO mqtt_challenges (challenge_id, candidate_id, request_digest, request_body, response, status)
           VALUES ($1, $2, $3, $4, $5, 'COMPLETED')`,
          [challengeId, config.candidateId, requestDigest, body, responseObj]
        );

        await client.query('COMMIT');
      } catch (procErr) {
        await client.query('ROLLBACK');
        console.error('MQTT processing error:', procErr);
        responseObj = protocol.buildErrorResponse(challengeId, 'INTERNAL_ERROR', 'Internal processing error');
        // Do not insert internal error as completed/failed in challenges so it can be retried safely
      }

      await publishCallback(responseObj);
      
      // Update published_at
      if (responseObj.status === 'COMPLETED') {
        await pool.query(`UPDATE mqtt_challenges SET published_at = now() WHERE challenge_id = $1`, [challengeId]);
      }

      return { ok: responseObj.status === 'COMPLETED' };

    } finally {
      client.release();
    }
  } else {
    // No challenge ID, cannot lock or persist
    const resp = protocol.buildErrorResponse(null, 'VALIDATION_ERROR', 'Missing challenge_id');
    await publishCallback(resp);
    return { ok: false, error: 'Missing challenge_id' };
  }
}

module.exports = {
  handle_mqtt_challenge
};
