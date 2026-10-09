const EventEmitter = require('events');

class DomainEventBus extends EventEmitter {}
const bus = new DomainEventBus();

function emitEvents(events) {
  events.forEach(evt => {
    bus.emit(evt.type, evt.payload);
  });
}

module.exports = {
  bus,
  emitEvents
};
