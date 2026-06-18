import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { MigrateDataService } from './migrate-data.service.js';

describe('MigrateDataService', () => {
  it('is exported as a class', () => {
    expect(MigrateDataService).toBeDefined();
    expect(typeof MigrateDataService).toBe('function');
  });
});

describe('MigrateDataService.setupContainerService — ACA platform', () => {
  type AnyMock = jest.Mock<any>;

  function build(platform: string) {
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const config = {
      getEnvironment: jest.fn(() => ({ platform, doubleCheck: false })) as AnyMock,
    };
    const dockerService = { setup: jest.fn(async () => undefined) as AnyMock };
    const portForwardService = { stop: jest.fn() as AnyMock };
    const k8sService = { setup: jest.fn(async () => undefined) as AnyMock, cleanUp: jest.fn(async () => undefined) as AnyMock };
    const acaService = { setup: jest.fn(async () => undefined) as AnyMock };
    const acaContainerService = {
      setup: jest.fn(async () => undefined) as AnyMock,
      cleanUp: jest.fn(async () => undefined) as AnyMock,
      exfilFile: jest.fn(async () => undefined) as AnyMock,
      infilFile: jest.fn(async () => undefined) as AnyMock,
    };
    const sqlService = {
      listTables: jest.fn(async () => []) as AnyMock,
      performMysqlDump: jest.fn(async () => undefined) as AnyMock,
      restoreMysqlDump: jest.fn(async () => undefined) as AnyMock,
    };
    const environmentService = { environment: undefined as unknown };
    const migrateDataPromptService = {
      prompt: jest.fn(async () => []) as AnyMock,
    };
    const progressService = {
      advance: jest.fn(),
      finish: jest.fn(),
      fail: jest.fn(),
      updateText: jest.fn(),
    };

    const service = new MigrateDataService(
      logger as never,
      config as never,
      dockerService as never,
      portForwardService as never,
      k8sService as never,
      acaService as never,
      acaContainerService as never,
      sqlService as never,
      environmentService as never,
      migrateDataPromptService as never,
      progressService as never,
    );

    return { service, dockerService, k8sService, acaService, acaContainerService, sqlService };
  }

  it('routes aca platform to AcaService.setup', async () => {
    const { service, acaService, k8sService, dockerService } = build('aca');

    // migrate() calls prepareContainerService which calls setupContainerService;
    // with empty collection list from prompt it returns early after setup.
    await service.migrate('aca-env', 'aca-env');

    expect(acaService.setup).toHaveBeenCalled();
    expect(k8sService.setup).not.toHaveBeenCalled();
    expect(dockerService.setup).not.toHaveBeenCalled();
  });

  it('routes aca platform to AcaContainerService.setup', async () => {
    const { service, acaContainerService, k8sService, dockerService } = build('aca');

    await service.migrate('aca-env', 'aca-env');

    expect(acaContainerService.setup).toHaveBeenCalled();
    expect(k8sService.setup).not.toHaveBeenCalled();
    expect(dockerService.setup).not.toHaveBeenCalled();
  });

  it('does not call AcaService.setup for k8s platform', async () => {
    const { service, acaService, k8sService } = build('k8s');

    await service.migrate('k8s-env', 'k8s-env');

    expect(acaService.setup).not.toHaveBeenCalled();
    expect(k8sService.setup).toHaveBeenCalled();
  });
});
