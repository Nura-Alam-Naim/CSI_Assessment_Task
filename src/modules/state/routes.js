const express = require('express');
const router = express.Router();
const service = require('./service');
const { AppError } = require('../../shared/errors');

router.get('/', async (req, res, next) => {
  try {
    const view = req.query.view || 'summary';
    const sourceId = req.query.source_id || null;

    let data;
    switch (view) {
      case 'summary':
        data = await service.get_summary(sourceId);
        break;
      case 'pending':
        data = await service.get_pending(sourceId);
        break;
      case 'exceptions':
        data = await service.get_exceptions(sourceId);
        break;
      default:
        throw new AppError('INVALID_VIEW', 400);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
