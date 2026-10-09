const crypto = require('crypto');
const config = require('../../config');

function canonicalHash(obj) {
  const sorted = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = obj[key];
  });
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function validateEnvelope(body) {
  if (body.protocol_version !== "1.0") {
    return { valid: false, code: 'UNSUPPORTED_PROTOCOL', msg: 'Unsupported protocol version' };
  }
  if (body.candidate_id !== config.candidateId) {
    return { valid: false, code: 'CANDIDATE_MISMATCH', msg: 'Candidate ID does not match' };
  }
  if (!body.challenge_id || typeof body.challenge_id !== 'string') {
    return { valid: false, code: 'VALIDATION_ERROR', msg: 'Missing challenge_id' };
  }
  if (body.command !== 'PROCESS_EVENTS') {
    return { valid: false, code: 'VALIDATION_ERROR', msg: 'Invalid command' };
  }
  if (!Array.isArray(body.events)) {
    return { valid: false, code: 'VALIDATION_ERROR', msg: 'Events must be an array' };
  }
  if (!body.expires_at || new Date(body.expires_at) <= new Date()) {
    return { valid: false, code: 'CHALLENGE_EXPIRED', msg: 'Challenge expired' };
  }
  if (!body.sent_at || isNaN(new Date(body.sent_at).getTime())) {
    return { valid: false, code: 'VALIDATION_ERROR', msg: 'Invalid sent_at' };
  }

  return { valid: true };
}

function buildSuccessResponse(challenge_id, results, state) {
  return {
    protocol_version: "1.0",
    candidate_id: config.candidateId,
    challenge_id,
    status: "COMPLETED",
    processed_at: new Date().toISOString(),
    results,
    state
  };
}

function buildErrorResponse(challenge_id, error_code, message) {
  return {
    protocol_version: "1.0",
    candidate_id: config.candidateId,
    challenge_id: challenge_id || null,
    status: "FAILED",
    error_code,
    message,
    processed_at: new Date().toISOString()
  };
}

module.exports = {
  canonicalHash,
  validateEnvelope,
  buildSuccessResponse,
  buildErrorResponse
};
