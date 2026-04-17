'use strict';

const { LOG_LEVELS } = require('../config/defaults');

function isValidLevel(level) {
  return typeof level === 'string' && Object.prototype.hasOwnProperty.call(LOG_LEVELS, level);
}

function resolveLevel(level) {
  if (isValidLevel(level)) return LOG_LEVELS[level];
  return LOG_LEVELS.warn;
}

function formatMessage(level, message, meta) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    scope: 'api-rate-limiter',
    message,
  };
  if (meta && typeof meta === 'object') {
    payload.meta = meta;
  }
  return payload;
}

function createLogger(options = {}) {
  const {
    level = 'warn',
    output = console,
    silent = false,
    formatter = null,
  } = options;

  const currentLevel = silent ? LOG_LEVELS.silent : resolveLevel(level);

  function log(targetLevel, method, message, meta) {
    if (currentLevel < LOG_LEVELS[targetLevel]) return;
    const payload = typeof formatter === 'function'
      ? formatter(targetLevel, message, meta)
      : formatMessage(targetLevel, message, meta);
    if (output && typeof output[method] === 'function') {
      output[method](payload);
    }
  }

  return {
    level: currentLevel,
    error(message, meta) { log('error', 'error', message, meta); },
    warn(message, meta) { log('warn', 'warn', message, meta); },
    info(message, meta) { log('info', 'info', message, meta); },
    debug(message, meta) { log('debug', 'debug', message, meta); },
  };
}

function isLoggerLike(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  return ['error', 'warn', 'info', 'debug'].every((fn) => typeof candidate[fn] === 'function');
}

module.exports = {
  createLogger,
  isLoggerLike,
  LOG_LEVELS,
};
