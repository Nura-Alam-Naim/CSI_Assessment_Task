const app = require('./app');
const config = require('./config');
const { pool } = require('./shared/db');

const server = app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed.');
    pool.end(() => {
      console.log('Database pool closed.');
      process.exit(0);
    });
  });
}
