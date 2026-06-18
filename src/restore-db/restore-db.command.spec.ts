import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { RestoreDbCommand } from './restore-db.command.js';

type AnyMock = jest.Mock<any>;

function build(platform: string) {
  const dockerRestoreService = { restore: jest.fn(async () => undefined) as AnyMock };
  const k8sRestoreService = { restore: jest.fn(async () => undefined) as AnyMock };
  const acaRestoreService = { restore: jest.fn(async () => undefined) as AnyMock };

  const environment = { platform, doubleCheck: false };
  const config = { getEnvironment: jest.fn(() => environment) as AnyMock };
  const environmentService = { environment: undefined as unknown };

  const inquirer = {
    ask: jest.fn(async () => ({ from: 'backup.tgz', fromManual: undefined, to: 'env' })) as AnyMock,
  };

  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const redactService = {};
  const dependenciesService = {};
  const progressService = {};
  const containerServices: unknown[] = [];
  const updateService = {};

  const command = new RestoreDbCommand(
    logger as never,
    config as never,
    inquirer as never,
    dockerRestoreService as never,
    k8sRestoreService as never,
    acaRestoreService as never,
    environmentService as never,
    redactService as never,
    dependenciesService as never,
    progressService as never,
    containerServices as never,
    updateService as never,
  );

  return { command, dockerRestoreService, k8sRestoreService, acaRestoreService };
}

describe('RestoreDbCommand.execute dispatch', () => {
  it('routes docker platform to DockerRestoreService', async () => {
    const { command, dockerRestoreService, k8sRestoreService, acaRestoreService } = build('docker-compose');
    await command.execute(['backup.tgz', 'env']);
    expect(dockerRestoreService.restore).toHaveBeenCalledTimes(1);
    expect(k8sRestoreService.restore).not.toHaveBeenCalled();
    expect(acaRestoreService.restore).not.toHaveBeenCalled();
  });

  it('routes k8s platform to K8sRestoreService', async () => {
    const { command, dockerRestoreService, k8sRestoreService, acaRestoreService } = build('k8s');
    await command.execute(['backup.tgz', 'env']);
    expect(k8sRestoreService.restore).toHaveBeenCalledTimes(1);
    expect(dockerRestoreService.restore).not.toHaveBeenCalled();
    expect(acaRestoreService.restore).not.toHaveBeenCalled();
  });

  it('routes aca platform to AcaRestoreService', async () => {
    const { command, dockerRestoreService, k8sRestoreService, acaRestoreService } = build('aca');
    await command.execute(['backup.tgz', 'env']);
    expect(acaRestoreService.restore).toHaveBeenCalledTimes(1);
    expect(dockerRestoreService.restore).not.toHaveBeenCalled();
    expect(k8sRestoreService.restore).not.toHaveBeenCalled();
  });

  it('passes the backupFile argument to AcaRestoreService.restore', async () => {
    const { command, acaRestoreService } = build('aca');
    await command.execute(['my-backup.tgz', 'aca-env']);
    expect(acaRestoreService.restore).toHaveBeenCalledWith('my-backup.tgz');
  });
});
