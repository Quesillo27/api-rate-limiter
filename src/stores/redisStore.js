'use strict';

class RedisStore {
  constructor(redisClient) {
    if (!redisClient) {
      throw new Error('RedisStore requires a Redis client instance.');
    }
    this.client = redisClient;
  }

  async increment(key, ttl) {
    const pipeline = this.client.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, ttl);
    const results = await pipeline.exec();
    // results[0] = [error, value] for INCR
    if (results[0][0]) throw results[0][0];
    return results[0][1];
  }

  async reset(key) {
    await this.client.del(key);
  }

  async get(key) {
    const val = await this.client.get(key);
    return parseInt(val, 10) || 0;
  }

  async set(key, value, ttl) {
    await this.client.set(key, JSON.stringify(value), 'EX', ttl);
  }

  async getJSON(key) {
    const val = await this.client.get(key);
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
}

module.exports = RedisStore;
