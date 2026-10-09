const express = require('express');
const { errorHandler } = require('./shared/errors');

const eventRoutes = require('./modules/events/routes');
const ackRoutes = require('./modules/ack/routes');
const stateRoutes = require('./modules/state/routes');

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use('/api/events', eventRoutes);
app.use('/api/ack', ackRoutes);
app.use('/api/state', stateRoutes);

app.use(errorHandler);

module.exports = app;
