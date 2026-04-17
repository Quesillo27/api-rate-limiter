'use strict';

function buildOptions(base, overrides) {
  return Object.assign({}, base, overrides);
}

function authPreset(overrides = {}) {
  return buildOptions({
    windowMs: 15 * 60 * 1000,
    max: 5,
    strategy: 'fixedWindow',
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
    keyPrefix: 'rl:auth:',
    skipSuccessfulRequests: true,
  }, overrides);
}

function apiPreset(overrides = {}) {
  return buildOptions({
    windowMs: 60 * 1000,
    max: 100,
    strategy: 'slidingWindow',
    keyPrefix: 'rl:api:',
  }, overrides);
}

function burstPreset(overrides = {}) {
  return buildOptions({
    windowMs: 1000,
    max: 10,
    strategy: 'tokenBucket',
    message: 'API burst limit exceeded. Please slow down.',
    keyPrefix: 'rl:burst:',
  }, overrides);
}

function strictPreset(overrides = {}) {
  return buildOptions({
    windowMs: 60 * 60 * 1000,
    max: 3,
    strategy: 'fixedWindow',
    message: 'Rate limit exceeded. Please try again in 1 hour.',
    keyPrefix: 'rl:strict:',
  }, overrides);
}

function publicPreset(overrides = {}) {
  return buildOptions({
    windowMs: 60 * 1000,
    max: 1000,
    strategy: 'fixedWindow',
    keyPrefix: 'rl:public:',
  }, overrides);
}

module.exports = {
  auth: authPreset,
  api: apiPreset,
  burst: burstPreset,
  strict: strictPreset,
  public: publicPreset,
};
