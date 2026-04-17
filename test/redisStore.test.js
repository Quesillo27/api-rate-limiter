'use strict';

const RedisStore = require('../src/stores/redisStore');
const { StoreError } = require('../src/errors');

function createFakeRedis() {
  const data = new Map();

  return {
    data,
    async get(key) { return data.has(key) ? data.get(key).value : null; },
    async set(key, value, _mode, _ttl) { data.set(key, { value, ttl: _ttl }); return 'OK'; },
    async del(...keys) {
      let count = 0;
      for (const k of keys) if (data.delete(k)) count++;
      return count;
    },
    async decr(key) {
      const current = parseInt((data.get(key) && data.get(key).value) || '0', 10);
      const next = current - 1;
      data.set(key, { value: String(next), ttl: null });
      return next;
    },
    async scan(_cursor, _match, pattern, _count, _num) {
      const prefix = pattern.replace('*', '');
      const keys = [...data.keys()].filter((k) => k.startsWith(prefix));
      return ['0', keys];
    },
    pipeline() {
      const ops = [];
      const p = {
        incr(key) { ops.push(['incr', key]); return p; },
        expire(key, _ttl) { ops.push(['expire', key, _ttl]); return p; },
        async exec() {
          const results = [];
          for (const [op, key] of ops) {
            if (op === 'incr') {
              const cur = parseInt((data.get(key) && data.get(key).value) || '0', 10);
              const next = cur + 1;
              data.set(key, { value: String(next), ttl: null });
              results.push([null, next]);
            } else if (op === 'expire') {
              results.push([null, 1]);
            }
          }
          return results;
        },
      };
      return p;
    },
  };
}

describe('RedisStore (with mock client)', () => {
  it('throws when no client', () => {
    expect(() => new RedisStore()).toThrow(StoreError);
  });

  it('increment uses pipeline', async () => {
    const client = createFakeRedis();
    const store = new RedisStore(client);
    expect(await store.increment('k', 60)).toBe(1);
    expect(await store.increment('k', 60)).toBe(2);
  });

  it('reset deletes the key', async () => {
    const client = createFakeRedis();
    const store = new RedisStore(client);
    await store.increment('k', 60);
    await store.reset('k');
    expect(client.data.has('k')).toBe(false);
  });

  it('get parses numeric strings', async () => {
    const client = createFakeRedis();
    const store = new RedisStore(client);
    await client.set('k', '42');
    expect(await store.get('k')).toBe(42);
  });

  it('get returns null for missing keys', async () => {
    const client = createFakeRedis();
    const store = new RedisStore(client);
    expect(await store.get('nothing')).toBeNull();
  });

  it('set serializes objects as JSON', async () => {
    const client = createFakeRedis();
    const store = new RedisStore(client);
    await store.set('obj', { a: 1 }, 60);
    expect(client.data.get('obj').value).toBe('{"a":1}');
  });

  it('getJSON round-trips objects', async () => {
    const client = createFakeRedis();
    const store = new RedisStore(client);
    await store.set('obj', { tokens: 5, lastRefill: 123 }, 60);
    expect(await store.getJSON('obj')).toEqual({ tokens: 5, lastRefill: 123 });
  });

  it('decrement does not go below zero', async () => {
    const client = createFakeRedis();
    const store = new RedisStore(client);
    // simulate existing "0" value
    await client.set('k', '0');
    const v = await store.decrement('k');
    expect(v).toBe(0);
  });

  it('keyPrefix is applied to operations', async () => {
    const client = createFakeRedis();
    const store = new RedisStore(client, { keyPrefix: 'myns:' });
    await store.increment('k', 60);
    expect(client.data.has('myns:k')).toBe(true);
  });

  it('resetAll scans by prefix and deletes', async () => {
    const client = createFakeRedis();
    const store = new RedisStore(client, { keyPrefix: 'myns:' });
    await store.set('a', 1, 60);
    await store.set('b', 2, 60);
    await store.resetAll();
    expect(client.data.has('myns:a')).toBe(false);
    expect(client.data.has('myns:b')).toBe(false);
  });

  it('wraps redis errors as StoreError', async () => {
    const client = {
      pipeline() { throw new Error('pipeline broken'); },
      get() {}, set() {}, del() {}, decr() {}, scan() {},
    };
    const store = new RedisStore(client);
    await expect(store.increment('k', 60)).rejects.toThrow(StoreError);
  });

  it('get handles non-JSON-like strings by returning raw', async () => {
    const client = createFakeRedis();
    const store = new RedisStore(client);
    await client.set('k', 'hello-world');
    expect(await store.get('k')).toBe('hello-world');
  });
});
