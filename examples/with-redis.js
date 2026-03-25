'use strict';

const Redis = require('ioredis');
const express = require('express');
const { createRateLimiter, RedisStore } = require('../src');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
});

redis.on('error', (err) => console.error('Redis error:', err.message));
redis.on('connect', () => console.log('Connected to Redis'));

const store = new RedisStore(redis);

const app = express();
app.use(express.json());

const limiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  store,
  keyPrefix: 'myapp:rl:',
});

app.use(limiter);

app.get('/', (req, res) => {
  res.json({ message: 'Rate limited with Redis!', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server with Redis running on port ${PORT}`));

module.exports = app;
