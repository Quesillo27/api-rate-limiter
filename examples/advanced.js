'use strict';

const express = require('express');
const { createRateLimiter, MemoryStore } = require('../src');

const app = express();
app.use(express.json());

// Shared store across multiple limiters for memory efficiency
const sharedStore = new MemoryStore();

// Per-user sliding window limiter (uses x-user-id header or falls back to IP)
const userLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 1000,
  store: sharedStore,
  strategy: 'slidingWindow',
  keyPrefix: 'rl:user:',
  keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
  onLimitReached: (req, res, opts) => {
    const identifier = req.headers['x-user-id'] || req.ip;
    console.warn(`[RateLimit] Limit exceeded for identifier: ${identifier} at ${new Date().toISOString()}`);
  },
  skip: async (req) => req.path === '/health',
});

// Token bucket for burst-tolerant API endpoints
const apiBucketLimiter = createRateLimiter({
  strategy: 'tokenBucket',
  max: 10,         // 10 tokens capacity
  windowMs: 1000,  // refills 10 tokens per second
  keyPrefix: 'rl:api:bucket:',
  message: 'API burst limit exceeded. Please slow down.',
});

// Strict fixed window for sensitive operations
const sensitiveOpLimiter = createRateLimiter({
  strategy: 'fixedWindow',
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 3,
  keyPrefix: 'rl:sensitive:',
  message: 'Too many attempts. Please try again in 15 minutes.',
  skipSuccessfulRequests: false,
  onLimitReached: (req, res) => {
    console.error(`[Security] Sensitive operation rate limit hit from IP: ${req.ip}`);
  },
});

// Routes
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/data', userLimiter, apiBucketLimiter, (req, res) => {
  res.json({
    data: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, value: Math.random() })),
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/password-reset', sensitiveOpLimiter, (req, res) => {
  res.json({ message: 'Password reset email sent.' });
});

app.post('/api/verify-otp', sensitiveOpLimiter, (req, res) => {
  res.json({ message: 'OTP verified successfully.' });
});

// Demonstrate skip function: admin users bypass rate limiting
const adminAwareLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 50,
  keyPrefix: 'rl:public:',
  skip: async (req) => {
    const adminToken = req.headers['x-admin-token'];
    return adminToken === process.env.ADMIN_TOKEN;
  },
});

app.get('/api/public', adminAwareLimit, (req, res) => {
  res.json({ message: 'Public endpoint with admin bypass.' });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Advanced example running on port ${PORT}`);
  console.log('Strategies in use:');
  console.log('  - Sliding window for user limiter');
  console.log('  - Token bucket for API burst limiter');
  console.log('  - Fixed window for sensitive operations');
});

module.exports = app;
