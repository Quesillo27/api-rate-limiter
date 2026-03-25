'use strict';

const MemoryStore = require('./stores/memoryStore');
const fixedWindow = require('./strategies/fixedWindow');
const slidingWindow = require('./strategies/slidingWindow');
const tokenBucket = require('./strategies/tokenBucket');

const STRATEGIES = {
  fixedWindow,
  slidingWindow,
  tokenBucket,
};

/**
 * Creates an Express rate limiter middleware.
 *
 * @param {object} options
 * @param {number}   options.windowMs               - Time window in milliseconds (default: 60000)
 * @param {number}   options.max                    - Max requests per window (default: 100)
 * @param {function} options.keyGenerator           - Function(req) => string key (default: req.ip)
 * @param {string}   options.strategy               - 'fixedWindow' | 'slidingWindow' | 'tokenBucket' (default: 'fixedWindow')
 * @param {object}   options.store                  - Store instance (default: new MemoryStore())
 * @param {string}   options.message                - Response message when limited (default: 'Too many requests...')
 * @param {number}   options.statusCode             - HTTP status code when limited (default: 429)
 * @param {boolean}  options.headers                - Send X-RateLimit-* headers (default: true)
 * @param {boolean}  options.skipSuccessfulRequests - Don't count successful (2xx/3xx) requests (default: false)
 * @param {boolean}  options.skipFailedRequests     - Don't count failed (4xx/5xx) requests (default: false)
 * @param {function} options.skip                   - Async function(req) => boolean, skip limiting if true
 * @param {function} options.onLimitReached         - Callback(req, res, options) when limit is hit
 * @param {string}   options.keyPrefix              - Prefix for store keys (default: 'rl:')
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 60 * 1000,
    max = 100,
    keyGenerator = (req) => req.ip,
    strategy = 'fixedWindow',
    store = new MemoryStore(),
    message = 'Too many requests, please try again later.',
    statusCode = 429,
    headers = true,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    skip = null,
    onLimitReached = null,
    keyPrefix = 'rl:',
  } = options;

  const strategyFn = STRATEGIES[strategy];
  if (!strategyFn) {
    throw new Error(
      `Unknown strategy "${strategy}". Valid strategies: ${Object.keys(STRATEGIES).join(', ')}`
    );
  }

  const strategyOptions = { max, windowMs };

  return async function rateLimiterMiddleware(req, res, next) {
    try {
      // 1. Check skip function
      if (typeof skip === 'function') {
        const shouldSkip = await skip(req, res);
        if (shouldSkip) return next();
      }

      // 2. Generate key
      const rawKey = keyGenerator(req);
      const key = `${keyPrefix}${rawKey}`;

      // 3. Apply strategy
      const result = await strategyFn(store, key, strategyOptions);

      // 4. Set headers if enabled
      if (headers) {
        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.reset / 1000));
      }

      // 5. Handle limit reached
      if (!result.allowed) {
        if (headers) {
          const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
          res.setHeader('Retry-After', Math.max(0, retryAfter));
        }

        if (typeof onLimitReached === 'function') {
          onLimitReached(req, res, options);
        }

        return res.status(statusCode).json({
          error: message,
          retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
        });
      }

      // 6. Handle skipSuccessfulRequests / skipFailedRequests
      // We hook into res.on('finish') to potentially decrement if needed.
      // Since our strategies already incremented, we undo on finish if skip conditions met.
      if (skipSuccessfulRequests || skipFailedRequests) {
        res.on('finish', async () => {
          try {
            const isSuccess = res.statusCode < 400;
            const isFailed = res.statusCode >= 400;

            if ((skipSuccessfulRequests && isSuccess) || (skipFailedRequests && isFailed)) {
              // Decrement: for fixedWindow we reset isn't ideal, but best-effort decrement
              // We use a dedicated decrement approach by reading, subtracting, and setting
              await _decrementKey(store, key, strategyOptions, strategy);
            }
          } catch (_err) {
            // Non-critical: swallow errors in finish hook
          }
        });
      }

      // 7. Allow request
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Best-effort decrement for skipSuccessful/skipFailed requests.
 * Only applicable to fixedWindow and slidingWindow in memory mode.
 */
async function _decrementKey(store, key, strategyOptions, strategy) {
  if (strategy === 'tokenBucket') return; // Token bucket: refill is time-based, no decrement needed

  if (strategy === 'fixedWindow') {
    const entry = store.store && store.store.get(key);
    if (entry && entry.value > 0) {
      entry.value = Math.max(0, entry.value - 1);
    }
    return;
  }

  if (strategy === 'slidingWindow') {
    // Remove the most recent timestamp we added
    const timestamps = await store.get(key);
    if (Array.isArray(timestamps) && timestamps.length > 0) {
      timestamps.pop();
      const ttl = Math.ceil(strategyOptions.windowMs / 1000);
      await store.set(key, timestamps, ttl);
    }
  }
}

module.exports = { createRateLimiter };
