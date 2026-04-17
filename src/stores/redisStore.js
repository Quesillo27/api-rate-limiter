'use strict';

const { StoreError } = require('../errors');

class RedisStore {
  constructor(redisClient, { keyPrefix = '' } = {}) {
    if (!redisClient) {
      throw new StoreError('RedisStore requires a Redis client instance.');
    }
    this.client = redisClient;
    this.keyPrefix = keyPrefix;
  }

  _k(key) {
    return this.keyPrefix ? `${this.keyPrefix}${key}` : key;
  }

  async increment(key, ttl) {
    try {
      const pipeline = this.client.pipeline();
      pipeline.incr(this._k(key));
      pipeline.expire(this._k(key), ttl);
      const results = await pipeline.exec();
      if (!results || !results[0]) {
        throw new StoreError('Redis pipeline returned no results.');
      }
      if (results[0][0]) throw new StoreError('Redis INCR failed', results[0][0]);
      return results[0][1];
    } catch (err) {
      if (err instanceof StoreError) throw err;
      throw new StoreError(`Redis increment failed: ${err.message}`, err);
    }
  }

  async decrement(key) {
    try {
      const val = await this.client.decr(this._k(key));
      if (val < 0) {
        await this.client.set(this._k(key), '0', 'KEEPTTL');
        return 0;
      }
      return val;
    } catch (err) {
      throw new StoreError(`Redis decrement failed: ${err.message}`, err);
    }
  }

  async reset(key) {
    try {
      await this.client.del(this._k(key));
    } catch (err) {
      throw new StoreError(`Redis reset failed: ${err.message}`, err);
    }
  }

  async get(key) {
    try {
      const val = await this.client.get(this._k(key));
      if (val === null || val === undefined) return null;
      const parsed = this._tryParseJSON(val);
      if (parsed !== undefined) return parsed;
      const num = Number(val);
      if (!Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(val)) return num;
      return val;
    } catch (err) {
      throw new StoreError(`Redis get failed: ${err.message}`, err);
    }
  }

  async set(key, value, ttl) {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await this.client.set(this._k(key), serialized, 'EX', ttl);
    } catch (err) {
      throw new StoreError(`Redis set failed: ${err.message}`, err);
    }
  }

  async getJSON(key) {
    try {
      const val = await this.client.get(this._k(key));
      if (!val) return null;
      return this._tryParseJSON(val) ?? null;
    } catch (err) {
      throw new StoreError(`Redis getJSON failed: ${err.message}`, err);
    }
  }

  async resetAll() {
    if (!this.keyPrefix) return;
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          `${this.keyPrefix}*`,
          'COUNT',
          100
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      throw new StoreError(`Redis resetAll failed: ${err.message}`, err);
    }
  }

  _tryParseJSON(value) {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[' && trimmed[0] !== '"')) {
      return undefined;
    }
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
}

module.exports = RedisStore;
