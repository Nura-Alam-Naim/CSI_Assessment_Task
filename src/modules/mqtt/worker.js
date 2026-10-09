const mqtt = require('mqtt');
const config = require('../../config');
const { handle_mqtt_challenge } = require('./service');

let client = null;
let heartbeatTimer = null;
let state = {
  connected: false,
  candidate_id: config.candidateId,
  client_id: null,
  subscribed: false,
  last_connected_at: null,
  last_error: null,
  last_challenge: null,
  counts: { received: 0, completed: 0, failed: 0 }
};

const TOPIC_PREFIX = `fse-01/${config.candidateId}`;
const TOPICS = {
  challenge: `${TOPIC_PREFIX}/challenge`,
  response: `${TOPIC_PREFIX}/response`,
  status: `${TOPIC_PREFIX}/status`
};

function startWorker() {
  if (!config.mqttUrl || !config.candidateId) {
    console.warn('MQTT_URL or CANDIDATE_ID missing. MQTT worker disabled.');
    return;
  }

  const clientId = `fse01-${config.candidateId}-${Math.random().toString(36).substring(2, 8)}`;
  state.client_id = clientId;

  const willPayload = JSON.stringify({
    candidate_id: config.candidateId,
    status: 'OFFLINE',
    at: new Date().toISOString(),
    client_id: clientId
  });

  client = mqtt.connect(config.mqttUrl, {
    clientId,
    clean: true,
    protocolVersion: 4, // Downgrade to MQTT 3.1.1 for wider compatibility
    reconnectPeriod: 1000, // Starts at 1s, backoff logic can be managed or default handled by mqtt.js
    will: {
      topic: TOPICS.status,
      payload: willPayload,
      qos: 1,
      retain: false
    }
  });

  client.on('connect', () => {
    console.log(`MQTT Connected as ${clientId}`);
    state.connected = true;
    state.last_connected_at = new Date().toISOString();

    client.subscribe(TOPICS.challenge, { qos: 1 }, (err) => {
      if (err) {
        console.error('MQTT Subscribe error:', err);
        state.last_error = err.message;
      } else {
        state.subscribed = true;
        publishStatus('ONLINE');
        startHeartbeat();
      }
    });
  });

  client.on('message', async (topic, payload) => {
    if (topic === TOPICS.challenge) {
      state.counts.received++;
      const receiptTime = new Date().toISOString();

      const publishCallback = (responseObj) => {
        return new Promise((resolve) => {
          state.last_challenge = {
            challenge_id: responseObj.challenge_id || null,
            received_at: receiptTime,
            status: responseObj.status,
            error_code: responseObj.error_code || null
          };

          if (responseObj.status === 'COMPLETED') state.counts.completed++;
          if (responseObj.status === 'FAILED') state.counts.failed++;

          client.publish(TOPICS.response, JSON.stringify(responseObj), { qos: 1 }, (err) => {
            if (err) console.error('MQTT Publish Response Error:', err);
            resolve();
          });
        });
      };

      try {
        await handle_mqtt_challenge(payload, publishCallback);
      } catch (err) {
        console.error('Unexpected error in handle_mqtt_challenge:', err);
        state.last_error = err.message;
      }
    }
  });

  client.on('error', (err) => {
    console.error('MQTT Error:', err);
    state.last_error = err.message;
  });

  client.on('offline', () => {
    state.connected = false;
    state.subscribed = false;
    stopHeartbeat();
  });
}

function publishStatus(statusStr) {
  if (client && client.connected) {
    const payload = JSON.stringify({
      candidate_id: config.candidateId,
      status: statusStr,
      at: new Date().toISOString(),
      client_id: state.client_id
    });
    client.publish(TOPICS.status, payload, { qos: 1 });
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    publishStatus('HEARTBEAT');
  }, 20000); // 20s
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function stopWorker(cb) {
  stopHeartbeat();
  if (client && client.connected) {
    publishStatus('OFFLINE');
    client.end(false, {}, cb);
  } else if (cb) {
    cb();
  }
}

function getState() {
  return state;
}

module.exports = {
  startWorker,
  stopWorker,
  getState
};
