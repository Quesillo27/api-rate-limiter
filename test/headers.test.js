'use strict';

const {
  normalizeMode,
  computeRetryAfterSeconds,
  setRateLimitHeaders,
  setRetryAfter,
} = require('../src/utils/headers');

function mockRes() {
  const headers = {};
  return {
    setHeader(name, value) { headers[name.toLowerCase()] = String(value); },
    headers,
  };
}

describe('headers', () => {
  describe('normalizeMode', () => {
    it('true → legacy', () => expect(normalizeMode(true)).toBe('legacy'));
    it('false → none', () => expect(normalizeMode(false)).toBe('none'));
    it('draft-7 passthrough', () => expect(normalizeMode('draft-7')).toBe('draft-7'));
    it('both passthrough', () => expect(normalizeMode('both')).toBe('both'));
    it('none passthrough', () => expect(normalizeMode('none')).toBe('none'));
    it('legacy passthrough', () => expect(normalizeMode('legacy')).toBe('legacy'));
    it('unknown → legacy', () => expect(normalizeMode('garbage')).toBe('legacy'));
  });

  describe('computeRetryAfterSeconds', () => {
    it('returns positive seconds', () => {
      const result = { reset: Date.now() + 30000 };
      const secs = computeRetryAfterSeconds(result);
      expect(secs).toBeGreaterThanOrEqual(29);
      expect(secs).toBeLessThanOrEqual(31);
    });
    it('returns 0 when reset is in the past', () => {
      const result = { reset: Date.now() - 1000 };
      expect(computeRetryAfterSeconds(result)).toBe(0);
    });
  });

  describe('setRateLimitHeaders', () => {
    const options = { max: 10, windowMs: 60000, strategy: 'fixedWindow', standardHeaders: true };
    const result = { remaining: 7, reset: Date.now() + 30000, count: 3, allowed: true };

    it('sets legacy headers when standardHeaders=true', () => {
      const res = mockRes();
      setRateLimitHeaders(res, result, options);
      expect(res.headers['x-ratelimit-limit']).toBe('10');
      expect(res.headers['x-ratelimit-remaining']).toBe('7');
      expect(res.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('sets draft-7 headers', () => {
      const res = mockRes();
      setRateLimitHeaders(res, result, Object.assign({}, options, { standardHeaders: 'draft-7' }));
      expect(res.headers['ratelimit-limit']).toBe('10');
      expect(res.headers['ratelimit-remaining']).toBe('7');
      expect(res.headers['ratelimit-policy']).toMatch(/10;w=60;policy="fixedWindow"/);
    });

    it('sets both families when mode=both', () => {
      const res = mockRes();
      setRateLimitHeaders(res, result, Object.assign({}, options, { standardHeaders: 'both' }));
      expect(res.headers['x-ratelimit-limit']).toBe('10');
      expect(res.headers['ratelimit-limit']).toBe('10');
    });

    it('sets nothing when standardHeaders=false', () => {
      const res = mockRes();
      setRateLimitHeaders(res, result, Object.assign({}, options, { standardHeaders: false }));
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
      expect(res.headers['ratelimit-limit']).toBeUndefined();
    });

    it('floors remaining to zero for negative values', () => {
      const res = mockRes();
      setRateLimitHeaders(res, Object.assign({}, result, { remaining: -5 }), options);
      expect(res.headers['x-ratelimit-remaining']).toBe('0');
    });
  });

  describe('setRetryAfter', () => {
    it('sets Retry-After header', () => {
      const res = mockRes();
      setRetryAfter(res, { reset: Date.now() + 10000 });
      expect(parseInt(res.headers['retry-after'], 10)).toBeGreaterThanOrEqual(9);
    });
  });
});
