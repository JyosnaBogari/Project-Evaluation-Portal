const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Handle specific MongoDB errors
  if (err.name === 'ValidationError') {
    err.statusCode = 400;
    err.status = 'fail';
    const messages = Object.values(err.errors).map(el => el.message);
    err.message = `Validation failed: ${messages.join(', ')}`;
  }

  if (err.code === 11000) {
    err.statusCode = 409;
    err.status = 'fail';
    // Format duplicate key errors nicely
    const keys = Object.keys(err.keyValue).join(', ');
    err.message = `Duplicate field value entered for: ${keys}. Please use another value.`;
    
    // Explicitly check for team membership index block
    if (err.message.includes('teamMembers') && err.message.includes('deadline')) {
      err.message = 'A student in this team is already enrolled in another project for this deadline.';
    }
  }

  if (err.name === 'CastError') {
    err.statusCode = 400;
    err.status = 'fail';
    err.message = `Invalid format for field ${err.path}: ${err.value}`;
  }

  if (err.name === 'JsonWebTokenError') {
    err.statusCode = 401;
    err.status = 'fail';
    err.message = 'Invalid token. Please log in again.';
  }

  if (err.name === 'TokenExpiredError') {
    err.statusCode = 401;
    err.status = 'fail';
    err.message = 'Token has expired. Please refresh your session.';
  }

  logger.error(`${err.statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);

  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

module.exports = errorHandler;
