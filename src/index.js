'use strict';

const { createRateLimiter, STRATEGIES } = require('./rateLimiter');
const MemoryStore = require('./stores/memoryStore');
const RedisStore = require('./stores/redisStore');
const presets = require('./presets');
const errors = require('./errors');
const { createLogger, LOG_LEVELS } = require('./utils/logger');
const { HEADER_MODES, STRATEGY_NAMES } = require('./config/defaults');

module.exports = {
  createRateLimiter,
  MemoryStore,
  RedisStore,
  presets,
  createLogger,
  STRATEGIES,
  STRATEGY_NAMES,
  HEADER_MODES,
  LOG_LEVELS,
  ...errors,
};
