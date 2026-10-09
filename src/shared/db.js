const { Pool } = require('pg');
const config = require('../config');

// Using TEST_DATABASE_URL if NODE_ENV is test
const connectionString = process.env.NODE_ENV === 'test' ? config.testDatabaseUrl : config.databaseUrl;

const pool = new Pool({
  connectionString
});

async function withTransaction(callback) {
  const client = await pool.connect();
  let domainEventsQueue = [];
  try {
    await client.query('BEGIN');
    
    // Pass client and a queue to gather domain events during the transaction
    const result = await callback(client, domainEventsQueue);
    
    await client.query('COMMIT');
    return { result, events: domainEventsQueue };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  withTransaction
};
