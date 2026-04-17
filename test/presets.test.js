'use strict';

const presets = require('../src/presets');
const { createRateLimiter, MemoryStore } = require('../src');
const express = require('express');
const request = require('supertest');

describe('presets', () => {
  it('auth preset has strict limits', () => {
    const opts = presets.auth();
    expect(opts.max).toBe(5);
    expect(opts.windowMs).toBe(15 * 60 * 1000);
    expect(opts.keyPrefix).toBe('rl:auth:');
    expect(opts.skipSuccessfulRequests).toBe(true);
  });

  it('api preset uses slidingWindow', () => {
    const opts = presets.api();
    expect(opts.strategy).toBe('slidingWindow');
    expect(opts.max).toBe(100);
    expect(opts.keyPrefix).toBe('rl:api:');
  });

  it('burst preset uses tokenBucket', () => {
    const opts = presets.burst();
    expect(opts.strategy).toBe('tokenBucket');
    expect(opts.max).toBe(10);
    expect(opts.windowMs).toBe(1000);
  });

  it('strict preset has long window', () => {
    const opts = presets.strict();
    expect(opts.max).toBe(3);
    expect(opts.windowMs).toBe(60 * 60 * 1000);
  });

  it('public preset is permissive', () => {
    const opts = presets.public();
    expect(opts.max).toBe(1000);
  });

  it('presets accept overrides', () => {
    const opts = presets.auth({ max: 20, message: 'custom' });
    expect(opts.max).toBe(20);
    expect(opts.message).toBe('custom');
    expect(opts.windowMs).toBe(15 * 60 * 1000);
  });

  it('preset options can be passed to createRateLimiter', async () => {
    const store = new MemoryStore();
    const opts = presets.auth({ max: 2, store, keyGenerator: () => 'u1' });
    const limiter = createRateLimiter(opts);

    const app = express();
    app.use(limiter);
    app.post('/login', (_req, res) => res.status(401).json({ error: 'bad creds' }));

    const r1 = await request(app).post('/login');
    const r2 = await request(app).post('/login');
    const r3 = await request(app).post('/login');
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(r3.status).toBe(429);
  });
});
