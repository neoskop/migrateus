import { describe, it, expect, jest } from '@jest/globals';

const execMock = jest.fn<any>();
jest.unstable_mockModule('../util/exec.js', () => ({ exec: execMock }));

const { DockerService, buildSshForwardArgs } = await import('./docker.service.js');

function build(environment: any) {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return new DockerService(logger as any, { environment } as any, {} as any);
}

describe('buildSshForwardArgs', () => {
  it('builds a local -L forward for an ssh:// host with user', () => {
    const args = buildSshForwardArgs(
      'ssh://neoskop@dokploy.example.net',
      54321,
      '10.0.1.5:8055',
    );
    expect(args).toEqual([
      '-N',
      '-L',
      '127.0.0.1:54321:10.0.1.5:8055',
      '-o',
      'ExitOnForwardFailure=yes',
      '-o',
      'StrictHostKeyChecking=accept-new',
      'neoskop@dokploy.example.net',
    ]);
  });

  it('adds -p for a non-default ssh port and works without a user', () => {
    const args = buildSshForwardArgs('ssh://host.local:2222', 6000, 'localhost:32768');
    expect(args).toContain('-p');
    expect(args[args.indexOf('-p') + 1]).toBe('2222');
    expect(args).toContain('127.0.0.1:6000:localhost:32768');
    // last arg is the ssh target (no user@)
    expect(args[args.length - 1]).toBe('host.local');
  });
});

describe('DockerService.forwardDirectus', () => {
  it('returns 8055 without opening a tunnel for local docker (no host)', async () => {
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

describe('DockerService.resolveTunnelTarget', () => {
  it('prefers a host-published 8055 mapping when present', () => {
    const service = build({ platform: 'docker', name: 'dev', containerName: 'd' });
    (service as any).containerConfig = {
      NetworkSettings: {
        Networks: { 'dokploy-network': { IPAddress: '10.0.1.5' } },
        Ports: { '8055/tcp': [{ HostIp: '0.0.0.0', HostPort: '32768' }] },
      },
    };
    expect((service as any).resolveTunnelTarget()).toBe('localhost:32768');
  });

  it('falls back to the container IP on its first network when 8055 is not published', () => {
    const service = build({ platform: 'docker', name: 'dev', containerName: 'd' });
    (service as any).containerConfig = {
      NetworkSettings: {
        Networks: { 'dokploy-network': { IPAddress: '10.0.1.5' } },
      },
    };
    expect((service as any).resolveTunnelTarget()).toBe('10.0.1.5:8055');
  });

  it('throws a clear error when neither a published port nor a container IP is available', () => {
    const service = build({ platform: 'docker', name: 'dev', containerName: 'd' });
    (service as any).containerConfig = {
      NetworkSettings: { Networks: { net: {} } },
    };
    expect(() => (service as any).resolveTunnelTarget()).toThrow(
      /container address/i,
    );
  });
});

describe('DockerService.stopForwardDirectus', () => {
  it('is a no-op when no tunnel was opened', () => {
    const service = build({ platform: 'docker', name: 'dev', containerName: 'd' });
    expect(() => service.stopForwardDirectus()).not.toThrow();
  });

  it('kills the tunnel process when one exists', () => {
    const service = build({ platform: 'docker', name: 'dev', containerName: 'd' });
    const kill = jest.fn();
    (service as any).directusTunnel = { kill };
    service.stopForwardDirectus();
    expect(kill).toHaveBeenCalledWith('SIGKILL');
    expect((service as any).directusTunnel).toBeUndefined();
  });
});
