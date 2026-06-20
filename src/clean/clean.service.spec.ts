import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { CleanService } from './clean.service.js';

describe('CleanService', () => {
  it('is exported as a class', () => {
    expect(CleanService).toBeDefined();
    expect(typeof CleanService).toBe('function');
  });
});

describe('CleanService.clean', () => {
  type AnyMock = jest.Mock<any>;

  function build(platform = 'docker-compose') {
    const containerService = {
      setup: jest.fn(async () => undefined) as AnyMock,
      cleanUpAll: jest.fn(async () => undefined) as AnyMock,
    };
    const fakePlatform = {
      containerService,
      setup: jest.fn(async () => undefined) as AnyMock,
      teardown: jest.fn(async () => undefined) as AnyMock,
    };
    const platformResolver = {
      resolve: jest.fn(() => fakePlatform) as AnyMock,
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
      platformResolver as never,
      sqlService as never,
      config as never,
      environmentService as never,
      progressService as never,
    );

    return {
      service,
      platformResolver,
      fakePlatform,
      containerService,
      sqlService,
      progressService,
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it('resolves the platform from the environment', async () => {
    const { service, platformResolver } = build('aca');
    await service.clean('prod');
    expect(platformResolver.resolve).toHaveBeenCalledWith('aca');
  });

  it('sets up the platform and container, removes all users and containers, then tears down', async () => {
    const { service, fakePlatform, containerService, sqlService } =
      build('k8s');
    await service.clean('prod');
    expect(fakePlatform.setup).toHaveBeenCalledTimes(1);
    expect(containerService.setup).toHaveBeenCalledTimes(1);
    expect(sqlService.cleanUpAllDirectusUsers).toHaveBeenCalledWith(
      containerService,
    );
    expect(containerService.cleanUpAll).toHaveBeenCalledTimes(1);
    expect(fakePlatform.teardown).toHaveBeenCalledTimes(1);
  });

  it('orders platform setup before container setup before user cleanup', async () => {
    const { service, fakePlatform, containerService, sqlService } = build();
    const order: string[] = [];
    fakePlatform.setup.mockImplementation(async () => {
      order.push('platform');
    });
    containerService.setup.mockImplementation(async () => {
      order.push('container');
    });
    sqlService.cleanUpAllDirectusUsers.mockImplementation(async () => {
      order.push('users');
    });
    await service.clean('prod');
    expect(order).toEqual(['platform', 'container', 'users']);
  });

  it('reports failure via the progress service when a step throws', async () => {
    const { service, containerService, progressService } = build();
    containerService.cleanUpAll.mockRejectedValueOnce(new Error('boom') as never);
    await service.clean('prod');
    expect(progressService.fail).toHaveBeenCalled();
  });
});
