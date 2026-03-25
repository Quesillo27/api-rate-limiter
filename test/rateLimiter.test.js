'use strict';

const express = require('express');
const request = require('supertest');
const { createRateLimiter, MemoryStore } = require('../src');

function buildApp(limiterOptions) {
  const app = express();
  app.set('trust proxy', false);
  app.use(express.json());

  // Use a custom keyGenerator by default so tests control the key via header
  const opts = Object.assign({
    keyGenerator: (req) => req.headers['x-test-ip'] || '127.0.0.1',
  }, limiterOptions);

  const limiter = createRateLimiter(opts);
  app.use(limiter);

  app.get('/', (_req, res) => res.json({ ok: true }));
  app.get('/fail', (_req, res) => res.status(500).json({ error: 'server error' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  return app;
}

describe('createRateLimiter', () => {
  describe('basic rate limiting', () => {
    it('allows requests under the limit', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 3, windowMs: 60000, store });

      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('blocks requests over the limit', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 2, windowMs: 60000, store });

      await request(app).get('/');
      await request(app).get('/');
      const res = await request(app).get('/');

      expect(res.status).toBe(429);
      expect(res.body).toHaveProperty('error');
    });

    it('returns correct status code 429 by default', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 1, windowMs: 60000, store });

      await request(app).get('/');
      const res = await request(app).get('/');

      expect(res.status).toBe(429);
    });

    it('supports custom statusCode', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 1, windowMs: 60000, store, statusCode: 503 });

      await request(app).get('/');
      const res = await request(app).get('/');

      expect(res.status).toBe(503);
    });

    it('supports custom message', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 1, windowMs: 60000, store, message: 'Custom limit message' });

      await request(app).get('/');
      const res = await request(app).get('/');

      expect(res.body.error).toBe('Custom limit message');
    });
  });

  describe('headers', () => {
    it('sets X-RateLimit-Limit header', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 10, windowMs: 60000, store });

      const res = await request(app).get('/');
      expect(res.headers['x-ratelimit-limit']).toBe('10');
    });

    it('sets X-RateLimit-Remaining header and decrements it', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 5, windowMs: 60000, store });

      const res1 = await request(app).get('/');
      expect(res1.headers['x-ratelimit-remaining']).toBe('4');

      const res2 = await request(app).get('/');
      expect(res2.headers['x-ratelimit-remaining']).toBe('3');
    });

    it('sets X-RateLimit-Reset header', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 5, windowMs: 60000, store });

      const before = Math.floor(Date.now() / 1000);
      const res = await request(app).get('/');
      // Allow a 5-second buffer for timing variance in CI environments
      const after = Math.floor(Date.now() / 1000) + 65;

      const reset = parseInt(res.headers['x-ratelimit-reset'], 10);
      expect(reset).toBeGreaterThanOrEqual(before);
      expect(reset).toBeLessThanOrEqual(after);
    });

    it('sets Retry-After header when limited', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 1, windowMs: 60000, store });

      await request(app).get('/');
      const res = await request(app).get('/');

      expect(res.headers['retry-after']).toBeDefined();
      expect(parseInt(res.headers['retry-after'], 10)).toBeGreaterThanOrEqual(0);
    });

    it('does not set headers when headers=false', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 5, windowMs: 60000, store, headers: false });

      const res = await request(app).get('/');
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
      expect(res.headers['x-ratelimit-remaining']).toBeUndefined();
    });
  });

  describe('keyGenerator', () => {
    it('isolates rate limits per key', async () => {
      const store = new MemoryStore();
      const app = buildApp({
        max: 1,
        windowMs: 60000,
        store,
        keyGenerator: (req) => req.headers['x-test-ip'] || req.ip,
      });

      // First IP gets blocked after 1 request
      await request(app).get('/').set('x-test-ip', '1.1.1.1');
      const blocked = await request(app).get('/').set('x-test-ip', '1.1.1.1');
      expect(blocked.status).toBe(429);

      // Second IP should still be allowed
      const allowed = await request(app).get('/').set('x-test-ip', '2.2.2.2');
      expect(allowed.status).toBe(200);
    });
  });

  describe('skip function', () => {
    it('skips rate limiting when skip returns true', async () => {
      const store = new MemoryStore();
      const app = buildApp({
        max: 1,
        windowMs: 60000,
        store,
        skip: async (req) => req.path === '/health',
      });

      // Exhaust limit on /
      await request(app).get('/');
      const blocked = await request(app).get('/');
      expect(blocked.status).toBe(429);

      // /health should always pass
      const skipped = await request(app).get('/health');
      expect(skipped.status).toBe(200);
    });

    it('applies rate limiting when skip returns false', async () => {
      const store = new MemoryStore();
      const app = buildApp({
        max: 1,
        windowMs: 60000,
        store,
        skip: async () => false,
      });

      await request(app).get('/');
      const res = await request(app).get('/');
      expect(res.status).toBe(429);
    });
  });

  describe('strategies', () => {
    describe('fixedWindow (default)', () => {
      it('counts requests within a fixed window', async () => {
        const store = new MemoryStore();
        const app = buildApp({ max: 3, windowMs: 60000, store, strategy: 'fixedWindow' });

        const r1 = await request(app).get('/');
        const r2 = await request(app).get('/');
        const r3 = await request(app).get('/');
        const r4 = await request(app).get('/');

        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect(r3.status).toBe(200);
        expect(r4.status).toBe(429);
      });
    });

    describe('slidingWindow', () => {
      it('counts requests within a sliding window', async () => {
        const store = new MemoryStore();
        const app = buildApp({ max: 2, windowMs: 60000, store, strategy: 'slidingWindow' });

        const r1 = await request(app).get('/');
        const r2 = await request(app).get('/');
        const r3 = await request(app).get('/');

        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect(r3.status).toBe(429);
      });

      it('remaining header reflects sliding window count', async () => {
        const store = new MemoryStore();
        const app = buildApp({ max: 5, windowMs: 60000, store, strategy: 'slidingWindow' });

        const r1 = await request(app).get('/');
        expect(r1.headers['x-ratelimit-remaining']).toBe('4');
      });
    });

    describe('tokenBucket', () => {
      it('allows requests up to capacity', async () => {
        const store = new MemoryStore();
        const app = buildApp({ max: 3, windowMs: 60000, store, strategy: 'tokenBucket' });

        const r1 = await request(app).get('/');
        const r2 = await request(app).get('/');
        const r3 = await request(app).get('/');

        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect(r3.status).toBe(200);
      });

      it('blocks when tokens are exhausted', async () => {
        const store = new MemoryStore();
        const app = buildApp({ max: 2, windowMs: 60000, store, strategy: 'tokenBucket' });

        await request(app).get('/');
        await request(app).get('/');
        const r3 = await request(app).get('/');

        expect(r3.status).toBe(429);
      });
    });

    it('throws on unknown strategy', () => {
      expect(() => {
        createRateLimiter({ strategy: 'invalidStrategy' });
      }).toThrow(/Unknown strategy/);
    });
  });

  describe('onLimitReached callback', () => {
    it('calls onLimitReached when limit is exceeded', async () => {
      const store = new MemoryStore();
      const onLimitReached = jest.fn();
      const app = buildApp({ max: 1, windowMs: 60000, store, onLimitReached });

      await request(app).get('/');
      await request(app).get('/');

      expect(onLimitReached).toHaveBeenCalledTimes(1);
    });

    it('does not call onLimitReached when under limit', async () => {
      const store = new MemoryStore();
      const onLimitReached = jest.fn();
      const app = buildApp({ max: 5, windowMs: 60000, store, onLimitReached });

      await request(app).get('/');
      await request(app).get('/');

      expect(onLimitReached).not.toHaveBeenCalled();
    });
  });

  describe('MemoryStore', () => {
    it('increments counter correctly', async () => {
      const store = new MemoryStore();
      const c1 = await store.increment('test-key', 60);
      const c2 = await store.increment('test-key', 60);
      const c3 = await store.increment('test-key', 60);
      expect(c1).toBe(1);
      expect(c2).toBe(2);
      expect(c3).toBe(3);
    });

    it('resets counter correctly', async () => {
      const store = new MemoryStore();
      await store.increment('test-key', 60);
      await store.increment('test-key', 60);
      await store.reset('test-key');
      const c = await store.increment('test-key', 60);
      expect(c).toBe(1);
    });

    it('gets value correctly', async () => {
      const store = new MemoryStore();
      await store.set('get-key', 42, 60);
      const val = await store.get('get-key');
      expect(val).toBe(42);
    });

    it('returns null for non-existent key', async () => {
      const store = new MemoryStore();
      const val = await store.get('nonexistent');
      expect(val).toBeNull();
    });

    it('treats expired entries as non-existent', async () => {
      const store = new MemoryStore();
      // Manually set an already-expired entry
      store.store.set('expired-key', { value: 99, expiresAt: Date.now() - 1000 });
      const val = await store.get('expired-key');
      expect(val).toBeNull();
    });

    it('resets counter for expired keys on increment', async () => {
      const store = new MemoryStore();
      // Manually set an already-expired entry
      store.store.set('exp-incr', { value: 5, expiresAt: Date.now() - 1000 });
      const c = await store.increment('exp-incr', 60);
      expect(c).toBe(1);
    });

    it('destroy clears intervals and store', () => {
      const store = new MemoryStore();
      store.store.set('k', { value: 1, expiresAt: Date.now() + 10000 });
      store.destroy();
      expect(store.store.size).toBe(0);
    });
  });

  describe('keyPrefix', () => {
    it('uses custom keyPrefix to namespace keys', async () => {
      const store = new MemoryStore();

      // Two limiters with different prefixes share the same store
      // but should have independent counters
      const staticKey = () => '127.0.0.1';

      const app1 = express();
      app1.use(createRateLimiter({ max: 1, windowMs: 60000, store, keyPrefix: 'ns1:', keyGenerator: staticKey }));
      app1.get('/', (_req, res) => res.json({ ok: true }));

      const app2 = express();
      app2.use(createRateLimiter({ max: 1, windowMs: 60000, store, keyPrefix: 'ns2:', keyGenerator: staticKey }));
      app2.get('/', (_req, res) => res.json({ ok: true }));

      // Exhaust ns1
      await request(app1).get('/');
      const blocked = await request(app1).get('/');
      expect(blocked.status).toBe(429);

      // ns2 should still have capacity
      const allowed = await request(app2).get('/');
      expect(allowed.status).toBe(200);
    });
  });
});
