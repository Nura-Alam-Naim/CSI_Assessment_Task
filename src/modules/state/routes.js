const express = require('express');
const router = express.Router();
const service = require('./service');
const { AppError } = require('../../shared/errors');

router.delete('/duplicates', async (req, res, next) => {
  try {
    await service.delete_duplicates(req.query.source_id);
    res.json({ success: true });
  } catch(e) {
    next(e);
  }
});

router.delete('/exceptions', async (req, res, next) => {
  try {
    await service.delete_exceptions(req.query.source_id);
    res.json({ success: true });
  } catch(e) {
    next(e);
  }
});

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
      case 'processed':
        data = await service.get_processed(sourceId);
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
