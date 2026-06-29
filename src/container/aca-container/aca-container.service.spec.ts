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

// execute() ships `echo <b64> | base64 -d | bash` (spaces hidden as ${IFS}).
// Decode the base64 payload back to the real command it runs in-container.
function decodePayload(args) {
  const m = args.match(/echo\$\{IFS\}([A-Za-z0-9+/=]+)\$\{IFS\}\|/);
  if (!m) throw new Error('no base64 payload found in: ' + args);
  return Buffer.from(m[1], 'base64').toString('utf8');
}

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
    // Default: "run" the payload by echoing its decoded form, so the readiness
    // probe's marker round-trips. Tests override with mockResolvedValueOnce.
    async (args: string) => ({ code: 0, stdout: decodePayload(args), stderr: '' }),
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
      // delivered as `echo <b64> | base64 -d | bash` (space-hidden for az)
      expect(args).toContain('base64${IFS}-d');
      expect(args).toContain('bash');
    });

    it('ships the command base64-encoded with real spaces (so VAR=val prefixes parse)', async () => {
      mockAzExec.mockResolvedValueOnce({ code: 0, stdout: 'done', stderr: '' });

      await service.execute('PGPASSWORD=x psql -c "SELECT 1"');

      const payload = decodePayload(mockAzExec.mock.calls[0][0] as string);
      // real spaces preserved inside the decoded command, NOT ${IFS}
      expect(payload).toContain('PGPASSWORD=x psql -c "SELECT 1"');
      expect(payload).not.toContain('${IFS}');
    });

    it('undoes the driver bash-double-quote escaping (\\" → ") in the payload', async () => {
      mockAzExec.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.execute('psql -c \\"SELECT 1\\"');

      const payload = decodePayload(mockAzExec.mock.calls[0][0] as string);
      expect(payload).toContain('psql -c "SELECT 1"');
      expect(payload).not.toContain('\\"');
    });

    it('appends the exit-code sentinel to the payload', async () => {
      mockAzExec.mockResolvedValueOnce({
        code: 0,
        stdout: 'abc-123\n__MIGRATEUS_RC__0',
        stderr: '',
      });

      const result = await service.execute('echo hi');

      expect(result.code).toBe(0);
      expect(result.stdout).toBe('abc-123');
      // the payload carries the sentinel so az's always-0 exit can't hide failures
      const payload = decodePayload(mockAzExec.mock.calls[0][0] as string);
      expect(payload).toContain('; echo __MIGRATEUS_RC__$?');
    });

    it('surfaces an inner failure even though az exec itself exits 0', async () => {
      mockAzExec.mockResolvedValueOnce({
        code: 0,
        stdout: 'psql: error: connection failed\n__MIGRATEUS_RC__2',
        stderr: '',
      });

      const result = await service.execute('psql -c "SELECT 1"');

      expect(result.code).toBe(2);
      expect(result.stderr).toContain('connection failed');
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

      const payload = decodePayload(mockAzExec.mock.calls[0][0] as string);
      expect(payload).toContain('base64 /tmp/source.sql');
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

      const payload = decodePayload(mockAzExec.mock.calls[0][0] as string);
      expect(payload).toContain('base64 -d');
      expect(payload).toContain('/tmp/dest.sql');
      expect(payload).toContain(b64);
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
