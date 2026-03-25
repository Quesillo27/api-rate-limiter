'use strict';

const express = require('express');
const { createRateLimiter } = require('../src');

const app = express();
app.use(express.json());

// Global limiter: 100 requests per minute
const globalLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
});

app.use(globalLimiter);

// Strict limiter for auth routes: 5 requests per 15 minutes
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
  keyPrefix: 'rl:auth:',
});

app.post('/login', authLimiter, (req, res) => {
  res.json({ token: 'example-jwt-token' });
});

app.post('/register', authLimiter, (req, res) => {
  res.json({ user: 'created' });
});

app.get('/', (req, res) => {
  res.json({ message: 'Hello World', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
