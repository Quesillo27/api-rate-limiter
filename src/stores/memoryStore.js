'use strict';

class MemoryStore {
  constructor() {
    this.store = new Map();
    this._startCleanup();
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

  async reset(key) {
    this.store.delete(key);
  }

  _startCleanup() {
    this._cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.expiresAt) {
          this.store.delete(key);
        }
      }
    }, 60000);

    // Allow the process to exit even if interval is active
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }

  destroy() {
    clearInterval(this._cleanupInterval);
    this.store.clear();
  }
}

module.exports = MemoryStore;
