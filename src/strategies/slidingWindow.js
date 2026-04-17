'use strict';

const RedisStore = require('../stores/redisStore');

async function slidingWindow(store, key, options) {
  const { max, windowMs } = options;
  const now = Date.now();
  const windowStart = now - windowMs;
  const ttl = Math.ceil(windowMs / 1000);

  if (store instanceof RedisStore) {
    return _slidingWindowRedis(store, key, options, now, windowStart, ttl, max);
  }

  return _slidingWindowMemory(store, key, options, now, windowStart, ttl, max);
}

async function _slidingWindowRedis(store, key, options, now, windowStart, ttl, max) {
  const client = store.client;
  const redisKey = store._k(key);
  const pipeline = client.pipeline();

  pipeline.zremrangebyscore(redisKey, '-inf', windowStart);
  pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
  pipeline.zcard(redisKey);
  pipeline.expire(redisKey, ttl);

  const results = await pipeline.exec();
  if (!results || !results[2]) {
    throw new Error('Redis pipeline returned no results.');
  }
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
  let timestamps = await store.get(key);

  if (!Array.isArray(timestamps)) {
    timestamps = [];
  }

  timestamps = timestamps.filter((ts) => ts > windowStart);
  timestamps.push(now);

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

async function slidingWindowDecrement(store, key, options) {
  const { windowMs } = options;
  const now = Date.now();
  const windowStart = now - windowMs;
  const ttl = Math.ceil(windowMs / 1000);

  if (store instanceof RedisStore) {
    const client = store.client;
    const redisKey = store._k(key);
    const members = await client.zrange(redisKey, -1, -1);
    if (members && members.length > 0) {
      await client.zrem(redisKey, members[0]);
    }
    return;
  }

  let timestamps = await store.get(key);
  if (Array.isArray(timestamps) && timestamps.length > 0) {
    timestamps = timestamps.filter((ts) => ts > windowStart);
    timestamps.pop();
    await store.set(key, timestamps, ttl);
  }
}

module.exports = slidingWindow;
module.exports.decrement = slidingWindowDecrement;
