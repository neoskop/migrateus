import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { CleanService } from './clean.service.js';

describe('CleanService', () => {
  it('is exported as a class', () => {
    expect(CleanService).toBeDefined();
    expect(typeof CleanService).toBe('function');
  });
});

describe('CleanService.clean dispatch', () => {
  type AnyMock = jest.Mock<any>;

  function build(platform: string) {
    const k8sContainerService = {
      setup: jest.fn(async () => undefined) as AnyMock,
      cleanUpAll: jest.fn(async () => undefined) as AnyMock,
    };
    const dockerContainerService = {
      setup: jest.fn(async () => undefined) as AnyMock,
      cleanUpAll: jest.fn(async () => undefined) as AnyMock,
    };
    const acaContainerService = {
      setup: jest.fn(async () => undefined) as AnyMock,
      cleanUpAll: jest.fn(async () => undefined) as AnyMock,
    };
    const k8sService = {
      setup: jest.fn(async () => undefined) as AnyMock,
      cleanUp: jest.fn(async () => undefined) as AnyMock,
    };
    const dockerService = {
      setup: jest.fn(async () => undefined) as AnyMock,
    };
    const acaService = {
      setup: jest.fn(async () => undefined) as AnyMock,
    };
    const sqlService = {
      cleanUpAllDirectusUsers: jest.fn(async () => undefined) as AnyMock,
    };
    const config = {
      getEnvironment: jest.fn(() => ({ platform })) as AnyMock,
    };
    const environmentService = { environment: undefined as unknown };
    const progressService = {
      advance: jest.fn(),
      finish: jest.fn(),
      fail: jest.fn(),
    };

    const service = new CleanService(
      k8sContainerService as never,
      dockerContainerService as never,
      acaContainerService as never,
      k8sService as never,
      dockerService as never,
      acaService as never,
      sqlService as never,
      config as never,
      environmentService as never,
      progressService as never,
    );

    return { service, k8sContainerService, dockerContainerService, acaContainerService, k8sService, dockerService, acaService, sqlService };
  }

  it('routes docker platform to DockerContainerService', async () => {
    const { service, dockerContainerService, k8sContainerService, acaContainerService } = build('docker-compose');
    await service.clean('dev');
    expect(dockerContainerService.setup).toHaveBeenCalledTimes(1);
    expect(k8sContainerService.setup).not.toHaveBeenCalled();
    expect(acaContainerService.setup).not.toHaveBeenCalled();
  });

  it('routes k8s platform to K8sContainerService', async () => {
    const { service, dockerContainerService, k8sContainerService, acaContainerService } = build('k8s');
    await service.clean('dev');
    expect(k8sContainerService.setup).toHaveBeenCalledTimes(1);
    expect(dockerContainerService.setup).not.toHaveBeenCalled();
    expect(acaContainerService.setup).not.toHaveBeenCalled();
  });

  it('routes aca platform to AcaContainerService and AcaService', async () => {
    const { service, dockerContainerService, k8sContainerService, acaContainerService, acaService } = build('aca');
    await service.clean('dev');
    expect(acaContainerService.setup).toHaveBeenCalledTimes(1);
    expect(acaService.setup).toHaveBeenCalledTimes(1);
    expect(dockerContainerService.setup).not.toHaveBeenCalled();
    expect(k8sContainerService.setup).not.toHaveBeenCalled();
  });

  it('calls cleanUpAll on AcaContainerService for aca platform', async () => {
    const { service, acaContainerService } = build('aca');
    await service.clean('dev');
    expect(acaContainerService.cleanUpAll).toHaveBeenCalledTimes(1);
  });
});
