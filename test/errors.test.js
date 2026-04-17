'use strict';

const {
  RateLimiterError,
  ConfigurationError,
  StoreError,
  StrategyError,
} = require('../src/errors');

describe('errors', () => {
  it('RateLimiterError has default code', () => {
    const err = new RateLimiterError('x');
    expect(err.name).toBe('RateLimiterError');
    expect(err.code).toBe('RATE_LIMITER_ERROR');
    expect(err instanceof Error).toBe(true);
  });

  it('ConfigurationError inherits and sets code', () => {
    const err = new ConfigurationError('bad');
    expect(err.code).toBe('CONFIGURATION_ERROR');
    expect(err).toBeInstanceOf(RateLimiterError);
  });

  it('StoreError keeps cause', () => {
    const cause = new Error('underlying');
    const err = new StoreError('wrap', cause);
    expect(err.code).toBe('STORE_ERROR');
    expect(err.cause).toBe(cause);
  });

  it('StrategyError has correct code', () => {
    const err = new StrategyError('x');
    expect(err.code).toBe('STRATEGY_ERROR');
  });
});
