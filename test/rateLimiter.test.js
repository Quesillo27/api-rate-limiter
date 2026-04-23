'use strict';

const express = require('express');
const request = require('supertest');
const { createRateLimiter, MemoryStore } = require('../src');

function buildApp(limiterOptions) {
  const app = express();
  app.set('trust proxy', false);
  app.use(express.json());

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

    it('exposes limit info via req.rateLimit', async () => {
      const store = new MemoryStore();
      const app = express();
      app.use(createRateLimiter({
        max: 5,
        windowMs: 60000,
        store,
        keyGenerator: () => 'single',
      }));
      let captured;
      app.get('/', (req, res) => {
        captured = req.rateLimit;
        res.json({ ok: true });
      });
      await request(app).get('/');
      expect(captured).toBeDefined();
      expect(captured.limit).toBe(5);
      expect(captured.remaining).toBe(4);
      expect(captured.current).toBe(1);
      expect(captured.strategy).toBe('fixedWindow');
      expect(captured.resetTime).toBeInstanceOf(Date);
    });

    it('accepts custom requestPropertyName', async () => {
      const store = new MemoryStore();
      const app = express();
      app.use(createRateLimiter({
        max: 2,
        windowMs: 60000,
        store,
        requestPropertyName: 'limiterState',
        keyGenerator: () => 'x',
      }));
      let captured;
      app.get('/', (req, res) => {
        captured = req.limiterState;
        res.json({ ok: true });
      });
      await request(app).get('/');
      expect(captured.limit).toBe(2);
    });
  });

  describe('headers', () => {
    it('sets X-RateLimit-Limit header (legacy mode)', async () => {
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

    it('sets IETF draft-7 RateLimit headers', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 10, windowMs: 60000, store, standardHeaders: 'draft-7' });

      const res = await request(app).get('/');
      expect(res.headers['ratelimit-limit']).toBe('10');
      expect(res.headers['ratelimit-remaining']).toBe('9');
      expect(res.headers['ratelimit-policy']).toMatch(/10;w=60;policy="fixedWindow"/);
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    });

    it('supports both legacy and draft-7 headers simultaneously', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 5, windowMs: 60000, store, standardHeaders: 'both' });

      const res = await request(app).get('/');
      expect(res.headers['x-ratelimit-limit']).toBe('5');
      expect(res.headers['ratelimit-limit']).toBe('5');
    });

    it('disables headers when standardHeaders is "none"', async () => {
      const store = new MemoryStore();
      const app = buildApp({ max: 5, windowMs: 60000, store, standardHeaders: 'none' });

      const res = await request(app).get('/');
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
      expect(res.headers['ratelimit-limit']).toBeUndefined();
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

      await request(app).get('/').set('x-test-ip', '1.1.1.1');
      const blocked = await request(app).get('/').set('x-test-ip', '1.1.1.1');
      expect(blocked.status).toBe(429);

      const allowed = await request(app).get('/').set('x-test-ip', '2.2.2.2');
      expect(allowed.status).toBe(200);
    });

    it('supports async keyGenerator functions', async () => {
      const store = new MemoryStore();
      const app = buildApp({
        max: 1,
        windowMs: 60000,
        store,
        keyGenerator: async (req) => req.headers['x-user-id'],
      });

      await request(app).get('/').set('x-user-id', 'user-1');
      const blocked = await request(app).get('/').set('x-user-id', 'user-1');
      const allowed = await request(app).get('/').set('x-user-id', 'user-2');

      expect(blocked.status).toBe(429);
      expect(allowed.status).toBe(200);
    });

    it('falls back to "unknown" when keyGenerator returns empty', async () => {
      const store = new MemoryStore();
      const app = buildApp({
        max: 1,
        windowMs: 60000,
        store,
        keyGenerator: () => '',
      });

      const res1 = await request(app).get('/');
      const res2 = await request(app).get('/');
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(429);
    });

    it('falls back to "unknown" when async keyGenerator returns empty', async () => {
      const store = new MemoryStore();
      const app = buildApp({
        max: 1,
        windowMs: 60000,
        store,
        keyGenerator: async () => '',
      });

      const res1 = await request(app).get('/');
      const res2 = await request(app).get('/');
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(429);
    });

    it('forwards async keyGenerator errors to Express', async () => {
      const store = new MemoryStore();
      const app = express();
      app.use(createRateLimiter({
        max: 1,
        windowMs: 60000,
        store,
        keyGenerator: async () => {
          throw new Error('key lookup failed');
        },
      }));
      app.get('/', (_req, res) => res.json({ ok: true }));
      app.use((err, _req, res, _next) => {
        res.status(500).json({ error: err.message });
      });

      const res = await request(app).get('/');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'key lookup failed' });
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

      await request(app).get('/');
      const blocked = await request(app).get('/');
      expect(blocked.status).toBe(429);

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

    it('does not crash when onLimitReached throws', async () => {
      const store = new MemoryStore();
      const onLimitReached = () => { throw new Error('boom'); };
      const app = buildApp({ max: 1, windowMs: 60000, store, onLimitReached });

      await request(app).get('/');
      const res = await request(app).get('/');
      expect(res.status).toBe(429);
    });
  });

  describe('custom handler', () => {
    it('invokes the handler when limit is exceeded', async () => {
      const store = new MemoryStore();
      const app = buildApp({
        max: 1,
        windowMs: 60000,
        store,
        handler: (_req, res) => {
          res.status(418).json({ tea: true });
        },
      });

      await request(app).get('/');
      const res = await request(app).get('/');
      expect(res.status).toBe(418);
      expect(res.body).toEqual({ tea: true });
    });
  });

  describe('keyPrefix', () => {
    it('uses custom keyPrefix to namespace keys', async () => {
      const store = new MemoryStore();

      const staticKey = () => '127.0.0.1';

      const app1 = express();
      app1.use(createRateLimiter({ max: 1, windowMs: 60000, store, keyPrefix: 'ns1:', keyGenerator: staticKey }));
      app1.get('/', (_req, res) => res.json({ ok: true }));

      const app2 = express();
      app2.use(createRateLimiter({ max: 1, windowMs: 60000, store, keyPrefix: 'ns2:', keyGenerator: staticKey }));
      app2.get('/', (_req, res) => res.json({ ok: true }));

      await request(app1).get('/');
      const blocked = await request(app1).get('/');
      expect(blocked.status).toBe(429);

      const allowed = await request(app2).get('/');
      expect(allowed.status).toBe(200);
    });
  });

  describe('skipSuccessfulRequests', () => {
    it('does not count 2xx responses against the limit', async () => {
      const store = new MemoryStore();
      const app = express();
      app.use(createRateLimiter({
        max: 2,
        windowMs: 60000,
        store,
        skipSuccessfulRequests: true,
        keyGenerator: () => 'skip-ok',
      }));
      app.get('/', (_req, res) => res.json({ ok: true }));

      const r1 = await request(app).get('/');
      const r2 = await request(app).get('/');
      const r3 = await request(app).get('/');
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(200);
    });
  });

  describe('skipFailedRequests', () => {
    it('does not count 4xx/5xx responses against the limit', async () => {
      const store = new MemoryStore();
      const app = express();
      app.use(createRateLimiter({
        max: 2,
        windowMs: 60000,
        store,
        skipFailedRequests: true,
        keyGenerator: () => 'skip-fail',
      }));
      app.get('/', (_req, res) => res.status(500).json({ error: 'boom' }));

      const r1 = await request(app).get('/');
      const r2 = await request(app).get('/');
      const r3 = await request(app).get('/');
      expect(r1.status).toBe(500);
      expect(r2.status).toBe(500);
      expect(r3.status).toBe(500);
    });
  });

  describe('store failure handling', () => {
    it('fails open by default when store throws', async () => {
      const store = new MemoryStore();
      store.increment = async () => { throw new Error('store down'); };
      const app = buildApp({ max: 1, windowMs: 60000, store });
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
    });

    it('fails closed (503) when failMode is "closed"', async () => {
      const store = new MemoryStore();
      store.increment = async () => { throw new Error('store down'); };
      const app = buildApp({ max: 1, windowMs: 60000, store, failMode: 'closed' });
      const res = await request(app).get('/');
      expect(res.status).toBe(503);
    });
  });
});
