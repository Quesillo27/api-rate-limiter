'use strict';

const MemoryStore = require('./stores/memoryStore');
const fixedWindow = require('./strategies/fixedWindow');
const slidingWindow = require('./strategies/slidingWindow');
const tokenBucket = require('./strategies/tokenBucket');
const { validateOptions } = require('./utils/validators');
const { createLogger, isLoggerLike } = require('./utils/logger');
const { setRateLimitHeaders, setRetryAfter, computeRetryAfterSeconds } = require('./utils/headers');
const { StoreError } = require('./errors');
const {
  DEFAULT_WINDOW_MS,
  DEFAULT_MAX,
  DEFAULT_STATUS_CODE,
  DEFAULT_MESSAGE,
  DEFAULT_KEY_PREFIX,
  DEFAULT_REQUEST_PROPERTY,
  DEFAULT_STRATEGY,
  DEFAULT_FAIL_MODE,
} = require('./config/defaults');

const STRATEGIES = {
  fixedWindow,
  slidingWindow,
  tokenBucket,
};

function defaultKeyGenerator(req) {
  return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}

function defaultHandler(req, res, options, result) {
  const retryAfter = computeRetryAfterSeconds(result);
  res.status(options.statusCode).json({
    error: options.message,
    retryAfter,
    limit: options.max,
    remaining: Math.max(0, result.remaining),
  });
}

function resolveLogger(logger) {
  if (!logger) return createLogger({ silent: true });
  if (isLoggerLike(logger)) return logger;
  if (typeof logger === 'object') return createLogger(logger);
  return createLogger({ silent: true });
}

function normalizeOptions(options = {}) {
  const store = options.store || new MemoryStore();
  const normalized = {
    windowMs: options.windowMs ?? DEFAULT_WINDOW_MS,
    max: options.max ?? DEFAULT_MAX,
    keyGenerator: options.keyGenerator ?? defaultKeyGenerator,
    strategy: options.strategy ?? DEFAULT_STRATEGY,
    store,
    message: options.message ?? DEFAULT_MESSAGE,
    statusCode: options.statusCode ?? DEFAULT_STATUS_CODE,
    standardHeaders: options.standardHeaders ?? (options.headers === false ? false : true),
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    skipFailedRequests: options.skipFailedRequests ?? false,
    skip: options.skip ?? null,
    onLimitReached: options.onLimitReached ?? null,
    handler: options.handler ?? null,
    keyPrefix: options.keyPrefix ?? DEFAULT_KEY_PREFIX,
    requestPropertyName: options.requestPropertyName ?? DEFAULT_REQUEST_PROPERTY,
    failMode: options.failMode ?? DEFAULT_FAIL_MODE,
  };

  if (options.headers === false && options.standardHeaders === undefined) {
    normalized.standardHeaders = false;
  }

  return normalized;
}

function createRateLimiter(options = {}) {
  const normalized = normalizeOptions(options);
  validateOptions(normalized);

  const strategyFn = STRATEGIES[normalized.strategy];
  const strategyOptions = { max: normalized.max, windowMs: normalized.windowMs };
  const logger = resolveLogger(options.logger);

  return async function rateLimiterMiddleware(req, res, next) {
    let key;
    try {
      if (typeof normalized.skip === 'function') {
        const shouldSkip = await normalized.skip(req, res);
        if (shouldSkip) return next();
      }

      const rawKey = normalized.keyGenerator(req);
      if (rawKey === undefined || rawKey === null || rawKey === '') {
        logger.warn('keyGenerator returned empty value; falling back to "unknown"');
      }
      key = `${normalized.keyPrefix}${rawKey || 'unknown'}`;

      let result;
      try {
        result = await strategyFn(normalized.store, key, strategyOptions);
      } catch (storeErr) {
        const wrapped = storeErr instanceof StoreError
          ? storeErr
          : new StoreError(`Strategy execution failed: ${storeErr.message}`, storeErr);
        logger.error('Rate limiter store error', { error: wrapped.message, code: wrapped.code });
        if (normalized.failMode === 'closed') {
          return res.status(503).json({ error: 'Rate limiter unavailable' });
        }
        return next();
      }

      req[normalized.requestPropertyName] = {
        limit: normalized.max,
        current: result.count,
        remaining: Math.max(0, result.remaining),
        resetTime: new Date(result.reset),
        strategy: normalized.strategy,
      };

      setRateLimitHeaders(res, result, normalized);

      if (!result.allowed) {
        setRetryAfter(res, result);

        if (typeof normalized.onLimitReached === 'function') {
          try {
            normalized.onLimitReached(req, res, normalized, result);
          } catch (cbErr) {
            logger.error('onLimitReached callback threw', { error: cbErr.message });
          }
        }

        const handlerFn = typeof normalized.handler === 'function'
          ? normalized.handler
          : defaultHandler;
        return handlerFn(req, res, normalized, result);
      }

      if (normalized.skipSuccessfulRequests || normalized.skipFailedRequests) {
        _attachFinishHook(res, normalized, key, strategyFn, logger);
      }

      next();
    } catch (err) {
      logger.error('Rate limiter middleware error', { error: err.message });
      next(err);
    }
  };
}

function _attachFinishHook(res, normalized, key, strategyFn, logger) {
  res.on('finish', async () => {
    try {
      const isSuccess = res.statusCode < 400;
      const isFailed = res.statusCode >= 400;
      const shouldDecrement =
        (normalized.skipSuccessfulRequests && isSuccess) ||
        (normalized.skipFailedRequests && isFailed);

      if (!shouldDecrement) return;

      const decrementFn = typeof strategyFn.decrement === 'function' ? strategyFn.decrement : null;
      if (!decrementFn) return;
      await decrementFn(normalized.store, key, {
        windowMs: normalized.windowMs,
        max: normalized.max,
      });
    } catch (err) {
      logger.warn('Decrement on skip-after-response failed', { error: err.message });
    }
  });
}

module.exports = { createRateLimiter, STRATEGIES };
