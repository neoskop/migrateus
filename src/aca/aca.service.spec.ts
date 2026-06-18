import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockExecFn = jest.fn<
  (cmd: string, opts?: unknown) => Promise<{ code: number; stdout: string; stderr: string }>
>();

jest.unstable_mockModule('../util/exec.js', () => ({
  exec: mockExecFn,
}));

const { AcaService } = await import('./aca.service.js');

function makeService(acaEnvOverrides?: Partial<{
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
    ...acaEnvOverrides,
  };
  const environmentService = {
    environment: {
      platform: 'aca' as const,
      name: 'test',
      aca: acaConfig,
    },
  };
  const sqlService = {
    databaseConfig: null as any,
  };
  return new AcaService(logger as any, environmentService as any, sqlService as any);
}

describe('AcaService', () => {
  it('is exported as a class', () => {
    expect(AcaService).toBeDefined();
    expect(typeof AcaService).toBe('function');
  });

  describe('az()', () => {
    let service: InstanceType<typeof AcaService>;

    beforeEach(() => {
      mockExecFn.mockReset();
      service = makeService();
    });

    it('includes --subscription in the az command', async () => {
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.az('some command');

      const cmd = mockExecFn.mock.calls[0][0] as string;
      expect(cmd).toMatch(/--subscription\s+sub-123/);
    });

    it('starts the command with "az "', async () => {
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.az('containerapp list');

      const cmd = mockExecFn.mock.calls[0][0] as string;
      expect(cmd).toMatch(/^az containerapp list/);
    });

    it('returns the exec result', async () => {
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: 'some output', stderr: '' });

      const result = await service.az('containerapp list');

      expect(result).toEqual({ code: 0, stdout: 'some output', stderr: '' });
    });
  });

  describe('setup()', () => {
    let service: InstanceType<typeof AcaService>;
    let sqlService: { databaseConfig: any };

    beforeEach(() => {
      mockExecFn.mockReset();
      sqlService = { databaseConfig: null as any };
      const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      const environmentService = {
        environment: {
          platform: 'aca' as const,
          name: 'test',
          aca: {
            subscription: 'sub-123',
            resourceGroup: 'my-rg',
            environment: 'my-env',
            app: 'my-app',
          },
        },
      };
      service = new AcaService(logger as any, environmentService as any, sqlService as any);
    });

    it('calls az containerapp show to get env vars', async () => {
      const envVars = [
        { name: 'DB_HOST', value: 'db.example.com' },
        { name: 'DB_PORT', value: '5432' },
        { name: 'DB_DATABASE', value: 'mydb' },
        { name: 'DB_USER', value: 'admin' },
        { name: 'DB_PASSWORD', value: 's3cret' },
        { name: 'DB_CLIENT', value: 'pg' },
      ];
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify(envVars), stderr: '' });

      await service.setup();

      const cmd = mockExecFn.mock.calls[0][0] as string;
      expect(cmd).toMatch(/az containerapp show/);
      expect(cmd).toMatch(/-n my-app/);
      expect(cmd).toMatch(/-g my-rg/);
    });

    it('parses DB env vars into a DatabaseConfig and assigns to sqlService', async () => {
      const envVars = [
        { name: 'DB_HOST', value: 'db.example.com' },
        { name: 'DB_PORT', value: '5432' },
        { name: 'DB_DATABASE', value: 'mydb' },
        { name: 'DB_USER', value: 'admin' },
        { name: 'DB_PASSWORD', value: 's3cret' },
        { name: 'DB_CLIENT', value: 'pg' },
      ];
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify(envVars), stderr: '' });

      await service.setup();

      expect(sqlService.databaseConfig).toMatchObject({
        host: 'db.example.com',
        port: '5432',
        name: 'mydb',
        user: 'admin',
        password: 's3cret',
        client: 'pg',
      });
    });

    it('maps DB_FILENAME to filename in DatabaseConfig', async () => {
      const envVars = [
        { name: 'DB_CLIENT', value: 'sqlite3' },
        { name: 'DB_FILENAME', value: '/data/database.db' },
        { name: 'DB_HOST', value: '' },
        { name: 'DB_PORT', value: '' },
        { name: 'DB_DATABASE', value: '' },
        { name: 'DB_USER', value: '' },
        { name: 'DB_PASSWORD', value: '' },
      ];
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify(envVars), stderr: '' });

      await service.setup();

      expect(sqlService.databaseConfig).toMatchObject({
        client: 'sqlite3',
        filename: '/data/database.db',
      });
    });

    it('sets secretRef values to empty string (does not fail)', async () => {
      const envVars = [
        { name: 'DB_HOST', value: 'db.example.com' },
        { name: 'DB_PORT', value: '5432' },
        { name: 'DB_DATABASE', value: 'mydb' },
        { name: 'DB_USER', value: 'admin' },
        { name: 'DB_PASSWORD', secretRef: 'db-password-secret' },
        { name: 'DB_CLIENT', value: 'pg' },
      ];
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify(envVars), stderr: '' });

      await expect(service.setup()).resolves.not.toThrow();
      expect(sqlService.databaseConfig.password).toBe('');
    });

    it('tolerates missing optional fields (no client, no filename)', async () => {
      const envVars = [
        { name: 'DB_HOST', value: 'db.example.com' },
        { name: 'DB_PORT', value: '5432' },
        { name: 'DB_DATABASE', value: 'mydb' },
        { name: 'DB_USER', value: 'admin' },
        { name: 'DB_PASSWORD', value: 's3cret' },
      ];
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify(envVars), stderr: '' });

      await service.setup();

      expect(sqlService.databaseConfig.host).toBe('db.example.com');
      expect(sqlService.databaseConfig.client).toBeUndefined();
      expect(sqlService.databaseConfig.filename).toBeUndefined();
    });

    it('does not set client when DB_CLIENT is an empty string (secretRef fallback)', async () => {
      const envVars = [
        { name: 'DB_HOST', value: 'db.example.com' },
        { name: 'DB_PORT', value: '5432' },
        { name: 'DB_DATABASE', value: 'mydb' },
        { name: 'DB_USER', value: 'admin' },
        { name: 'DB_PASSWORD', value: 's3cret' },
        // secretRef → empty string in envMap
        { name: 'DB_CLIENT', secretRef: 'some-secret-ref' },
      ];
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify(envVars), stderr: '' });

      await service.setup();

      expect(sqlService.databaseConfig.client).toBeUndefined();
    });

    it('does not set filename when DB_FILENAME is an empty string (secretRef fallback)', async () => {
      const envVars = [
        { name: 'DB_HOST', value: 'db.example.com' },
        { name: 'DB_PORT', value: '5432' },
        { name: 'DB_DATABASE', value: 'mydb' },
        { name: 'DB_USER', value: 'admin' },
        { name: 'DB_PASSWORD', value: 's3cret' },
        { name: 'DB_CLIENT', value: 'pg' },
        // secretRef → empty string in envMap
        { name: 'DB_FILENAME', secretRef: 'some-secret-ref' },
      ];
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify(envVars), stderr: '' });

      await service.setup();

      expect(sqlService.databaseConfig.filename).toBeUndefined();
    });
  });

  describe('restartDirectus()', () => {
    let service: InstanceType<typeof AcaService>;

    beforeEach(() => {
      mockExecFn.mockReset();
      service = makeService();
    });

    it('calls az containerapp revision restart', async () => {
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.restartDirectus();

      const cmd = mockExecFn.mock.calls[0][0] as string;
      expect(cmd).toMatch(/az containerapp/);
      expect(cmd).toMatch(/restart/);
    });
  });
});
