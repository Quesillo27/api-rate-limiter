'use strict';

const { createLogger, isLoggerLike, LOG_LEVELS } = require('../src/utils/logger');

describe('logger', () => {
  it('silent logger does not call output', () => {
    const output = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    const logger = createLogger({ silent: true, output });
    logger.error('nope');
    logger.warn('nope');
    logger.info('nope');
    logger.debug('nope');
    expect(output.error).not.toHaveBeenCalled();
    expect(output.warn).not.toHaveBeenCalled();
  });

  it('respects level threshold (warn blocks info/debug)', () => {
    const output = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    const logger = createLogger({ level: 'warn', output });
    logger.error('e');
    logger.warn('w');
    logger.info('i');
    logger.debug('d');
    expect(output.error).toHaveBeenCalledTimes(1);
    expect(output.warn).toHaveBeenCalledTimes(1);
    expect(output.info).not.toHaveBeenCalled();
    expect(output.debug).not.toHaveBeenCalled();
  });

  it('debug level lets everything through', () => {
    const output = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    const logger = createLogger({ level: 'debug', output });
    logger.error('e'); logger.warn('w'); logger.info('i'); logger.debug('d');
    expect(output.error).toHaveBeenCalled();
    expect(output.warn).toHaveBeenCalled();
    expect(output.info).toHaveBeenCalled();
    expect(output.debug).toHaveBeenCalled();
  });

  it('formats payload with timestamp and scope', () => {
    const output = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    const logger = createLogger({ level: 'info', output });
    logger.info('hello', { a: 1 });
    const arg = output.info.mock.calls[0][0];
    expect(arg.level).toBe('info');
    expect(arg.scope).toBe('api-rate-limiter');
    expect(arg.message).toBe('hello');
    expect(arg.meta).toEqual({ a: 1 });
    expect(typeof arg.timestamp).toBe('string');
  });

  it('supports custom formatter', () => {
    const output = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    const formatter = (level, msg) => `[${level}] ${msg}`;
    const logger = createLogger({ level: 'info', output, formatter });
    logger.info('hola');
    expect(output.info).toHaveBeenCalledWith('[info] hola');
  });

  it('defaults to warn when given invalid level', () => {
    const output = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    const logger = createLogger({ level: 'tonto', output });
    expect(logger.level).toBe(LOG_LEVELS.warn);
  });

  it('isLoggerLike detects compatible loggers', () => {
    const good = { error() {}, warn() {}, info() {}, debug() {} };
    const bad = { error() {} };
    expect(isLoggerLike(good)).toBe(true);
    expect(isLoggerLike(bad)).toBe(false);
    expect(isLoggerLike(null)).toBe(false);
  });

  it('handles missing output method gracefully', () => {
    const logger = createLogger({ level: 'info', output: {} });
    expect(() => logger.info('x')).not.toThrow();
  });
});
