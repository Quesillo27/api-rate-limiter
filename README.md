# api-rate-limiter

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![npm version](https://img.shields.io/badge/npm-1.1.0-blue)
![tests](https://img.shields.io/badge/tests-134%20passing-brightgreen)
![coverage](https://img.shields.io/badge/coverage-84%25-brightgreen)

Express middleware for API rate limiting with Redis support. Implements three battle-tested strategies — **fixed window**, **sliding window**, and **token bucket** — with modular stores, ready-to-use presets, IETF draft-7 standard headers, structured logging, and fail-open / fail-closed behavior. Works out of the box with an in-memory store and scales to Redis for distributed deployments.

---

## Features

- **Three strategies:** Fixed Window, Sliding Window (log), Token Bucket
- **Two stores:** `MemoryStore` (zero dependencies) and `RedisStore` (via `ioredis`)
- **Standard headers:** legacy `X-RateLimit-*` and IETF draft-7 `RateLimit-*` (or both)
- **Presets:** `auth`, `api`, `burst`, `strict`, `public` — production-ready configs in one line
- **Request context:** limit state injected into `req.rateLimit` for downstream handlers
- **Structured logger:** leveled (`silent`/`error`/`warn`/`info`/`debug`) with pluggable output
- **Custom handler:** override the 429 response shape entirely
- **Fail-open / fail-closed:** pick behavior when the store is unreachable
- **Strict option validation:** typed `ConfigurationError` thrown at middleware creation
- **Skip rules:** async `skip(req)` + `skipSuccessfulRequests` / `skipFailedRequests`
- **Namespacing:** `keyPrefix` isolates counters across features
- **Zero-leak lifecycle:** `MemoryStore.destroy()` clears intervals, `RedisStore.resetAll()` scans & deletes
- **134 tests** (Jest + Supertest) across 9 suites, 84% line coverage

---

## Installation

```bash
npm install api-rate-limiter
```

`express` is a peer dependency:

```bash
npm install express
```

Redis support (optional):

```bash
npm install ioredis
```

---

## Quick Start

```js
const express = require('express');
const { createRateLimiter } = require('api-rate-limiter');

const app = express();

app.use(createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
}));

app.get('/', (req, res) => res.json({ message: 'Hello!' }));
app.listen(3000);
```

### With a preset

```js
const { createRateLimiter, presets } = require('api-rate-limiter');

const authLimiter = createRateLimiter(presets.auth());
app.post('/login', authLimiter, loginHandler);
```

---

## Architecture

```
src/
├── index.js              # Public exports
├── rateLimiter.js        # Middleware factory
├── errors.js             # RateLimiterError, ConfigurationError, StoreError, StrategyError
├── presets.js            # auth, api, burst, strict, public
├── config/
│   └── defaults.js       # Constants + enums
├── stores/
│   ├── memoryStore.js    # In-memory, TTL cleanup, decrement
│   └── redisStore.js     # ioredis, pipeline, SCAN-based resetAll
├── strategies/
│   ├── fixedWindow.js
│   ├── slidingWindow.js  # memory: timestamp array / redis: ZSET
│   └── tokenBucket.js    # memory/redis parity
└── utils/
    ├── headers.js        # legacy + draft-7 IETF headers
    ├── logger.js         # structured, leveled logger
    └── validators.js     # option validation
```

---

## Options

| Option                   | Type                           | Default                                    | Description                                                   |
|--------------------------|--------------------------------|--------------------------------------------|---------------------------------------------------------------|
| `windowMs`               | `number`                       | `60000`                                    | Time window in milliseconds                                   |
| `max`                    | `number`                       | `100`                                      | Maximum requests allowed per window                           |
| `keyGenerator`           | `(req) => string`              | `req.ip → remoteAddress → 'unknown'`       | Unique key per client                                         |
| `strategy`               | `string`                       | `'fixedWindow'`                            | `fixedWindow` \| `slidingWindow` \| `tokenBucket`             |
| `store`                  | `object`                       | `new MemoryStore()`                        | Any store with `get/set/increment/reset` methods              |
| `message`                | `string`                       | `'Too many requests...'`                   | Response body message when limited                            |
| `statusCode`             | `number`                       | `429`                                      | HTTP status when limited                                      |
| `standardHeaders`        | `bool \| 'legacy' \| 'draft-7' \| 'both' \| 'none'` | `true` | Header mode                                |
| `headers`                | `boolean`                      | `true`                                     | Legacy alias for `standardHeaders: false` (kept for compat)   |
| `skipSuccessfulRequests` | `boolean`                      | `false`                                    | Do not count 2xx/3xx responses                                |
| `skipFailedRequests`     | `boolean`                      | `false`                                    | Do not count 4xx/5xx responses                                |
| `skip`                   | `async (req, res) => bool`     | `null`                                     | Skip limiting when returns true                               |
| `onLimitReached`         | `(req, res, opts, result)`     | `null`                                     | Fired when limit is crossed (logging/alerting)                |
| `handler`                | `(req, res, opts, result)`     | JSON 429 response                          | Fully override the limited response                           |
| `keyPrefix`              | `string`                       | `'rl:'`                                    | Namespace for store keys                                      |
| `requestPropertyName`    | `string`                       | `'rateLimit'`                              | Field name where limit state is attached to `req`             |
| `failMode`               | `'open' \| 'closed'`           | `'open'`                                   | Behavior when store throws: let request pass or return 503    |
| `logger`                 | `object \| options`            | silent                                     | Pass a logger-like object or logger options                   |

---

## Response Headers

When `standardHeaders: true` (default), sends **legacy** `X-RateLimit-*` headers:

| Header                  | Meaning                                |
|-------------------------|----------------------------------------|
| `X-RateLimit-Limit`     | Max requests per window                |
| `X-RateLimit-Remaining` | Remaining in this window               |
| `X-RateLimit-Reset`     | Unix seconds when window resets        |
| `Retry-After`           | Seconds to wait (429 only)             |

When `standardHeaders: 'draft-7'`, sends IETF draft-7 `RateLimit-*`:

| Header               | Example                                    |
|----------------------|--------------------------------------------|
| `RateLimit-Limit`    | `100`                                      |
| `RateLimit-Remaining`| `42`                                       |
| `RateLimit-Reset`    | `37` (seconds until reset)                 |
| `RateLimit-Policy`   | `100;w=60;policy="fixedWindow"`            |

Use `'both'` to send both families, `'none'` to suppress all.

---

## Strategies

### Fixed Window (`fixedWindow`)

Divides time into discrete windows. Simple and cheap. Vulnerable to boundary bursts.

### Sliding Window (`slidingWindow`)

Tracks individual request timestamps; removes those older than `windowMs`. More accurate; higher memory usage. Uses Redis ZSETs for distributed accuracy.

### Token Bucket (`tokenBucket`)

Refills `max` tokens over `windowMs`. Allows short bursts up to bucket capacity. Ideal for APIs with occasional spikes.

| Strategy        | Burst tolerance | Memory | Accuracy | Best for                         |
|-----------------|-----------------|--------|----------|----------------------------------|
| Fixed Window    | Low             | Low    | Medium   | Simple global limits             |
| Sliding Window  | Medium          | Higher | High     | Strict per-user limits           |
| Token Bucket    | High            | Low    | High     | API endpoints with bursts        |

---

## Presets

Drop-in configurations — all accept overrides:

```js
const { presets } = require('api-rate-limiter');

presets.auth()    // 5 req / 15 min, skipSuccessful, keyPrefix rl:auth:
presets.api()     // 100 req / min, slidingWindow, rl:api:
presets.burst()   // 10 req / 1 s, tokenBucket, rl:burst:
presets.strict()  // 3 req / 1 h, fixedWindow, rl:strict:
presets.public()  // 1000 req / min, rl:public:

presets.auth({ max: 10, message: 'Slow down please.' });
```

---

## Examples

### Auth route protection

```js
const authLimiter = createRateLimiter(presets.auth({
  message: 'Too many login attempts. Please wait 15 minutes.',
}));
app.post('/login', authLimiter, loginHandler);
app.post('/register', authLimiter, registerHandler);
```

### Redis for distributed deployments

```js
const Redis = require('ioredis');
const { createRateLimiter, RedisStore } = require('api-rate-limiter');

const redis = new Redis({ host: process.env.REDIS_HOST, port: 6379 });
const store = new RedisStore(redis, { keyPrefix: 'myapp:' });

app.use(createRateLimiter({ windowMs: 60000, max: 100, store }));
```

### Per-user limits

```js
createRateLimiter({
  windowMs: 60000,
  max: 1000,
  keyGenerator: (req) => req.user?.id || req.ip,
  keyPrefix: 'rl:user:',
});
```

### IETF draft-7 headers

```js
createRateLimiter({
  windowMs: 60000,
  max: 100,
  standardHeaders: 'draft-7',
});
```

### Custom 429 handler

```js
createRateLimiter({
  windowMs: 60000,
  max: 10,
  handler: (req, res, opts, result) => {
    res.status(429).render('rate-limit', {
      retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
    });
  },
});
```

### Fail closed (deny on store outage)

```js
createRateLimiter({
  windowMs: 60000,
  max: 100,
  store: new RedisStore(redis),
  failMode: 'closed',
});
```

### Structured logger

```js
createRateLimiter({
  windowMs: 60000,
  max: 100,
  logger: { level: 'info' },
});
// or pass any logger-like { error, warn, info, debug }
createRateLimiter({ ..., logger: myPinoLogger });
```

### Consume req.rateLimit in handlers

```js
app.get('/api/data', limiter, (req, res) => {
  res.json({
    data: getData(),
    meta: {
      remaining: req.rateLimit.remaining,
      resetAt: req.rateLimit.resetTime,
    },
  });
});
```

---

## API Reference

### `createRateLimiter(options)`

Returns an Express middleware. Throws `ConfigurationError` on invalid options.

### `MemoryStore`

```js
new MemoryStore({ cleanupIntervalMs = 60000, autoCleanup = true });
```

Methods: `get`, `set`, `increment`, `decrement`, `reset`, `resetAll`, `size`, `destroy`.

### `RedisStore`

```js
new RedisStore(redisClient, { keyPrefix = '' });
```

Methods: `get`, `set`, `increment`, `decrement`, `reset`, `resetAll`, `getJSON`.

### `presets`

`auth() | api() | burst() | strict() | public()` — all accept an override object.

### `createLogger(options)`

```js
createLogger({ level: 'warn', output: console, silent: false, formatter: null });
```

### Error classes

`RateLimiterError`, `ConfigurationError`, `StoreError`, `StrategyError` — all subclass `Error`.

---

## Docker

```bash
docker-compose up
```

Starts the Express example app on port 3001 and Redis on 6379.

---

## Running Tests

```bash
npm test
```

Jest + Supertest. Runs **134 tests** across 9 suites in <6s. Coverage report under `./coverage/`.

```bash
npm run test:watch    # watch mode
```

---

## Roadmap

Planned for future releases:

- **Memcached store** for shops that already run Memcached
- **GCRA (leaky-bucket) strategy** — higher precision with constant memory per key
- **Multi-tier limits** — compose short-burst + long-window on a single middleware (e.g. 10/s AND 100/min)
- **Prometheus metrics exporter** — `/metrics` endpoint with counters and histograms
- **Distributed sliding window with Lua** — atomic ZSET updates via EVAL for lower latency
- **TypeScript types** — shipped `.d.ts` declarations

---

## Contributing

1. Fork → `git checkout -b feat/my-feature`
2. Write tests for your change
3. `npm test` (all 134 must stay green, coverage ≥ 80%)
4. Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
5. Open a PR

---

## License

MIT
