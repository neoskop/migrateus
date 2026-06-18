import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SchemaDiffService } from './schema-diff.service.js';

describe('SchemaDiffService', () => {
  it('is exported as a class', () => {
    expect(SchemaDiffService).toBeDefined();
    expect(typeof SchemaDiffService).toBe('function');
  });
});

describe('SchemaDiffService.setupDirectusClient — ACA platform', () => {
  type AnyMock = jest.Mock<any>;

  function build() {
    const logger = { debug: jest.fn(), warn: jest.fn(), info: jest.fn(), error: jest.fn() };

    const acaEnv = { platform: 'aca' as const };
    const dockerEnv = { platform: 'docker' as const };

    const config = {
      getEnvironment: jest.fn((name: string) => {
        if (name === 'aca-prod') return acaEnv;
        return dockerEnv;
      }) as AnyMock,
    };

    const directus = {
      getClient: jest.fn(() => ({
        request: jest.fn(async () => ({ version: '10.0.0' })) as AnyMock,
      })) as AnyMock,
    };

    const dockerService = { setup: jest.fn(async () => undefined) as AnyMock };
    const portForwardService = {
      forward: jest.fn(async () => 8055) as AnyMock,
      stop: jest.fn() as AnyMock,
    };
    const k8sService = {
      setup: jest.fn(async () => undefined) as AnyMock,
      cleanUp: jest.fn(async () => undefined) as AnyMock,
    };
    const acaService = {
      setup: jest.fn(async () => undefined) as AnyMock,
    };
    const sqlService = {
      setupDirectusUser: jest.fn(async () => undefined) as AnyMock,
      cleanUpDirectusUser: jest.fn(async () => undefined) as AnyMock,
    };
    const directusUserService = { token: 'tok' };
    const environmentService = { environment: undefined as unknown };
    const schemaDiffPromptService = {
      prompt: jest.fn(async (opts: any) => opts.diffOutput) as AnyMock,
    };
    const progressService = {
      advance: jest.fn(),
      succeed: jest.fn(),
      finish: jest.fn(),
      fail: jest.fn(),
      updateText: jest.fn(),
    };
    const errorFormatter = { format: jest.fn((e: any) => String(e)) as AnyMock };
    const acaContainerService = {
      setup: jest.fn(async () => undefined) as AnyMock,
      cleanUp: jest.fn(async () => undefined) as AnyMock,
    };

    const service = new SchemaDiffService(
      logger as never,
      config as never,
      directus as never,
      dockerService as never,
      portForwardService as never,
      k8sService as never,
      acaService as never,
      acaContainerService as never,
      sqlService as never,
      directusUserService as never,
      environmentService as never,
      schemaDiffPromptService as never,
      progressService as never,
      errorFormatter as never,
    );

    return { service, acaService, acaContainerService, k8sService, dockerService, sqlService, config };
  }

  it('calls AcaService.setup when environment platform is aca', async () => {
    const { service, acaService, k8sService, dockerService } = build();

    // diff() calls setupDirectusClient twice (from, to), but we only need to verify
    // that when the env is aca, acaService.setup is called instead of k8s/docker.
    // We trigger diff() and catch early since the clients will error; we only
    // care about which setup was called.
    await service.diff('aca-prod', 'aca-prod').catch(() => {});

    expect(acaService.setup).toHaveBeenCalled();
    expect(k8sService.setup).not.toHaveBeenCalled();
    expect(dockerService.setup).not.toHaveBeenCalled();
  });

  it('calls AcaContainerService.setup when environment platform is aca', async () => {
    const { service, acaContainerService, k8sService, dockerService } = build();

    await service.diff('aca-prod', 'aca-prod').catch(() => {});

    expect(acaContainerService.setup).toHaveBeenCalled();
    expect(k8sService.setup).not.toHaveBeenCalled();
    expect(dockerService.setup).not.toHaveBeenCalled();
  });
});
