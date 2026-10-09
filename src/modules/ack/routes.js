const express = require('express');
const router = express.Router();
const service = require('./service');
const { AppError } = require('../../shared/errors');

router.post('/', async (req, res, next) => {
  try {
    const { event_ids } = req.body;
    
    if (!Array.isArray(event_ids) || event_ids.some(id => typeof id !== 'string' || !id.trim())) {
      throw new AppError('event_ids must be an array of non-empty strings', 400);
    }

    if (event_ids.length === 0) {
      return res.json({ results: [] });
    }

    const results = await service.acknowledge_events(event_ids);
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
