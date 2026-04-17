'use strict';

const express = require('express');
const { createRateLimiter, presets, MemoryStore, createLogger } = require('../src');

const app = express();
app.use(express.json());

const sharedStore = new MemoryStore();
const logger = createLogger({ level: 'info' });

const authLimiter = createRateLimiter(presets.auth({
  store: sharedStore,
  logger,
  onLimitReached: (req) => logger.warn('auth limit hit', { ip: req.ip }),
}));

const apiLimiter = createRateLimiter(presets.api({
  store: sharedStore,
  standardHeaders: 'draft-7',
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
}));

const burstLimiter = createRateLimiter(presets.burst({
  store: sharedStore,
}));

const strictLimiter = createRateLimiter(presets.strict({
  store: sharedStore,
}));

app.post('/login', authLimiter, (_req, res) => res.json({ token: 'jwt' }));
app.post('/register', authLimiter, (_req, res) => res.status(201).json({ ok: true }));

app.get('/api/data', apiLimiter, (req, res) => {
  res.json({ items: [], meta: req.rateLimit });
});

app.get('/api/burst', burstLimiter, (_req, res) => res.json({ ok: true }));

app.post('/api/password-reset', strictLimiter, (_req, res) => {
  res.json({ message: 'Password reset email sent.' });
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Presets example listening on port ${PORT}`);
  console.log('Try:');
  console.log('  POST /login                  (auth preset, 5/15min)');
  console.log('  GET  /api/data               (api preset, 100/min, draft-7 headers)');
  console.log('  GET  /api/burst              (burst preset, 10 tokens/sec)');
  console.log('  POST /api/password-reset     (strict preset, 3/hour)');
});

module.exports = app;
