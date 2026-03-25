# api-rate-limiter

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![npm version](https://img.shields.io/badge/npm-1.0.0-blue)

Express middleware for API rate limiting with Redis support. Implements multiple strategies: **fixed window**, **sliding window**, and **token bucket**. Works out of the box with an in-memory store and scales to Redis for distributed environments.

---

## Features

- Three rate limiting strategies: Fixed Window, Sliding Window, Token Bucket
- In-memory store with automatic TTL cleanup (no dependencies required)
- Redis store via `ioredis` for distributed/multi-instance deployments
- Standard `X-RateLimit-*` and `Retry-After` headers
- Custom key generators (by IP, user ID, API key, etc.)
- Async `skip` function to bypass limiting for specific requests
- `onLimitReached` callback for logging and alerting
- `skipSuccessfulRequests` and `skipFailedRequests` options
- Custom key prefixes for namespace isolation
- Configurable status code and response message
- Full test coverage with Jest + Supertest

---

## Installation

```bash
npm install api-rate-limiter
```

`express` is a peer dependency and must be installed separately:

```bash
npm install express
```

For Redis support:

```bash
npm install ioredis
```

---

## Quick Start

```js
const express = require('express');
const { createRateLimiter } = require('api-rate-limiter');

const app = express();

const limiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,            // 100 requests per minute
});

app.use(limiter);

app.get('/', (req, res) => res.json({ message: 'Hello!' }));
app.listen(3000);
```

---

## Options

| Option                   | Type       | Default                                    | Description                                                   |
|--------------------------|------------|--------------------------------------------|---------------------------------------------------------------|
| `windowMs`               | `number`   | `60000`                                    | Time window in milliseconds                                   |
| `max`                    | `number`   | `100`                                      | Maximum requests allowed per window                           |
| `keyGenerator`           | `function` | `(req) => req.ip`                          | Function to generate a unique key per client                  |
| `strategy`               | `string`   | `'fixedWindow'`                            | Strategy: `fixedWindow`, `slidingWindow`, `tokenBucket`       |
| `store`                  | `object`   | `new MemoryStore()`                        | Store instance (`MemoryStore` or `RedisStore`)                |
| `message`                | `string`   | `'Too many requests, please try again...'` | Response body message when rate limited                       |
| `statusCode`             | `number`   | `429`                                      | HTTP status code when rate limited                            |
| `headers`                | `boolean`  | `true`                                     | Whether to send `X-RateLimit-*` headers                       |
| `skipSuccessfulRequests` | `boolean`  | `false`                                    | Do not count 2xx/3xx responses against the limit              |
| `skipFailedRequests`     | `boolean`  | `false`                                    | Do not count 4xx/5xx responses against the limit              |
| `skip`                   | `function` | `null`                                     | Async `(req, res) => boolean`. Skip limiting if returns true  |
| `onLimitReached`         | `function` | `null`                                     | Callback `(req, res, options)` invoked when limit is exceeded |
| `keyPrefix`              | `string`   | `'rl:'`                                    | Prefix added to all store keys                                |

---

## Response Headers

When `headers: true` (default), the following headers are sent on every response:

| Header                | Description                                  |
|-----------------------|----------------------------------------------|
| `X-RateLimit-Limit`   | Maximum requests allowed per window          |
| `X-RateLimit-Remaining` | Requests remaining in the current window   |
| `X-RateLimit-Reset`   | Unix timestamp (seconds) when window resets  |
| `Retry-After`         | Seconds to wait before retrying (429 only)   |

---

## Examples

### Basic usage with auth route protection

```js
const express = require('express');
const { createRateLimiter } = require('api-rate-limiter');

const app = express();

// Global: 100 req/min
app.use(createRateLimiter({ windowMs: 60000, max: 100 }));

// Auth routes: 5 req/15min
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts.',
});
app.post('/login', authLimiter, handler);
app.post('/register', authLimiter, handler);
```

### Redis store for distributed deployments

```js
const Redis = require('ioredis');
const { createRateLimiter, RedisStore } = require('api-rate-limiter');

const redis = new Redis({ host: process.env.REDIS_HOST, port: 6379 });
const store = new RedisStore(redis);

const limiter = createRateLimiter({
  windowMs: 60000,
  max: 100,
  store,
});
```

### Custom key generator (per user, not per IP)

```js
const limiter = createRateLimiter({
  windowMs: 60000,
  max: 1000,
  keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
  keyPrefix: 'rl:user:',
});
```

### Multiple limiters on the same route

```js
const globalLimiter = createRateLimiter({ windowMs: 60000, max: 1000 });
const strictLimiter = createRateLimiter({ windowMs: 60000, max: 10 });

app.post('/api/expensive-operation', globalLimiter, strictLimiter, handler);
```

### Skip function (e.g., bypass for health checks or admin users)

```js
const limiter = createRateLimiter({
  windowMs: 60000,
  max: 100,
  skip: async (req) => {
    if (req.path === '/health') return true;
    if (req.headers['x-admin-token'] === process.env.ADMIN_TOKEN) return true;
    return false;
  },
});
```

### onLimitReached callback for logging/alerting

```js
const limiter = createRateLimiter({
  windowMs: 60000,
  max: 100,
  onLimitReached: (req, res, options) => {
    console.warn(`Rate limit exceeded: IP=${req.ip}, path=${req.path}`);
    // Send alert to monitoring system, etc.
  },
});
```

---

## Strategies

### Fixed Window (`fixedWindow`)

Divides time into fixed windows of `windowMs` duration. Simple and performant. Susceptible to burst traffic at window boundaries.

```js
createRateLimiter({ strategy: 'fixedWindow', windowMs: 60000, max: 100 });
```

### Sliding Window (`slidingWindow`)

Tracks individual request timestamps within the window. More accurate than fixed window but uses more memory. Prevents the boundary burst problem.

```js
createRateLimiter({ strategy: 'slidingWindow', windowMs: 60000, max: 100 });
```

### Token Bucket (`tokenBucket`)

Tokens refill at a constant rate (`max` tokens per `windowMs`). Allows controlled bursts up to the bucket capacity. Ideal for APIs that need to handle brief spikes gracefully.

```js
// 10 tokens capacity, refills at 10 tokens/second
createRateLimiter({ strategy: 'tokenBucket', max: 10, windowMs: 1000 });
```

| Strategy        | Burst Tolerance | Memory Usage | Accuracy | Best For                       |
|-----------------|----------------|--------------|----------|--------------------------------|
| Fixed Window    | Low             | Low          | Medium   | Simple global limits           |
| Sliding Window  | Medium          | High         | High     | Strict per-user limits         |
| Token Bucket    | High            | Low          | High     | API endpoints with bursts      |

---

## API Reference

### `createRateLimiter(options)`

Returns an Express middleware function `async (req, res, next)`.

### `MemoryStore`

In-memory store with TTL-based expiration. Suitable for single-instance deployments.

```js
const { MemoryStore } = require('api-rate-limiter');
const store = new MemoryStore();
```

Methods: `get(key)`, `set(key, value, ttl)`, `increment(key, ttl)`, `reset(key)`, `destroy()`

### `RedisStore`

Redis-backed store for distributed deployments. Requires an `ioredis` client.

```js
const Redis = require('ioredis');
const { RedisStore } = require('api-rate-limiter');
const store = new RedisStore(new Redis());
```

Methods: `get(key)`, `set(key, value, ttl)`, `increment(key, ttl)`, `reset(key)`, `getJSON(key)`

---

## Docker

Run the example with Redis using Docker Compose:

```bash
docker-compose up
```

This starts the Express app on port 3001 and Redis on 6379.

---

## Running Tests

```bash
npm test
```

Tests use Jest + Supertest. Coverage report is generated in `./coverage/`.

---

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feat/my-feature`
3. Write tests for your changes
4. Ensure all tests pass: `npm test`
5. Commit your changes: `git commit -m 'feat: add my feature'`
6. Push to the branch: `git push origin feat/my-feature`
7. Open a pull request

Please follow the existing code style and ensure coverage thresholds are maintained.

---

## License

MIT
