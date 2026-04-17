'use strict';

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX = 100;
const DEFAULT_STATUS_CODE = 429;
const DEFAULT_MESSAGE = 'Too many requests, please try again later.';
const DEFAULT_KEY_PREFIX = 'rl:';
const DEFAULT_REQUEST_PROPERTY = 'rateLimit';
const DEFAULT_STRATEGY = 'fixedWindow';
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000;
const DEFAULT_FAIL_MODE = 'open';

const LOG_LEVELS = Object.freeze({
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
});

const HEADER_MODES = Object.freeze({
  LEGACY: 'legacy',
  DRAFT_7: 'draft-7',
  BOTH: 'both',
  NONE: 'none',
});

const STRATEGY_NAMES = Object.freeze({
  FIXED_WINDOW: 'fixedWindow',
  SLIDING_WINDOW: 'slidingWindow',
  TOKEN_BUCKET: 'tokenBucket',
});

module.exports = {
  DEFAULT_WINDOW_MS,
  DEFAULT_MAX,
  DEFAULT_STATUS_CODE,
  DEFAULT_MESSAGE,
  DEFAULT_KEY_PREFIX,
  DEFAULT_REQUEST_PROPERTY,
  DEFAULT_STRATEGY,
  DEFAULT_CLEANUP_INTERVAL_MS,
  DEFAULT_FAIL_MODE,
  LOG_LEVELS,
  HEADER_MODES,
  STRATEGY_NAMES,
};
