require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  candidateId: process.env.CANDIDATE_ID,
  mqttUrl: process.env.MQTT_URL
};
