import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockFsWriteFile = jest.fn<(...args: any[]) => Promise<void>>();
const mockFsReadFile = jest.fn<(...args: any[]) => Promise<Buffer>>();

jest.unstable_mockModule('node:fs', () => ({
  default: {
    promises: {
      writeFile: mockFsWriteFile,
      readFile: mockFsReadFile,
    },
  },
  promises: {
    writeFile: mockFsWriteFile,
    readFile: mockFsReadFile,
  },
}));

const { AcaContainerService, stripAcaExecBanner } = await import(
  './aca-container.service.js'
);

function makeService(acaConfigOverrides?: Partial<{
  subscription: string;
  resourceGroup: string;
  environment: string;
  app: string;
}>) {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const acaConfig = {
    subscription: 'sub-123',
    resourceGroup: 'my-rg',
    environment: 'my-env',
    app: 'my-app',
    ...acaConfigOverrides,
  };

  const mockAz = jest.fn<(args: string, opts?: unknown) => Promise<{ code: number; stdout: string; stderr: string }>>();
  // `execute()` (and the setup readiness probe) go through `azExec`. Default:
  // echo the az command back as stdout so the `waitUntilExecReady` marker check
  // succeeds on the first attempt; individual tests override as needed.
  const mockAzExec = jest.fn<(args: string, opts?: unknown) => Promise<{ code: number; stdout: string; stderr: string }>>(
    async (args: string) => ({ code: 0, stdout: args, stderr: '' }),
  );

  const acaService = {
    acaEnv: acaConfig,
    az: mockAz,
    azExec: mockAzExec,
  };

  const service = new AcaContainerService(logger as any, acaService as any);
  service.image = 'directus/directus:latest';

  return { service, acaService, mockAz, mockAzExec };
}

describe('AcaContainerService', () => {
  it('is exported as a class', () => {
    expect(AcaContainerService).toBeDefined();
    expect(typeof AcaContainerService).toBe('function');
  });

  it('has a migrateusAppName starting with "migrateus-"', () => {
    const { service } = makeService();
    expect(service.migrateusAppName).toMatch(/^migrateus-[a-f0-9]{6}$/);
  });

  describe('setup()', () => {
    let service: InstanceType<typeof AcaContainerService>;
    let mockAz: ReturnType<typeof makeService>['mockAz'];

    beforeEach(() => {
      mockFsWriteFile.mockReset();
      mockFsReadFile.mockReset();
      const result = makeService();
      service = result.service;
      mockAz = result.mockAz;
    });

    it('calls az containerapp create with the app name', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.setup();

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).toMatch(/containerapp create/);
      expect(args).toMatch(new RegExp(`-n ${service.migrateusAppName}`));
    });

    it('includes -g resourceGroup in create command', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.setup();

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).toMatch(/-g my-rg/);
    });

    it('includes the image in create command', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.setup();

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).toMatch(/--image directus\/directus:latest/);
    });

    it('includes --environment in create command', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.setup();

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).toMatch(/--environment my-env/);
    });

    it('throws when az returns non-zero exit code', async () => {
      mockAz.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'create failed' });

      await expect(service.setup()).rejects.toThrow();
    });
  });

  describe('execute()', () => {
    let service: InstanceType<typeof AcaContainerService>;
    let mockAzExec: ReturnType<typeof makeService>['mockAzExec'];

    beforeEach(() => {
      const result = makeService();
      service = result.service;
      mockAzExec = result.mockAzExec;
    });

    it('runs via azExec (PTY) — az exec needs a TTY', async () => {
      mockAzExec.mockResolvedValueOnce({ code: 0, stdout: 'done', stderr: '' });

      await service.execute('echo hello');

      const args = mockAzExec.mock.calls[0][0] as string;
      expect(args).toMatch(/containerapp exec/);
      expect(args).toMatch(new RegExp(`-n ${service.migrateusAppName}`));
      expect(args).toMatch(/-g my-rg/);
    });

    it('hides spaces as ${IFS} so az does not word-split the script', async () => {
      mockAzExec.mockResolvedValueOnce({ code: 0, stdout: 'done', stderr: '' });

      await service.execute('line1\nline2 word');

      const args = mockAzExec.mock.calls[0][0] as string;
      expect(args).not.toContain('\n');
      // newlines collapse to spaces, then every space becomes ${IFS}
      expect(args).toContain('line1${IFS}line2${IFS}word');
      expect(args).toContain('bash');
    });

    it('undoes the driver bash-double-quote escaping (\\" → ")', async () => {
      mockAzExec.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.execute('psql -c \\"SELECT 1\\"');

      const args = mockAzExec.mock.calls[0][0] as string;
      expect(args).not.toContain('\\"');
      expect(args).toContain('"SELECT${IFS}1"');
    });

    it('strips the az connection banner from stdout', async () => {
      mockAzExec.mockResolvedValueOnce({
        code: 0,
        stdout:
          'INFO: Connecting to the container ...\r\nabc-123\r\nDisconnecting...\r',
        stderr: '',
      });

      const result = await service.execute('echo hi');

      expect(result.stdout).toBe('abc-123');
    });
  });

  describe('stripAcaExecBanner()', () => {
    it('drops INFO: lines, banner phrases, ANSI codes and CRs, keeping data', () => {
      const raw = [
        'INFO: Connecting to the container ...\r',
        'INFO: received success status from cluster\r',
        '\x1b[93mUse ctrl + D to exit.\x1b[0m\r',
        'b1a7f0e2-0000-4000-8000-000000000000\r',
        'Disconnecting...\r',
      ].join('\n');
      expect(stripAcaExecBanner(raw)).toBe(
        'b1a7f0e2-0000-4000-8000-000000000000',
      );
    });
  });

  describe('cleanUp()', () => {
    let service: InstanceType<typeof AcaContainerService>;
    let mockAz: ReturnType<typeof makeService>['mockAz'];

    beforeEach(() => {
      const result = makeService();
      service = result.service;
      mockAz = result.mockAz;
    });

    it('calls az containerapp delete with app name', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.cleanUp();

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).toMatch(/containerapp delete/);
      expect(args).toMatch(new RegExp(`-n ${service.migrateusAppName}`));
    });

    it('includes -g resourceGroup in delete command', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.cleanUp();

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).toMatch(/-g my-rg/);
    });

    it('includes --yes in delete command', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.cleanUp();

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).toMatch(/--yes/);
    });
  });

  describe('cleanUpAll()', () => {
    let service: InstanceType<typeof AcaContainerService>;
    let mockAz: ReturnType<typeof makeService>['mockAz'];

    beforeEach(() => {
      const result = makeService();
      service = result.service;
      mockAz = result.mockAz;
    });

    it('calls az containerapp list to find migrateus- apps', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.cleanUpAll();

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).toMatch(/containerapp list/);
      expect(args).toMatch(/-g my-rg/);
    });

    it('deletes each listed app', async () => {
      mockAz
        .mockResolvedValueOnce({ code: 0, stdout: 'migrateus-aabbcc\nmigrateus-ddeeff\n', stderr: '' })
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.cleanUpAll();

      expect(mockAz.mock.calls.length).toBe(3);
      const deleteCall1 = mockAz.mock.calls[1][0] as string;
      const deleteCall2 = mockAz.mock.calls[2][0] as string;
      expect(deleteCall1).toMatch(/containerapp delete/);
      expect(deleteCall2).toMatch(/containerapp delete/);
    });

    it('does nothing if no apps found', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.cleanUpAll();

      expect(mockAz.mock.calls.length).toBe(1);
    });
  });

  describe('exfilFile()', () => {
    let service: InstanceType<typeof AcaContainerService>;
    let mockAzExec: ReturnType<typeof makeService>['mockAzExec'];

    beforeEach(() => {
      mockFsWriteFile.mockReset();
      mockFsReadFile.mockReset();
      const result = makeService();
      service = result.service;
      mockAzExec = result.mockAzExec;
    });

    it('executes base64 on the source file in container', async () => {
      const b64 = Buffer.from('file content').toString('base64');
      mockAzExec.mockResolvedValueOnce({ code: 0, stdout: b64, stderr: '' });
      mockFsWriteFile.mockResolvedValueOnce(undefined);

      await service.exfilFile('/tmp/source.sql', '/local/dest.sql');

      // spaces are hidden as ${IFS} for az's argv word-split
      const args = mockAzExec.mock.calls[0][0] as string;
      expect(args).toContain('base64${IFS}/tmp/source.sql');
    });

    it('writes decoded base64 to the destination', async () => {
      const content = 'file content here';
      const b64 = Buffer.from(content).toString('base64');
      mockAzExec.mockResolvedValueOnce({ code: 0, stdout: b64 + '\n', stderr: '' });
      mockFsWriteFile.mockResolvedValueOnce(undefined);

      await service.exfilFile('/tmp/source.sql', '/local/dest.sql');

      expect(mockFsWriteFile).toHaveBeenCalledWith(
        '/local/dest.sql',
        expect.any(Buffer),
      );
      const writtenBuffer = (mockFsWriteFile.mock.calls[0] as any[])[1] as Buffer;
      expect(writtenBuffer.toString('utf8')).toBe(content);
    });

    it('throws when execute returns non-zero exit code', async () => {
      mockAzExec.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'exec failed' });

      await expect(service.exfilFile('/tmp/source.sql', '/local/dest.sql')).rejects.toThrow();
    });
  });

  describe('infilFile()', () => {
    let service: InstanceType<typeof AcaContainerService>;
    let mockAzExec: ReturnType<typeof makeService>['mockAzExec'];

    beforeEach(() => {
      mockFsWriteFile.mockReset();
      mockFsReadFile.mockReset();
      const result = makeService();
      service = result.service;
      mockAzExec = result.mockAzExec;
    });

    it('reads the source file, base64-encodes, and pipes into container', async () => {
      const content = 'local file content';
      const b64 = Buffer.from(content).toString('base64');
      mockFsReadFile.mockResolvedValueOnce(Buffer.from(content) as any);
      mockAzExec.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.infilFile('/local/source.sql', '/tmp/dest.sql');

      const args = mockAzExec.mock.calls[0][0] as string;
      expect(args).toContain('base64${IFS}-d');
      expect(args).toContain('/tmp/dest.sql');
      expect(args).toContain(b64);
    });

    it('throws when execute returns non-zero exit code', async () => {
      const content = 'local file content';
      mockFsReadFile.mockResolvedValueOnce(Buffer.from(content) as any);
      mockAzExec.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'exec failed' });

      await expect(service.infilFile('/local/source.sql', '/tmp/dest.sql')).rejects.toThrow();
    });
  });

  describe('copyFromDirectus()', () => {
    it('rejects with a message about docker-only support', async () => {
      const { service } = makeService();
      await expect(service.copyFromDirectus('/database/sqlite.db', '/tmp/out')).rejects.toThrow(
        /only supported on docker/,
      );
    });
  });

  describe('copyToDirectus()', () => {
    it('rejects with a message about docker-only support', async () => {
      const { service } = makeService();
      await expect(service.copyToDirectus('/tmp/in', '/database/sqlite.db')).rejects.toThrow(
        /only supported on docker/,
      );
    });
  });
});
