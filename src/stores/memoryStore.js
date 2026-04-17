'use strict';

const { DEFAULT_CLEANUP_INTERVAL_MS } = require('../config/defaults');

class MemoryStore {
  constructor({ cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS, autoCleanup = true } = {}) {
    this.store = new Map();
    this._cleanupIntervalMs = cleanupIntervalMs;
    if (autoCleanup) {
      this._startCleanup();
    }
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttl) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  async increment(key, ttl) {
    const entry = this.store.get(key);
    const now = Date.now();

    if (!entry || now > entry.expiresAt) {
      this.store.set(key, {
        value: 1,
        expiresAt: now + ttl * 1000,
      });
      return 1;
    }

    entry.value += 1;
    return entry.value;
  }

  async decrement(key) {
    const entry = this.store.get(key);
    if (!entry) return 0;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return 0;
    }
    if (typeof entry.value === 'number' && entry.value > 0) {
      entry.value -= 1;
    }
    return entry.value;
  }

  async reset(key) {
    this.store.delete(key);
  }

  async resetAll() {
    this.store.clear();
  }

  async size() {
    this._cleanup();
    return this.store.size;
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  _startCleanup() {
    this._cleanupInterval = setInterval(() => this._cleanup(), this._cleanupIntervalMs);
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }

  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this.store.clear();
  }
}

module.exports = MemoryStore;
