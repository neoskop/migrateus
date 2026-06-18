import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BackupDbService } from './backup-db.service.js';

describe('BackupDbService', () => {
  it('is exported as a class', () => {
    expect(BackupDbService).toBeDefined();
    expect(typeof BackupDbService).toBe('function');
  });
});

describe('BackupDbService.backup dispatch', () => {
  type AnyMock = jest.Mock<any>;

  function build(platform: string) {
    const dockerBackupService = { backup: jest.fn(async () => undefined) as AnyMock };
    const k8sBackupService = { backup: jest.fn(async () => undefined) as AnyMock };
    const acaBackupService = { backup: jest.fn(async () => undefined) as AnyMock };

    const environment = { platform };
    const config = { getEnvironment: jest.fn(() => environment) as AnyMock };
    const environmentService = { environment: undefined as unknown };

    const service = new BackupDbService(
      config as never,
      dockerBackupService as never,
      k8sBackupService as never,
      acaBackupService as never,
      environmentService as never,
    );

    return { service, dockerBackupService, k8sBackupService, acaBackupService };
  }

  it('routes docker platform to DockerBackupService', async () => {
    const { service, dockerBackupService, k8sBackupService, acaBackupService } = build('docker-compose');
    await service.backup('dev', 'backup.tgz');
    expect(dockerBackupService.backup).toHaveBeenCalledTimes(1);
    expect(k8sBackupService.backup).not.toHaveBeenCalled();
    expect(acaBackupService.backup).not.toHaveBeenCalled();
  });

  it('routes k8s platform to K8sBackupService', async () => {
    const { service, dockerBackupService, k8sBackupService, acaBackupService } = build('k8s');
    await service.backup('prod', 'backup.tgz');
    expect(k8sBackupService.backup).toHaveBeenCalledTimes(1);
    expect(dockerBackupService.backup).not.toHaveBeenCalled();
    expect(acaBackupService.backup).not.toHaveBeenCalled();
  });

  it('routes aca platform to AcaBackupService', async () => {
    const { service, dockerBackupService, k8sBackupService, acaBackupService } = build('aca');
    await service.backup('aca-env', 'backup.tgz');
    expect(acaBackupService.backup).toHaveBeenCalledTimes(1);
    expect(dockerBackupService.backup).not.toHaveBeenCalled();
    expect(k8sBackupService.backup).not.toHaveBeenCalled();
  });

  it('passes the backupFile argument to the selected backup service', async () => {
    const { service, acaBackupService } = build('aca');
    await service.backup('aca-env', 'my-backup.tgz');
    expect(acaBackupService.backup).toHaveBeenCalledWith('my-backup.tgz');
  });
});
