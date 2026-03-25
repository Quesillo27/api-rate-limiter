'use strict';

const RedisStore = require('../stores/redisStore');

/**
 * Sliding Window Log strategy.
 * Stores timestamps of each request and removes entries older than windowMs.
 * Provides more accurate rate limiting than fixed window but uses more memory.
 *
 * For MemoryStore: keeps an array of timestamps per key.
 * For RedisStore: uses a sorted set (ZADD/ZREMRANGEBYSCORE/ZCARD).
 */
async function slidingWindow(store, key, options) {
  const { max, windowMs } = options;
  const now = Date.now();
  const windowStart = now - windowMs;
  const ttl = Math.ceil(windowMs / 1000);

  if (store instanceof RedisStore) {
    return await _slidingWindowRedis(store, key, options, now, windowStart, ttl, max);
  }

  return await _slidingWindowMemory(store, key, options, now, windowStart, ttl, max);
}

async function _slidingWindowRedis(store, key, options, now, windowStart, ttl, max) {
  const client = store.client;
  const pipeline = client.pipeline();

  // Remove entries outside the window
  pipeline.zremrangebyscore(key, '-inf', windowStart);
  // Add current request with score = timestamp
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  // Count entries in window
  pipeline.zcard(key);
  // Refresh TTL
  pipeline.expire(key, ttl);

  const results = await pipeline.exec();
  if (results[2][0]) throw results[2][0];

  const count = results[2][1];
  const remaining = Math.max(0, max - count);
  const reset = now + options.windowMs;

  return {
    count,
    remaining,
    reset,
    allowed: count <= max,
  };
}

async function _slidingWindowMemory(store, key, options, now, windowStart, ttl, max) {
  // Retrieve timestamps array from store
  let timestamps = await store.get(key);

  if (!Array.isArray(timestamps)) {
    timestamps = [];
  }

  // Remove old timestamps outside window
  timestamps = timestamps.filter((ts) => ts > windowStart);

  // Add current timestamp
  timestamps.push(now);

  // Persist back to store
  await store.set(key, timestamps, ttl);

  const count = timestamps.length;
  const remaining = Math.max(0, max - count);
  const reset = now + options.windowMs;

  return {
    count,
    remaining,
    reset,
    allowed: count <= max,
  };
}

module.exports = slidingWindow;
