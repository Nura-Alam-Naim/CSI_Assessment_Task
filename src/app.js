const express = require('express');
const { errorHandler } = require('./shared/errors');

const eventRoutes = require('./modules/events/routes');
const ackRoutes = require('./modules/ack/routes');
const stateRoutes = require('./modules/state/routes');
const mqttRoutes = require('./modules/mqtt/routes');
const path = require('path');

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use('/api/events', eventRoutes);
app.use('/api/ack', ackRoutes);
app.use('/api/state', stateRoutes);
app.use('/api/mqtt', mqttRoutes);

app.use(errorHandler);

// Serve static frontend in production
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

module.exports = app;
