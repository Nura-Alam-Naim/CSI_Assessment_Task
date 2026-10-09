const repo = require('./repository');
const auditRepo = require('../events/repository');
const { withTransaction } = require('../../shared/db');
const { emitEvents } = require('../../shared/domain_events');

async function acknowledge_events(eventIds) {
  const { result, events } = await withTransaction(async (tx, domainEventsQueue) => {
    // Sort keys to prevent deadlocks when locking
    const sortedIds = [...new Set(eventIds)].sort();
    if (sortedIds.length > 0) {
      await auditRepo.lockKeys(tx, sortedIds);
    }
    
    const dbEvents = await repo.getEventsForAck(tx, sortedIds);
    const dbEventsMap = new Map(dbEvents.map(e => [e.event_id, e]));
    
    const seen = new Set();
    const results = [];

    for (const id of eventIds) {
      if (seen.has(id)) {
        results.push({ event_id: id, status: 'ALREADY_ACKED' });
        continue;
      }
      seen.add(id);

      const evt = dbEventsMap.get(id);
      if (!evt) {
        results.push({ event_id: id, status: 'NOT_FOUND' });
        continue;
      }

      if (evt.status === 'PENDING_REFERENCE' || evt.status === 'REJECTED') {
        results.push({ event_id: id, status: 'NOT_READY' });
        continue;
      }

      if (evt.acknowledged_at) {
        results.push({ event_id: id, status: 'ALREADY_ACKED' });
        continue;
      }

      await repo.markAcknowledged(tx, id);
      await auditRepo.insertAudit(tx, 'EVENT_ACKNOWLEDGED', id, evt.source_id, { mode: 'MANUAL' });
      domainEventsQueue.push({ type: 'EVENT_ACKNOWLEDGED', payload: evt });
      
      results.push({ event_id: id, status: 'ACKED' });
    }

    return results;
  });

  emitEvents(events);
  return result;
}

module.exports = {
  acknowledge_events
};
