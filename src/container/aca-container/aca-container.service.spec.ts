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

const { AcaContainerService } = await import('./aca-container.service.js');

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

  const acaService = {
    acaEnv: acaConfig,
    az: mockAz,
  };

  const service = new AcaContainerService(logger as any, acaService as any);
  service.image = 'directus/directus:latest';

  return { service, acaService: { ...acaService, az: mockAz }, mockAz };
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
    let mockAz: ReturnType<typeof makeService>['mockAz'];

    beforeEach(() => {
      const result = makeService();
      service = result.service;
      mockAz = result.mockAz;
    });

    it('calls az containerapp exec with the app name and command', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: 'done', stderr: '' });

      await service.execute('echo hello');

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).toMatch(/containerapp exec/);
      expect(args).toMatch(new RegExp(`-n ${service.migrateusAppName}`));
    });

    it('includes -g resourceGroup in exec command', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: 'done', stderr: '' });

      await service.execute('echo hello');

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).toMatch(/-g my-rg/);
    });

    it('collapses newlines in the command to spaces', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: 'done', stderr: '' });

      await service.execute('line1\nline2\nline3');

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).not.toContain('\n');
      expect(args).toMatch(/line1 line2 line3/);
    });

    it('returns the exec result', async () => {
      mockAz.mockResolvedValueOnce({ code: 0, stdout: 'result output', stderr: '' });

      const result = await service.execute('echo hello');

      expect(result).toMatchObject({ code: 0, stdout: 'result output' });
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
    let mockAz: ReturnType<typeof makeService>['mockAz'];

    beforeEach(() => {
      mockFsWriteFile.mockReset();
      mockFsReadFile.mockReset();
      const result = makeService();
      service = result.service;
      mockAz = result.mockAz;
    });

    it('executes base64 on the source file in container', async () => {
      const b64 = Buffer.from('file content').toString('base64');
      mockAz.mockResolvedValueOnce({ code: 0, stdout: b64, stderr: '' });
      mockFsWriteFile.mockResolvedValueOnce(undefined);

      await service.exfilFile('/tmp/source.sql', '/local/dest.sql');

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).toMatch(/base64 \/tmp\/source\.sql/);
    });

    it('writes decoded base64 to the destination', async () => {
      const content = 'file content here';
      const b64 = Buffer.from(content).toString('base64');
      mockAz.mockResolvedValueOnce({ code: 0, stdout: b64 + '\n', stderr: '' });
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
      mockAz.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'exec failed' });

      await expect(service.exfilFile('/tmp/source.sql', '/local/dest.sql')).rejects.toThrow();
    });
  });

  describe('infilFile()', () => {
    let service: InstanceType<typeof AcaContainerService>;
    let mockAz: ReturnType<typeof makeService>['mockAz'];

    beforeEach(() => {
      mockFsWriteFile.mockReset();
      mockFsReadFile.mockReset();
      const result = makeService();
      service = result.service;
      mockAz = result.mockAz;
    });

    it('reads the source file, base64-encodes, and pipes into container', async () => {
      const content = 'local file content';
      const b64 = Buffer.from(content).toString('base64');
      mockFsReadFile.mockResolvedValueOnce(Buffer.from(content) as any);
      mockAz.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.infilFile('/local/source.sql', '/tmp/dest.sql');

      const args = mockAz.mock.calls[0][0] as string;
      expect(args).toMatch(/base64 -d/);
      expect(args).toMatch(/\/tmp\/dest\.sql/);
      expect(args).toContain(b64);
    });

    it('throws when execute returns non-zero exit code', async () => {
      const content = 'local file content';
      mockFsReadFile.mockResolvedValueOnce(Buffer.from(content) as any);
      mockAz.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'exec failed' });

      await expect(service.infilFile('/local/source.sql', '/tmp/dest.sql')).rejects.toThrow();
    });
  });
});
