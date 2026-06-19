import { describe, it, expect, jest } from '@jest/globals';

const mockExecFn = jest.fn<
  (cmd: string, opts?: unknown) => Promise<{ code: number; stdout: string; stderr: string }>
>();

jest.unstable_mockModule('../util/exec.js', () => ({
  exec: mockExecFn,
}));

const { K8sService } = await import('./k8s.service.js');

function makeService() {
  const environmentService = {
    environment: {
      platform: 'k8s' as const,
      name: 'test',
    },
  };
  const sqlService = { databaseConfig: null as any };
  const configService = { envConfig: {} };
  const redactService = { addRedaction: jest.fn() };
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    service: new K8sService(
      environmentService as any,
      sqlService as any,
      configService as any,
      redactService as any,
      logger as any,
    ),
    sqlService,
  };
}

function makeDeployManifest(envVars: Array<{ name: string; value?: string }>) {
  return JSON.stringify({
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: 'directus',
              env: envVars.map((e) => ({ name: e.name, value: e.value })),
              envFrom: [],
            },
          ],
        },
      },
    },
  });
}

describe('K8sService', () => {
  it('is exported as a class', () => {
    expect(K8sService).toBeDefined();
    expect(typeof K8sService).toBe('function');
  });

  describe('execInDirectus()', () => {
    beforeEach(() => {
      mockExecFn.mockReset();
    });

    it('runs the command in the Directus deployment via kubectl exec deploy/directus', async () => {
      const { service } = makeService();
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: 'done', stderr: '' });

      const result = await service.execInDirectus(
        'node /directus/cli.js roles create --role r --admin',
      );

      const cmd = mockExecFn.mock.calls[0][0] as string;
      expect(cmd).toContain('kubectl exec deploy/directus -- /bin/sh -c');
      expect(cmd).toContain('node /directus/cli.js roles create --role r --admin');
      expect(result).toEqual({ code: 0, stdout: 'done', stderr: '' });
    });

    it('throws when kubectl exec exits with a non-zero code', async () => {
      const { service } = makeService();
      mockExecFn.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'error' });

      await expect(
        service.execInDirectus('node /directus/cli.js'),
      ).rejects.toThrow('error');
    });
  });

  describe('retrieveDatabaseConfig()', () => {
    beforeEach(() => {
      mockExecFn.mockReset();
    });

    it('includes client when DB_CLIENT is present in envMap', async () => {
      const { service, sqlService } = makeService();
      mockExecFn.mockResolvedValueOnce({
        code: 0,
        stdout: makeDeployManifest([
          { name: 'DB_HOST', value: 'db.example.com' },
          { name: 'DB_PORT', value: '5432' },
          { name: 'DB_DATABASE', value: 'mydb' },
          { name: 'DB_USER', value: 'admin' },
          { name: 'DB_PASSWORD', value: 's3cret' },
          { name: 'DB_CLIENT', value: 'pg' },
        ]),
        stderr: '',
      });

      // @ts-ignore accessing protected method for testing
      const result = await service.retrieveDatabaseConfig();

      expect(result.client).toBe('pg');
    });

    it('omits client when DB_CLIENT is absent from envMap', async () => {
      const { service } = makeService();
      mockExecFn.mockResolvedValueOnce({
        code: 0,
        stdout: makeDeployManifest([
          { name: 'DB_HOST', value: 'db.example.com' },
          { name: 'DB_PORT', value: '5432' },
          { name: 'DB_DATABASE', value: 'mydb' },
          { name: 'DB_USER', value: 'admin' },
          { name: 'DB_PASSWORD', value: 's3cret' },
        ]),
        stderr: '',
      });

      // @ts-ignore accessing protected method for testing
      const result = await service.retrieveDatabaseConfig();

      expect(result.client).toBeUndefined();
    });

    it('includes filename when DB_FILENAME is present in envMap', async () => {
      const { service } = makeService();
      mockExecFn.mockResolvedValueOnce({
        code: 0,
        stdout: makeDeployManifest([
          { name: 'DB_HOST', value: '' },
          { name: 'DB_PORT', value: '' },
          { name: 'DB_DATABASE', value: '' },
          { name: 'DB_USER', value: '' },
          { name: 'DB_PASSWORD', value: '' },
          { name: 'DB_CLIENT', value: 'sqlite3' },
          { name: 'DB_FILENAME', value: '/data/db.sqlite' },
        ]),
        stderr: '',
      });

      // @ts-ignore accessing protected method for testing
      const result = await service.retrieveDatabaseConfig();

      expect(result.filename).toBe('/data/db.sqlite');
    });

    it('omits filename when DB_FILENAME is absent from envMap', async () => {
      const { service } = makeService();
      mockExecFn.mockResolvedValueOnce({
        code: 0,
        stdout: makeDeployManifest([
          { name: 'DB_HOST', value: 'db.example.com' },
          { name: 'DB_PORT', value: '5432' },
          { name: 'DB_DATABASE', value: 'mydb' },
          { name: 'DB_USER', value: 'admin' },
          { name: 'DB_PASSWORD', value: 's3cret' },
        ]),
        stderr: '',
      });

      // @ts-ignore accessing protected method for testing
      const result = await service.retrieveDatabaseConfig();

      expect(result.filename).toBeUndefined();
    });
  });
});
