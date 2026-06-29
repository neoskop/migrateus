import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SchemaDiffService } from './schema-diff.service.js';

describe('SchemaDiffService', () => {
  it('is exported as a class', () => {
    expect(SchemaDiffService).toBeDefined();
    expect(typeof SchemaDiffService).toBe('function');
  });
});

describe('SchemaDiffService.setupDirectusClient — platform resolution', () => {
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

    // Every resolved platform is the same stub so we can assert connect/teardown
    // ran. connect() returns the forwarded port + a container handle, exactly as
    // the real Platform does — this is what was missing on the docker/aca paths
    // and caused the ECONNREFUSED (port 8055 was used without forwarding).
    const platform = {
      connect: jest.fn(async () => ({
        port: 9001,
        containerService: { execInDirectus: jest.fn() },
      })) as AnyMock,
      teardown: jest.fn(async () => undefined) as AnyMock,
    };
    const platformResolver = {
      resolve: jest.fn(() => platform) as AnyMock,
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

    const service = new SchemaDiffService(
      logger as never,
      config as never,
      directus as never,
      platformResolver as never,
      sqlService as never,
      directusUserService as never,
      environmentService as never,
      schemaDiffPromptService as never,
      progressService as never,
      errorFormatter as never,
    );

    return { service, platform, platformResolver, directus, sqlService, config };
  }

  it('resolves a platform and connects (forwarding Directus) for each environment', async () => {
    const { service, platform, platformResolver } = build();

    await service.diff('aca-prod', 'aca-prod').catch(() => {});

    expect(platformResolver.resolve).toHaveBeenCalledWith('aca');
    expect(platform.connect).toHaveBeenCalled();
  });

  it('builds the Directus client with the forwarded port, not the hard-coded 8055', async () => {
    const { service, directus } = build();

    await service.diff('dev', 'dev').catch(() => {});

    expect(directus.getClient).toHaveBeenCalledWith(9001, 'tok');
  });

  it('tears the platform down during cleanup', async () => {
    const { service, platform } = build();

    await service.diff('dev', 'dev').catch(() => {});

    expect(platform.teardown).toHaveBeenCalled();
  });
});
