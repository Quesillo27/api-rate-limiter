'use strict';

/**
 * Fixed Window strategy.
 * Divides time into fixed windows of windowMs duration.
 * Counts requests within the current window and resets at the window boundary.
 */
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

module.exports = fixedWindow;
