const mqtt = require('mqtt');
const crypto = require('crypto');
require('dotenv').config();

const candidateId = process.env.CANDIDATE_ID || '09';
const brokerUrl = process.env.MQTT_URL || 'mqtt://152.42.238.142:1883';

const client = mqtt.connect(brokerUrl, {
  clientId: `simulator-${crypto.randomUUID()}`
});

const TOPICS = {
  challenge: `fse-01/${candidateId}/challenge`,
  response: `fse-01/${candidateId}/response`,
  status: `fse-01/${candidateId}/status`
};

client.on('connect', () => {
  console.log('Connected to broker');
  client.subscribe([TOPICS.response, TOPICS.status], { qos: 1 }, (err) => {
    if (!err) {
      console.log('Subscribed to response and status topics');
      sendChallenge();
    }
  });
});

client.on('message', (topic, message) => {
  console.log(`\nReceived on ${topic}:`);
  console.log(JSON.stringify(JSON.parse(message.toString()), null, 2));
  
  if (topic === TOPICS.response) {
    console.log('Got response, exiting...');
    setTimeout(() => process.exit(0), 1000);
  }
});

function sendChallenge() {
  const challenge = {
    protocol_version: "1.0",
    candidate_id: candidateId,
    challenge_id: `SIM-${crypto.randomUUID()}`,
    command: "PROCESS_EVENTS",
    sent_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60000).toISOString(),
    events: [
      {
        source_id: "SIM-LINE-1",
        event_id: `EV-${crypto.randomUUID()}`,
        type: "COUNT",
        quantity: 10,
        event_time: new Date().toISOString()
      }
    ]
  };

  console.log('\nSending challenge:');
  console.log(JSON.stringify(challenge, null, 2));
  
  client.publish(TOPICS.challenge, JSON.stringify(challenge), { qos: 1 });
}
