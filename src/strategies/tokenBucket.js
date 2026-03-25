'use strict';

const RedisStore = require('../stores/redisStore');

/**
 * Token Bucket strategy.
 * Tokens are added at a constant refill rate up to a maximum capacity.
 * Each request consumes one token. If no tokens are available, the request is denied.
 *
 * Options:
 *   max      - bucket capacity (max tokens)
 *   windowMs - refill window: refills `max` tokens over this period
 *              e.g. max=10, windowMs=1000 => refill rate of 10 tokens/second
 */
async function tokenBucket(store, key, options) {
  const { max, windowMs } = options;
  // Tokens refilled per millisecond
  const refillRate = max / windowMs;
  const ttl = Math.ceil(windowMs / 1000) * 2;
  const now = Date.now();

  if (store instanceof RedisStore) {
    return await _tokenBucketRedis(store, key, now, max, refillRate, ttl);
  }

  return await _tokenBucketMemory(store, key, now, max, refillRate, ttl);
}

async function _tokenBucketMemory(store, key, now, max, refillRate, ttl) {
  let bucket = await store.get(key);

  if (!bucket) {
    bucket = { tokens: max, lastRefill: now };
  }

  // Calculate tokens to add since last refill
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = elapsed * refillRate;
  bucket.tokens = Math.min(max, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;

  const allowed = bucket.tokens >= 1;

  if (allowed) {
    bucket.tokens -= 1;
  }

  await store.set(key, bucket, ttl);

  const remaining = Math.floor(bucket.tokens);
  const msUntilNextToken = allowed ? 0 : Math.ceil((1 - bucket.tokens) / refillRate);
  const reset = now + msUntilNextToken;

  return {
    count: max - Math.floor(bucket.tokens) - (allowed ? 0 : 1),
    remaining,
    reset,
    allowed,
  };
}

async function _tokenBucketRedis(store, key, now, max, refillRate, ttl) {
  const bucketKey = `${key}:bucket`;
  let bucket = await store.getJSON(bucketKey);

  if (!bucket) {
    bucket = { tokens: max, lastRefill: now };
  }

  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = elapsed * refillRate;
  bucket.tokens = Math.min(max, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;

  const allowed = bucket.tokens >= 1;

  if (allowed) {
    bucket.tokens -= 1;
  }

  await store.set(bucketKey, bucket, ttl);

  const remaining = Math.floor(bucket.tokens);
  const msUntilNextToken = allowed ? 0 : Math.ceil((1 - bucket.tokens) / refillRate);
  const reset = now + msUntilNextToken;

  return {
    count: max - Math.floor(bucket.tokens) - (allowed ? 0 : 1),
    remaining,
    reset,
    allowed,
  };
}

module.exports = tokenBucket;
