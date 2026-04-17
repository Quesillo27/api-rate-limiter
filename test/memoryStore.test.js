'use strict';

const MemoryStore = require('../src/stores/memoryStore');

describe('MemoryStore', () => {
  it('increments counter correctly', async () => {
    const store = new MemoryStore();
    expect(await store.increment('k', 60)).toBe(1);
    expect(await store.increment('k', 60)).toBe(2);
    expect(await store.increment('k', 60)).toBe(3);
  });

  it('resets counter', async () => {
    const store = new MemoryStore();
    await store.increment('k', 60);
    await store.reset('k');
    expect(await store.increment('k', 60)).toBe(1);
  });

  it('get returns value after set', async () => {
    const store = new MemoryStore();
    await store.set('k', 'value', 60);
    expect(await store.get('k')).toBe('value');
  });

  it('get returns null for non-existent key', async () => {
    const store = new MemoryStore();
    expect(await store.get('missing')).toBeNull();
  });

  it('treats expired entries as null', async () => {
    const store = new MemoryStore();
    store.store.set('exp', { value: 1, expiresAt: Date.now() - 1 });
    expect(await store.get('exp')).toBeNull();
  });

  it('increment resets value after expiration', async () => {
    const store = new MemoryStore();
    store.store.set('exp', { value: 9, expiresAt: Date.now() - 1 });
    expect(await store.increment('exp', 60)).toBe(1);
  });

  it('decrement reduces counter', async () => {
    const store = new MemoryStore();
    await store.increment('k', 60);
    await store.increment('k', 60);
    await store.decrement('k');
    expect(await store.get('k')).toBe(1);
  });

  it('decrement never goes below zero', async () => {
    const store = new MemoryStore();
    await store.increment('k', 60);
    await store.decrement('k');
    await store.decrement('k');
    expect(await store.get('k')).toBe(0);
  });

  it('decrement returns 0 for missing key', async () => {
    const store = new MemoryStore();
    expect(await store.decrement('missing')).toBe(0);
  });

  it('size triggers cleanup and returns count', async () => {
    const store = new MemoryStore();
    await store.set('a', 1, 60);
    await store.set('b', 2, 60);
    store.store.set('expired', { value: 1, expiresAt: Date.now() - 1 });
    expect(await store.size()).toBe(2);
  });

  it('resetAll clears the store', async () => {
    const store = new MemoryStore();
    await store.set('a', 1, 60);
    await store.set('b', 2, 60);
    await store.resetAll();
    expect(await store.size()).toBe(0);
  });

  it('supports object values via JSON round-trip', async () => {
    const store = new MemoryStore();
    await store.set('obj', { tokens: 5, lastRefill: 123 }, 60);
    expect(await store.get('obj')).toEqual({ tokens: 5, lastRefill: 123 });
  });

  it('destroy clears interval and store', () => {
    const store = new MemoryStore();
    store.store.set('k', { value: 1, expiresAt: Date.now() + 1000 });
    store.destroy();
    expect(store.store.size).toBe(0);
    expect(store._cleanupInterval).toBeNull();
  });

  it('autoCleanup: false does not start interval', () => {
    const store = new MemoryStore({ autoCleanup: false });
    expect(store._cleanupInterval).toBeUndefined();
  });

  it('custom cleanupIntervalMs is honored', () => {
    const store = new MemoryStore({ cleanupIntervalMs: 500 });
    expect(store._cleanupIntervalMs).toBe(500);
    store.destroy();
  });
});
