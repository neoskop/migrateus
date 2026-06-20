import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PlatformResolver } from './platform-resolver.service.js';
import { DockerPlatform } from './docker.platform.js';
import { K8sPlatform } from './k8s.platform.js';
import { AcaPlatform } from './aca.platform.js';

const logger = { debug: jest.fn(), warn: jest.fn() } as any;

function makeResolver() {
  const dockerService = {
    setup: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    forwardDirectus: jest.fn<() => Promise<number>>().mockResolvedValue(9001),
    stopForwardDirectus: jest.fn(),
    restartDirectus: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as any;
  const k8sService = {
    setup: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    cleanUp: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    restartDirectus: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as any;
  const acaService = {
    setup: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    restartDirectus: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as any;
  const portForwardService = {
    forward: jest.fn<() => Promise<number>>().mockResolvedValue(9002),
    stop: jest.fn(),
  } as any;
  const resolver = new PlatformResolver(
    logger,
    dockerService,
    k8sService,
    acaService,
    portForwardService,
  );
  return { resolver, dockerService, k8sService, acaService, portForwardService };
}

describe('PlatformResolver', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves docker and docker-compose to a DockerPlatform', () => {
    const { resolver } = makeResolver();
    expect(resolver.resolve('docker')).toBeInstanceOf(DockerPlatform);
    expect(resolver.resolve('docker-compose')).toBeInstanceOf(DockerPlatform);
  });

  it('resolves aca to an AcaPlatform', () => {
    const { resolver } = makeResolver();
    expect(resolver.resolve('aca')).toBeInstanceOf(AcaPlatform);
  });

  it('resolves k8s (the default) to a K8sPlatform', () => {
    const { resolver } = makeResolver();
    expect(resolver.resolve('k8s')).toBeInstanceOf(K8sPlatform);
  });

  it('returns a fresh instance per call', () => {
    const { resolver } = makeResolver();
    expect(resolver.resolve('docker')).not.toBe(resolver.resolve('docker'));
  });
});

describe('Platform.connect', () => {
  beforeEach(() => jest.clearAllMocks());

  it('docker: setup then forwardDirectus, returning the forwarded port', async () => {
    const { resolver, dockerService } = makeResolver();
    const platform = resolver.resolve('docker');
    const { port, containerService } = await platform.connect();
    expect(dockerService.setup).toHaveBeenCalledTimes(1);
    expect(dockerService.forwardDirectus).toHaveBeenCalledTimes(1);
    expect(port).toBe(9001);
    expect(containerService).toBe(platform.containerService);
  });

  it('aca: connects on the fixed Directus port without forwarding', async () => {
    const { resolver, acaService } = makeResolver();
    const { port } = await resolver.resolve('aca').connect();
    expect(acaService.setup).toHaveBeenCalledTimes(1);
    expect(port).toBe(8055);
  });

  it('k8s: setup then port-forward', async () => {
    const { resolver, k8sService, portForwardService } = makeResolver();
    const { port } = await resolver.resolve('k8s').connect();
    expect(k8sService.setup).toHaveBeenCalledTimes(1);
    expect(portForwardService.forward).toHaveBeenCalledTimes(1);
    expect(port).toBe(9002);
  });
});

describe('Platform.teardown / restartDirectus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('docker teardown stops the forward; restart restarts directus', async () => {
    const { resolver, dockerService } = makeResolver();
    const platform = resolver.resolve('docker');
    await platform.teardown();
    await platform.restartDirectus();
    expect(dockerService.stopForwardDirectus).toHaveBeenCalledTimes(1);
    expect(dockerService.restartDirectus).toHaveBeenCalledTimes(1);
  });

  it('k8s teardown stops the port-forward and cleans up', async () => {
    const { resolver, k8sService, portForwardService } = makeResolver();
    await resolver.resolve('k8s').teardown();
    expect(portForwardService.stop).toHaveBeenCalledTimes(1);
    expect(k8sService.cleanUp).toHaveBeenCalledTimes(1);
  });

  it('aca teardown is a no-op', async () => {
    const { resolver } = makeResolver();
    await expect(resolver.resolve('aca').teardown()).resolves.toBeUndefined();
  });
});
