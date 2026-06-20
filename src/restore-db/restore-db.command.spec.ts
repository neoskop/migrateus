import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fs from 'node:fs';

type AnyMock = jest.Mock<any>;

const mockExec = jest.fn<
  (cmd: string, opts?: unknown) => Promise<{ code: number; stdout: string; stderr: string }>
>();

jest.unstable_mockModule('../util/exec.js', () => ({
  exec: mockExec,
  throwIfFailed: (output: any, message: any) => {
    if (output.code !== 0) {
      throw new Error(
        typeof message === 'function' ? message(output) : message,
      );
    }
    return output;
  },
}));

const mockDirSync = jest.fn<() => { name: string }>();

jest.unstable_mockModule('tmp', () => ({
  default: { dirSync: mockDirSync },
  dirSync: mockDirSync,
}));

const { RestoreDbCommand } = await import('./restore-db.command.js');

const mockReadFile = jest.spyOn(fs.promises, 'readFile');
const mockAccess = jest.spyOn(fs.promises, 'access');

function build(platform: string) {
  const dockerRestoreService = { restore: jest.fn(async () => undefined) as AnyMock };
  const k8sRestoreService = { restore: jest.fn(async () => undefined) as AnyMock };
  const acaRestoreService = { restore: jest.fn(async () => undefined) as AnyMock };
  const logicalRestorePerformer = { restore: jest.fn(async () => undefined) as AnyMock };

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
    logicalRestorePerformer as never,
    environmentService as never,
    redactService as never,
    dependenciesService as never,
    progressService as never,
    containerServices as never,
    updateService as never,
  );

  return {
    command,
    dockerRestoreService,
    k8sRestoreService,
    acaRestoreService,
    logicalRestorePerformer,
  };
}

describe('RestoreDbCommand.execute dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDirSync.mockReturnValue({ name: '/tmp/migrateus-peek' });
    mockExec.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    // No meta.json present by default → physical archive.
    mockAccess.mockRejectedValue(new Error('ENOENT') as never);
    mockReadFile.mockRejectedValue(new Error('ENOENT') as never);
  });

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

  it('does not call the logical performer for a physical archive', async () => {
    const { command, logicalRestorePerformer } = build('docker-compose');
    await command.execute(['backup.tgz', 'env']);
    expect(logicalRestorePerformer.restore).not.toHaveBeenCalled();
  });

  it('routes a logical archive to LogicalRestorePerformer regardless of platform', async () => {
    const { command, logicalRestorePerformer, dockerRestoreService } = build('docker-compose');
    mockAccess.mockResolvedValue(undefined as never);
    mockReadFile.mockResolvedValue(JSON.stringify({ format: 'logical' }) as never);

    await command.execute(['logical.tgz', 'env']);

    expect(logicalRestorePerformer.restore).toHaveBeenCalledTimes(1);
    expect(logicalRestorePerformer.restore).toHaveBeenCalledWith('logical.tgz', 'env');
    expect(dockerRestoreService.restore).not.toHaveBeenCalled();
  });

  it('falls through to the physical branch when meta.json format is not logical', async () => {
    const { command, logicalRestorePerformer, dockerRestoreService } = build('docker-compose');
    mockAccess.mockResolvedValue(undefined as never);
    mockReadFile.mockResolvedValue(JSON.stringify({ format: 'physical' }) as never);

    await command.execute(['physical.tgz', 'env']);

    expect(logicalRestorePerformer.restore).not.toHaveBeenCalled();
    expect(dockerRestoreService.restore).toHaveBeenCalledTimes(1);
  });
});
