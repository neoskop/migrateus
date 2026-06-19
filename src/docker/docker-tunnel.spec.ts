import { describe, it, expect, jest } from '@jest/globals';

const execMock = jest.fn<any>();
jest.unstable_mockModule('../util/exec.js', () => ({ exec: execMock }));

const { DockerService, DIRECTUS_TCP_RELAY } = await import('./docker.service.js');

function build(environment: any) {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return new DockerService(logger as any, { environment } as any, {} as any);
}

describe('DIRECTUS_TCP_RELAY', () => {
  it('connects to Directus on 127.0.0.1:8055 and bridges stdin/stdout', () => {
    expect(DIRECTUS_TCP_RELAY).toContain('connect(8055,"127.0.0.1")');
    expect(DIRECTUS_TCP_RELAY).toContain('process.stdin.pipe(c)');
    expect(DIRECTUS_TCP_RELAY).toContain('c.pipe(process.stdout)');
    // Must use double quotes only, so it survives single-quote shell wrapping.
    expect(DIRECTUS_TCP_RELAY).not.toContain("'");
  });
});

describe('DockerService.forwardDirectus', () => {
  it('returns 8055 without a tunnel for local docker (no host)', async () => {
    const service = build({ platform: 'docker', name: 'dev', containerName: 'dir1' });
    await expect(service.forwardDirectus()).resolves.toBe(8055);
  });

  it('returns 8055 for a non-ssh host (e.g. tcp://) — assumed locally reachable', async () => {
    const service = build({
      platform: 'docker',
      name: 'dev',
      containerName: 'dir1',
      host: 'tcp://127.0.0.1:2375',
    });
    await expect(service.forwardDirectus()).resolves.toBe(8055);
  });
});

describe('DockerService.relayCommand', () => {
  it('builds a host-prefixed `docker exec -i … node -e` with the relay single-quoted', () => {
    const service = build({
      platform: 'docker',
      name: 'dev',
      containerName: 'd',
      host: 'ssh://neoskop@dokploy.example.net',
    });
    (service as any).containerConfig = { Id: 'cid123' };

    const cmd = (service as any).relayCommand();
    expect(cmd).toBe(
      `DOCKER_HOST=ssh://neoskop@dokploy.example.net docker exec -i cid123 node -e '${DIRECTUS_TCP_RELAY}'`,
    );
  });
});

describe('DockerService.stopForwardDirectus', () => {
  it('is a no-op when no tunnel was opened', () => {
    const service = build({ platform: 'docker', name: 'dev', containerName: 'd' });
    expect(() => service.stopForwardDirectus()).not.toThrow();
  });

  it('closes the tunnel server when one exists', () => {
    const service = build({ platform: 'docker', name: 'dev', containerName: 'd' });
    const close = jest.fn();
    (service as any).directusTunnelServer = { close };
    service.stopForwardDirectus();
    expect(close).toHaveBeenCalledTimes(1);
    expect((service as any).directusTunnelServer).toBeUndefined();
  });
});
