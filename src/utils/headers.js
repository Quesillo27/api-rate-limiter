'use strict';

const { HEADER_MODES } = require('../config/defaults');

function normalizeMode(standardHeaders) {
  if (standardHeaders === false) return HEADER_MODES.NONE;
  if (standardHeaders === true || standardHeaders === HEADER_MODES.LEGACY) return HEADER_MODES.LEGACY;
  if (standardHeaders === HEADER_MODES.DRAFT_7) return HEADER_MODES.DRAFT_7;
  if (standardHeaders === HEADER_MODES.BOTH) return HEADER_MODES.BOTH;
  if (standardHeaders === HEADER_MODES.NONE) return HEADER_MODES.NONE;
  return HEADER_MODES.LEGACY;
}

function computeRetryAfterSeconds(result, now = Date.now()) {
  const seconds = Math.ceil((result.reset - now) / 1000);
  return seconds > 0 ? seconds : 0;
}

function setRateLimitHeaders(res, result, options) {
  const mode = normalizeMode(options.standardHeaders);
  if (mode === HEADER_MODES.NONE) return;

  const resetSeconds = Math.ceil(result.reset / 1000);
  const remaining = Math.max(0, result.remaining);

  if (mode === HEADER_MODES.LEGACY || mode === HEADER_MODES.BOTH) {
    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);
  }

  if (mode === HEADER_MODES.DRAFT_7 || mode === HEADER_MODES.BOTH) {
    const windowSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));
    res.setHeader('RateLimit-Limit', options.max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader(
      'RateLimit-Policy',
      `${options.max};w=${windowSeconds};policy="${options.strategy}"`
    );
    const resetDelta = Math.max(0, Math.ceil((result.reset - Date.now()) / 1000));
    res.setHeader('RateLimit-Reset', resetDelta);
  }
}

function setRetryAfter(res, result) {
  const retryAfter = computeRetryAfterSeconds(result);
  res.setHeader('Retry-After', retryAfter);
  return retryAfter;
}

module.exports = {
  normalizeMode,
  computeRetryAfterSeconds,
  setRateLimitHeaders,
  setRetryAfter,
};
