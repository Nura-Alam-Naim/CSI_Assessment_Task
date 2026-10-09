const { pool } = require('./src/shared/db');
async function test() {
  const { rows } = await pool.query('SELECT * FROM mqtt_challenges LIMIT 5');
  console.log('MQTT Challenges:', rows);
  const events = await pool.query('SELECT * FROM submission_attempts LIMIT 5');
  console.log('Attempts:', events.rows);
  const prod = await pool.query('SELECT * FROM production_events LIMIT 5');
  console.log('Prod Events:', prod.rows);
  process.exit(0);
}
test();
