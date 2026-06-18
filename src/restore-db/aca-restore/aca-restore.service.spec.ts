import { describe, it, expect, jest } from '@jest/globals';
import { AcaRestoreService } from './aca-restore.service.js';

describe('AcaRestoreService', () => {
  it('is exported as a class', () => {
    expect(AcaRestoreService).toBeDefined();
    expect(typeof AcaRestoreService).toBe('function');
  });
});

describe('AcaRestoreService.copyDatabaseIn', () => {
  function buildAcaRestoreService() {
    const sqlService = {
      client: 'sqlite3' as const,
      clientImage: 'neoskop/migrateus:latest',
      usesSidecar: false,
      databaseFilename: '/database/sqlite.db',
      dropAllTables: jest.fn(async () => undefined),
      transferRestore: jest.fn(async () => undefined),
      setupDirectusUser: jest.fn(async () => undefined),
      cleanUpDirectusUser: jest.fn(async () => undefined),
      setCredentials: jest.fn(async () => undefined),
      setAssetStorage: jest.fn(async () => undefined),
    };

    const acaContainerService = {
      setup: jest.fn(async () => undefined),
      cleanUp: jest.fn(async () => undefined),
      execute: jest.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
      image: '',
      infilFile: jest.fn(async () => undefined),
    };

    const acaService = {
      setup: jest.fn(async () => undefined),
      restartDirectus: jest.fn(async () => undefined),
    };

    const progressService = {
      advance: jest.fn(),
      warn: jest.fn(),
      fail: jest.fn(),
      finish: jest.fn(),
      updateText: jest.fn(),
    } as never;

    const directusVersionService = {
      getVersion: jest.fn(async () => '11.16.1'),
      isDangerousMismatch: jest.fn(() => false),
    } as never;

    const directusAssetService = { restoreAssets: jest.fn(async () => 0) } as never;
    const directusSettingService = { updateSettings: jest.fn(async () => undefined) } as never;
    const environmentService = { environment: { credentials: [], assetStorage: undefined, settings: undefined } };
    const configService = { force: true };
    const logger = { debug: jest.fn(), warn: jest.fn() };

    const service = new AcaRestoreService(
      logger as never,
      sqlService as never,
      directusAssetService,
      directusSettingService,
      acaContainerService as never,
      acaService as never,
      environmentService as never,
      progressService,
      directusVersionService,
      configService as never,
    );

    return { service };
  }

  it('rejects with a message indicating SQLite is only supported on docker', async () => {
    const { service } = buildAcaRestoreService();

    await expect((service as any).copyDatabaseIn('/tmp/backupdir')).rejects.toThrow(
      /only supported on docker/,
    );
  });
});
