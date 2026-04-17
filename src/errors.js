'use strict';

class RateLimiterError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RateLimiterError';
    this.code = code || 'RATE_LIMITER_ERROR';
  }
}

class ConfigurationError extends RateLimiterError {
  constructor(message) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

class StoreError extends RateLimiterError {
  constructor(message, cause) {
    super(message, 'STORE_ERROR');
    this.name = 'StoreError';
    if (cause) this.cause = cause;
  }
}

class StrategyError extends RateLimiterError {
  constructor(message) {
    super(message, 'STRATEGY_ERROR');
    this.name = 'StrategyError';
  }
}

module.exports = {
  RateLimiterError,
  ConfigurationError,
  StoreError,
  StrategyError,
};
