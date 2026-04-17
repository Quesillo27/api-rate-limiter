'use strict';

const fixedWindow = require('../src/strategies/fixedWindow');
const slidingWindow = require('../src/strategies/slidingWindow');
const tokenBucket = require('../src/strategies/tokenBucket');
const MemoryStore = require('../src/stores/memoryStore');

describe('strategies (direct)', () => {
  describe('fixedWindow', () => {
    it('allows until max, blocks afterwards', async () => {
      const store = new MemoryStore();
      const options = { max: 3, windowMs: 60000 };
      const r1 = await fixedWindow(store, 'k', options);
      const r2 = await fixedWindow(store, 'k', options);
      const r3 = await fixedWindow(store, 'k', options);
      const r4 = await fixedWindow(store, 'k', options);
      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
      expect(r4.allowed).toBe(false);
    });

    it('computes remaining correctly', async () => {
      const store = new MemoryStore();
      const r = await fixedWindow(store, 'k', { max: 5, windowMs: 60000 });
      expect(r.remaining).toBe(4);
    });

    it('decrement subtracts from counter', async () => {
      const store = new MemoryStore();
      const options = { max: 5, windowMs: 60000 };
      await fixedWindow(store, 'k', options);
      await fixedWindow(store, 'k', options);
      await fixedWindow.decrement(store, 'k', options);
      expect(await store.get('k')).toBe(1);
    });
  });

  describe('slidingWindow', () => {
    it('allows until max, blocks afterwards', async () => {
      const store = new MemoryStore();
      const options = { max: 2, windowMs: 60000 };
      const r1 = await slidingWindow(store, 'k', options);
      const r2 = await slidingWindow(store, 'k', options);
      const r3 = await slidingWindow(store, 'k', options);
      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(false);
    });

    it('cleans up timestamps outside window', async () => {
      const store = new MemoryStore();
      const options = { max: 2, windowMs: 50 };
      await slidingWindow(store, 'k', options);
      await slidingWindow(store, 'k', options);
      await new Promise((r) => setTimeout(r, 80));
      const r3 = await slidingWindow(store, 'k', options);
      expect(r3.allowed).toBe(true);
    });

    it('decrement removes most recent timestamp', async () => {
      const store = new MemoryStore();
      const options = { max: 5, windowMs: 60000 };
      await slidingWindow(store, 'k', options);
      await slidingWindow(store, 'k', options);
      await slidingWindow.decrement(store, 'k', options);
      const timestamps = await store.get('k');
      expect(timestamps.length).toBe(1);
    });
  });

  describe('tokenBucket', () => {
    it('allows up to capacity immediately', async () => {
      const store = new MemoryStore();
      const options = { max: 3, windowMs: 60000 };
      const r1 = await tokenBucket(store, 'k', options);
      const r2 = await tokenBucket(store, 'k', options);
      const r3 = await tokenBucket(store, 'k', options);
      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
    });

    it('denies after tokens exhausted', async () => {
      const store = new MemoryStore();
      const options = { max: 2, windowMs: 60000 };
      await tokenBucket(store, 'k', options);
      await tokenBucket(store, 'k', options);
      const denied = await tokenBucket(store, 'k', options);
      expect(denied.allowed).toBe(false);
    });

    it('refills tokens over time', async () => {
      const store = new MemoryStore();
      const options = { max: 2, windowMs: 100 };
      await tokenBucket(store, 'k', options);
      await tokenBucket(store, 'k', options);
      const r3 = await tokenBucket(store, 'k', options);
      expect(r3.allowed).toBe(false);
      await new Promise((r) => setTimeout(r, 120));
      const r4 = await tokenBucket(store, 'k', options);
      expect(r4.allowed).toBe(true);
    });

    it('decrement is a no-op', async () => {
      const store = new MemoryStore();
      await expect(tokenBucket.decrement()).resolves.toBeUndefined();
    });

    it('ignores corrupt bucket values', async () => {
      const store = new MemoryStore();
      await store.set('k', 'not-a-bucket', 60);
      const r = await tokenBucket(store, 'k', { max: 3, windowMs: 60000 });
      expect(r.allowed).toBe(true);
    });
  });
});
