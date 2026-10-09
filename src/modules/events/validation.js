const crypto = require('crypto');

function isValidDate(dateString) {
  const d = new Date(dateString);
  // Strictly ISO-8601 with timezone: must parse to a valid date and must contain 'Z' or '+' or '-' in the time part
  if (isNaN(d.getTime())) return false;
  return /Z|[+-]\d{2}:\d{2}$/.test(dateString) || /[+-]\d{4}$/.test(dateString);
}

function normalizeEvent(raw) {
  return {
    source_id: raw.source_id.trim(),
    event_id: raw.event_id.trim(),
    type: raw.type,
    quantity: raw.type === 'COUNT' ? raw.quantity : null,
    target_event_id: raw.type === 'VOID' ? raw.target_event_id.trim() : null,
    event_time_utc: new Date(raw.event_time).toISOString()
  };
}

function hashNormalized(normalized) {
  // Sort keys for canonical JSON
  const sorted = {
    event_id: normalized.event_id,
    event_time_utc: normalized.event_time_utc,
    quantity: normalized.quantity,
    source_id: normalized.source_id,
    target_event_id: normalized.target_event_id,
    type: normalized.type
  };
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function validate_event(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: "Item is not a JSON object", partial: {} };
  }

  const partial = {
    source_id: typeof raw.source_id === 'string' ? raw.source_id.trim() : undefined,
    event_id: typeof raw.event_id === 'string' ? raw.event_id.trim() : undefined
  };

  if (!partial.source_id) return { ok: false, reason: "source_id must be a non-empty string", partial };
  if (!partial.event_id) return { ok: false, reason: "event_id must be a non-empty string", partial };
  
  if (raw.type !== 'COUNT' && raw.type !== 'VOID') {
    return { ok: false, reason: "type must be exactly 'COUNT' or 'VOID'", partial };
  }

  if (raw.type === 'COUNT') {
    if (!Number.isInteger(raw.quantity) || raw.quantity <= 0) {
      return { ok: false, reason: "quantity must be a positive integer for COUNT", partial };
    }
    if (raw.target_event_id !== undefined && raw.target_event_id !== null) {
      return { ok: false, reason: "target_event_id must be null or undefined for COUNT", partial };
    }
  }

  if (raw.type === 'VOID') {
    if (raw.quantity !== undefined && raw.quantity !== null) {
      return { ok: false, reason: "quantity must be null or undefined for VOID", partial };
    }
    if (typeof raw.target_event_id !== 'string' || raw.target_event_id.trim() === '') {
      return { ok: false, reason: "target_event_id must be a non-empty string for VOID", partial };
    }
    if (raw.target_event_id === partial.event_id) {
      return { ok: false, reason: "target_event_id cannot be the same as event_id", partial };
    }
  }

  if (typeof raw.event_time !== 'string' || !isValidDate(raw.event_time)) {
    return { ok: false, reason: "event_time must be a valid strict ISO-8601 string with timezone", partial };
  }

  const value = normalizeEvent(raw);
  const hash = hashNormalized(value);

  return { ok: true, value, hash, partial };
}

module.exports = {
  validate_event,
  hashNormalized
};
