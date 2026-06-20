import { describe, it, expect } from '@jest/globals';
import { throwIfFailed } from './exec.js';

describe('throwIfFailed', () => {
  it('returns the output unchanged on a zero exit code', () => {
    const output = { code: 0, stdout: 'ok', stderr: '' };
    expect(throwIfFailed(output, 'should not throw')).toBe(output);
  });

  it('throws with a static string message on a non-zero exit code', () => {
    expect(() =>
      throwIfFailed({ code: 1, stdout: '', stderr: 'boom' }, 'it failed'),
    ).toThrow('it failed');
  });

  it('invokes the message builder with the failed output', () => {
    expect(() =>
      throwIfFailed(
        { code: 2, stdout: '', stderr: 'denied' },
        (o) => `failed with status code ${o.code}: ${o.stderr}`,
      ),
    ).toThrow('failed with status code 2: denied');
  });

  it('does not invoke the message builder on success', () => {
    let called = false;
    throwIfFailed({ code: 0, stdout: '', stderr: '' }, () => {
      called = true;
      return 'unused';
    });
    expect(called).toBe(false);
  });
});
