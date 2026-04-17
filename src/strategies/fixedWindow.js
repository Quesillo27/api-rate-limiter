'use strict';

async function fixedWindow(store, key, options) {
  const { max, windowMs } = options;
  const ttl = Math.ceil(windowMs / 1000);
  const count = await store.increment(key, ttl);
  const remaining = Math.max(0, max - count);
  const reset = Date.now() + windowMs;

  return {
    count,
    remaining,
    reset,
    allowed: count <= max,
  };
}

async function fixedWindowDecrement(store, key) {
  if (typeof store.decrement === 'function') {
    await store.decrement(key);
  }
}

module.exports = fixedWindow;
module.exports.decrement = fixedWindowDecrement;
