class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

const errorHandler = (err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Body must be valid JSON' });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  console.error('Unhandled Exception:', err);
  res.status(500).json({ error: 'INTERNAL_ERROR' });
};

module.exports = {
  AppError,
  errorHandler
};
