// K8sBackupService.copyDatabaseOut must reject — SQLite is only supported on docker.

import { describe, it, expect, jest } from '@jest/globals';
import { K8sBackupService } from './k8s-backup.service.js';

function buildK8sBackupService() {
  const sqlService = {
    client: 'sqlite3' as const,
    clientImage: 'neoskop/migrateus:latest',
    usesSidecar: false,
    databaseFilename: '/database/sqlite.db',
    performMysqlDump: jest.fn(async () => undefined),
    setupDirectusUser: jest.fn(async () => undefined),
    cleanUpDirectusUser: jest.fn(async () => undefined),
  };

  const kubernetesContainerService = {
    setup: jest.fn(async () => undefined),
    cleanUp: jest.fn(async () => undefined),
    exfilFile: jest.fn(async () => undefined),
    copyFromDirectus: jest.fn(async () => {
      throw new Error('SQLite is only supported on docker/docker-compose platforms');
    }),
    image: '',
  };

  const k8sService = {
    setup: jest.fn(async () => undefined),
    cleanUp: jest.fn(async () => undefined),
  };

  const portForwardService = {
    forward: jest.fn(async () => 8055),
    stop: jest.fn(),
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

  const service = new K8sBackupService(
    logger as never,
    sqlService as never,
    directusAssetService,
    kubernetesContainerService as never,
    k8sService as never,
    config,
    portForwardService as never,
    progressService,
    directusVersionService,
  );

  return { service };
}

describe('K8sBackupService.copyDatabaseOut', () => {
  it('rejects with a message indicating SQLite is only supported on docker', async () => {
    const { service } = buildK8sBackupService();

    await expect((service as any).copyDatabaseOut('/tmp/backupdir')).rejects.toThrow(
      /only supported on docker/,
    );
  });
});
