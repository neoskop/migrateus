import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockExec = jest.fn<
  (cmd: string, opts?: unknown) => Promise<{ code: number; stdout: string; stderr: string }>
>();

jest.unstable_mockModule('../util/exec.js', () => ({
  exec: mockExec,
  throwIfFailed: (output: any, message: any) => {
    if (output.code !== 0) {
      throw new Error(typeof message === 'function' ? message(output) : message);
    }
    return output;
  },
}));

const { UpdateService } = await import('./update.service.js');

describe('UpdateService.checkForUpdates', () => {
  const logger = { debug: jest.fn(), info: jest.fn() };

  beforeEach(() => {
    mockExec.mockReset();
    logger.debug.mockReset();
  });

  it('queries npmjs regardless of a scoped registry in .npmrc', async () => {
    mockExec.mockResolvedValue({ code: 0, stdout: '["0.0.1"]', stderr: '' });
    await new UpdateService(logger as never).checkForUpdates();
    expect(mockExec.mock.calls[0][0]).toContain(
      '--@neoskop:registry=https://registry.npmjs.org',
    );
  });

  it('does not throw when the version lookup fails', async () => {
    mockExec.mockResolvedValue({ code: 1, stdout: '', stderr: 'npm error code E404' });
    await expect(
      new UpdateService(logger as never).checkForUpdates(),
    ).resolves.toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Skipping update check'),
    );
  });
});
