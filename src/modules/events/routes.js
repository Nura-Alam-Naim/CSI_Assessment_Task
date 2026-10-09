const express = require('express');
const router = express.Router();
const service = require('./service');

router.post('/', async (req, res, next) => {
  try {
    const body = req.body;
    let items;
    
    if (Array.isArray(body)) {
      items = body;
    } else if (body && typeof body === 'object') {
      items = [body];
    } else {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Body must be an event object or an array of events'
      });
    }

    if (items.length === 0) {
      return res.json({ results: [] });
    }

    // Process events
    const results = await service.process_events(items);
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
