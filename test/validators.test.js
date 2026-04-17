'use strict';

const {
  isPositiveInteger,
  isNonEmptyString,
  ensurePositiveInteger,
  ensureFunction,
  ensureBoolean,
  ensureStrategy,
  ensureStatusCode,
  ensureHeaderMode,
  ensureStore,
  ensureFailMode,
  validateOptions,
} = require('../src/utils/validators');
const MemoryStore = require('../src/stores/memoryStore');
const { ConfigurationError } = require('../src/errors');

function baseOptions(overrides = {}) {
  return Object.assign({
    windowMs: 60000,
    max: 100,
    keyGenerator: () => 'k',
    strategy: 'fixedWindow',
    store: new MemoryStore(),
    message: 'too many',
    statusCode: 429,
    standardHeaders: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    skip: null,
    onLimitReached: null,
    handler: null,
    keyPrefix: 'rl:',
    requestPropertyName: 'rateLimit',
    failMode: 'open',
  }, overrides);
}

describe('validators', () => {
  describe('primitive helpers', () => {
    it('isPositiveInteger detects correctly', () => {
      expect(isPositiveInteger(1)).toBe(true);
      expect(isPositiveInteger(0)).toBe(false);
      expect(isPositiveInteger(-1)).toBe(false);
      expect(isPositiveInteger(1.5)).toBe(false);
      expect(isPositiveInteger('1')).toBe(false);
    });

    it('isNonEmptyString detects correctly', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
    });
  });

  describe('ensurePositiveInteger', () => {
    it('passes for valid integer', () => {
      expect(() => ensurePositiveInteger(5, 'x')).not.toThrow();
    });
    it('throws for zero', () => {
      expect(() => ensurePositiveInteger(0, 'x')).toThrow(ConfigurationError);
    });
    it('throws for string', () => {
      expect(() => ensurePositiveInteger('5', 'x')).toThrow(ConfigurationError);
    });
  });

  describe('ensureFunction', () => {
    it('allows null by default', () => {
      expect(() => ensureFunction(null, 'x')).not.toThrow();
    });
    it('throws if allowNull:false and null', () => {
      expect(() => ensureFunction(null, 'x', { allowNull: false })).toThrow(ConfigurationError);
    });
    it('throws for non-function', () => {
      expect(() => ensureFunction(42, 'x')).toThrow(ConfigurationError);
    });
    it('passes for function', () => {
      expect(() => ensureFunction(() => {}, 'x')).not.toThrow();
    });
  });

  describe('ensureBoolean', () => {
    it('accepts true/false', () => {
      expect(() => ensureBoolean(true, 'x')).not.toThrow();
      expect(() => ensureBoolean(false, 'x')).not.toThrow();
    });
    it('rejects others', () => {
      expect(() => ensureBoolean(1, 'x')).toThrow(ConfigurationError);
      expect(() => ensureBoolean('yes', 'x')).toThrow(ConfigurationError);
    });
  });

  describe('ensureStrategy', () => {
    it('accepts fixedWindow/slidingWindow/tokenBucket', () => {
      expect(() => ensureStrategy('fixedWindow')).not.toThrow();
      expect(() => ensureStrategy('slidingWindow')).not.toThrow();
      expect(() => ensureStrategy('tokenBucket')).not.toThrow();
    });
    it('rejects unknown', () => {
      expect(() => ensureStrategy('weirdStrategy')).toThrow(/Unknown strategy/);
    });
  });

  describe('ensureStatusCode', () => {
    it('accepts valid HTTP codes', () => {
      expect(() => ensureStatusCode(200)).not.toThrow();
      expect(() => ensureStatusCode(429)).not.toThrow();
      expect(() => ensureStatusCode(503)).not.toThrow();
    });
    it('rejects out of range', () => {
      expect(() => ensureStatusCode(99)).toThrow(ConfigurationError);
      expect(() => ensureStatusCode(600)).toThrow(ConfigurationError);
      expect(() => ensureStatusCode('429')).toThrow(ConfigurationError);
    });
  });

  describe('ensureHeaderMode', () => {
    it('accepts boolean', () => {
      expect(() => ensureHeaderMode(true)).not.toThrow();
      expect(() => ensureHeaderMode(false)).not.toThrow();
    });
    it('accepts modes', () => {
      expect(() => ensureHeaderMode('legacy')).not.toThrow();
      expect(() => ensureHeaderMode('draft-7')).not.toThrow();
      expect(() => ensureHeaderMode('both')).not.toThrow();
      expect(() => ensureHeaderMode('none')).not.toThrow();
    });
    it('rejects unknown mode', () => {
      expect(() => ensureHeaderMode('invalid')).toThrow(ConfigurationError);
    });
  });

  describe('ensureStore', () => {
    it('accepts valid store', () => {
      expect(() => ensureStore(new MemoryStore())).not.toThrow();
    });
    it('rejects incomplete store', () => {
      expect(() => ensureStore({ get: () => {} })).toThrow(/missing required method/);
    });
    it('rejects non-object', () => {
      expect(() => ensureStore(null)).toThrow(ConfigurationError);
    });
  });

  describe('ensureFailMode', () => {
    it('accepts open/closed', () => {
      expect(() => ensureFailMode('open')).not.toThrow();
      expect(() => ensureFailMode('closed')).not.toThrow();
    });
    it('rejects other values', () => {
      expect(() => ensureFailMode('maybe')).toThrow(ConfigurationError);
    });
  });

  describe('validateOptions', () => {
    it('passes on full valid config', () => {
      expect(() => validateOptions(baseOptions())).not.toThrow();
    });
    it('throws on bad windowMs', () => {
      expect(() => validateOptions(baseOptions({ windowMs: 0 }))).toThrow(/windowMs/);
    });
    it('throws on bad max', () => {
      expect(() => validateOptions(baseOptions({ max: -5 }))).toThrow(/max/);
    });
    it('throws on empty keyPrefix', () => {
      expect(() => validateOptions(baseOptions({ keyPrefix: '' }))).toThrow(/keyPrefix/);
    });
    it('throws on missing keyGenerator', () => {
      expect(() => validateOptions(baseOptions({ keyGenerator: null }))).toThrow(/keyGenerator/);
    });
  });
});
