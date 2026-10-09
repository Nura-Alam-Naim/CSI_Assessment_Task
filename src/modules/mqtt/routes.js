const express = require('express');
const router = express.Router();
const worker = require('./worker');

router.get('/status', (req, res) => {
  res.json(worker.getState());
});

module.exports = router;
