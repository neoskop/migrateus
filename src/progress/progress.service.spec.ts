import { describe, it, expect, jest } from '@jest/globals';
import { ProgressService } from './progress.service.js';

describe('ProgressService', () => {
  it('is exported as a class', () => {
    expect(ProgressService).toBeDefined();
    expect(typeof ProgressService).toBe('function');
  });

  it('fail() falls back to the logger when no step has started', () => {
    const logger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    const service = new ProgressService(logger as never);
    // useSpinner defaults to true, but no advance() ran, so the spinner is
    // undefined. This must not throw.
    expect(() => service.fail(new Error('boom'))).not.toThrow();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});
