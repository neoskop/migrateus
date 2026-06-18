// AcaBackupService.copyDatabaseOut must reject — SQLite is only supported on docker.

import { describe, it, expect, jest } from '@jest/globals';
import { AcaBackupService } from './aca-backup.service.js';

function buildAcaBackupService() {
  const sqlService = {
    client: 'sqlite3' as const,
    clientImage: 'neoskop/migrateus:latest',
    usesSidecar: false,
    databaseFilename: '/database/sqlite.db',
    performMysqlDump: jest.fn(async () => undefined),
    setupDirectusUser: jest.fn(async () => undefined),
    cleanUpDirectusUser: jest.fn(async () => undefined),
  };

  const acaContainerService = {
    setup: jest.fn(async () => undefined),
    cleanUp: jest.fn(async () => undefined),
    exfilFile: jest.fn(async () => undefined),
    copyFromDirectus: jest.fn(async () => {
      throw new Error('SQLite is only supported on docker/docker-compose platforms');
    }),
    image: '',
  };

  const acaService = {
    setup: jest.fn(async () => undefined),
    cleanUp: jest.fn(async () => undefined),
  };

  const progressService = {
    advance: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
    finish: jest.fn(),
    updateText: jest.fn(),
    warn: jest.fn(),
  } as never;

  const directusVersionService = {
    getVersion: jest.fn(async () => '11.16.1'),
  } as never;

  const directusAssetService = {} as never;
  const config = { noAssets: true } as never;
  const logger = { debug: jest.fn() };

  const service = new AcaBackupService(
    logger as never,
    sqlService as never,
    directusAssetService,
    acaContainerService as never,
    acaService as never,
    config,
    progressService,
    directusVersionService,
  );

  return { service };
}

describe('AcaBackupService.copyDatabaseOut', () => {
  it('rejects with a message indicating SQLite is only supported on docker', async () => {
    const { service } = buildAcaBackupService();

    await expect((service as any).copyDatabaseOut('/tmp/backupdir')).rejects.toThrow(
      /only supported on docker/,
    );
  });
});
