'use strict';

const { ConfigurationError } = require('../errors');
const { HEADER_MODES, STRATEGY_NAMES } = require('../config/defaults');

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isFunction(value) {
  return typeof value === 'function';
}

function isBoolean(value) {
  return typeof value === 'boolean';
}

function isString(value) {
  return typeof value === 'string';
}

function isNonEmptyString(value) {
  return isString(value) && value.trim().length > 0;
}

function ensurePositiveInteger(value, field) {
  if (!isPositiveInteger(value)) {
    throw new ConfigurationError(
      `Option "${field}" must be a positive integer. Received: ${String(value)}`
    );
  }
}

function ensureFunction(value, field, { allowNull = true } = {}) {
  if (value === null || value === undefined) {
    if (allowNull) return;
    throw new ConfigurationError(`Option "${field}" is required and must be a function.`);
  }
  if (!isFunction(value)) {
    throw new ConfigurationError(
      `Option "${field}" must be a function. Received: ${typeof value}`
    );
  }
}

function ensureBoolean(value, field) {
  if (!isBoolean(value)) {
    throw new ConfigurationError(
      `Option "${field}" must be a boolean. Received: ${typeof value}`
    );
  }
}

function ensureString(value, field) {
  if (!isString(value)) {
    throw new ConfigurationError(
      `Option "${field}" must be a string. Received: ${typeof value}`
    );
  }
}

function ensureStrategy(value) {
  const validStrategies = Object.values(STRATEGY_NAMES);
  if (!validStrategies.includes(value)) {
    throw new ConfigurationError(
      `Unknown strategy "${value}". Valid strategies: ${validStrategies.join(', ')}`
    );
  }
}

function ensureStatusCode(value) {
  if (!Number.isInteger(value) || value < 100 || value > 599) {
    throw new ConfigurationError(
      `Option "statusCode" must be an integer between 100 and 599. Received: ${String(value)}`
    );
  }
}

function ensureHeaderMode(value) {
  if (isBoolean(value)) return;
  const validModes = Object.values(HEADER_MODES);
  if (!validModes.includes(value)) {
    throw new ConfigurationError(
      `Option "standardHeaders" must be a boolean or one of: ${validModes.join(', ')}. Received: ${String(value)}`
    );
  }
}

function ensureFailMode(value) {
  if (value !== 'open' && value !== 'closed') {
    throw new ConfigurationError(
      `Option "failMode" must be "open" or "closed". Received: ${String(value)}`
    );
  }
}

function ensureStore(value) {
  if (!value || typeof value !== 'object') {
    throw new ConfigurationError('Option "store" must be an object implementing the store interface.');
  }
  const required = ['increment', 'reset', 'get', 'set'];
  for (const method of required) {
    if (typeof value[method] !== 'function') {
      throw new ConfigurationError(
        `Store is missing required method "${method}". Expected methods: ${required.join(', ')}`
      );
    }
  }
}

function validateOptions(options) {
  ensurePositiveInteger(options.windowMs, 'windowMs');
  ensurePositiveInteger(options.max, 'max');
  ensureFunction(options.keyGenerator, 'keyGenerator', { allowNull: false });
  ensureStrategy(options.strategy);
  ensureStore(options.store);
  ensureString(options.message, 'message');
  ensureStatusCode(options.statusCode);
  ensureHeaderMode(options.standardHeaders);
  ensureBoolean(options.skipSuccessfulRequests, 'skipSuccessfulRequests');
  ensureBoolean(options.skipFailedRequests, 'skipFailedRequests');
  ensureFunction(options.skip, 'skip');
  ensureFunction(options.onLimitReached, 'onLimitReached');
  ensureFunction(options.handler, 'handler');
  if (!isNonEmptyString(options.keyPrefix)) {
    throw new ConfigurationError('Option "keyPrefix" must be a non-empty string.');
  }
  if (!isNonEmptyString(options.requestPropertyName)) {
    throw new ConfigurationError('Option "requestPropertyName" must be a non-empty string.');
  }
  ensureFailMode(options.failMode);
}

module.exports = {
  isPositiveInteger,
  isNonNegativeInteger,
  isFunction,
  isBoolean,
  isString,
  isNonEmptyString,
  ensurePositiveInteger,
  ensureFunction,
  ensureBoolean,
  ensureString,
  ensureStrategy,
  ensureStatusCode,
  ensureHeaderMode,
  ensureFailMode,
  ensureStore,
  validateOptions,
};
