'use strict';

const RedisStore = require('../stores/redisStore');

async function tokenBucket(store, key, options) {
  const { max, windowMs } = options;
  const refillRate = max / windowMs;
  const ttl = Math.ceil(windowMs / 1000) * 2;
  const now = Date.now();

  if (store instanceof RedisStore) {
    return _tokenBucketRedis(store, key, now, max, refillRate, ttl);
  }

  return _tokenBucketMemory(store, key, now, max, refillRate, ttl);
}

async function _tokenBucketMemory(store, key, now, max, refillRate, ttl) {
  let bucket = await store.get(key);

  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
    bucket = { tokens: max, lastRefill: now };
  }

  const elapsed = Math.max(0, now - bucket.lastRefill);
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
    count: Math.max(0, max - Math.floor(bucket.tokens) - (allowed ? 0 : 1)),
    remaining,
    reset,
    allowed,
  };
}

async function _tokenBucketRedis(store, key, now, max, refillRate, ttl) {
  const bucketKey = `${key}:bucket`;
  let bucket = await store.getJSON(bucketKey);

  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
    bucket = { tokens: max, lastRefill: now };
  }

  const elapsed = Math.max(0, now - bucket.lastRefill);
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
    count: Math.max(0, max - Math.floor(bucket.tokens) - (allowed ? 0 : 1)),
    remaining,
    reset,
    allowed,
  };
}

module.exports = tokenBucket;
module.exports.decrement = async function tokenBucketDecrement() {
  // Token bucket: refills automatically, no-op decrement.
};
