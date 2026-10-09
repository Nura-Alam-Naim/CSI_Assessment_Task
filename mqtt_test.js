const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://152.42.238.142:1883');
client.on('connect', () => {
  console.log('connected');
  client.subscribe('fse-01/09/challenge', (err) => {
    console.log('subscribed', err);
  });
});
client.on('message', (topic, message) => {
  console.log(topic, message.toString());
  process.exit(0);
});
