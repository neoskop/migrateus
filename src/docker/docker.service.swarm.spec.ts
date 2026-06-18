import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const execMock = jest.fn<any>();
jest.unstable_mockModule('../util/exec.js', () => ({ exec: execMock }));

const { DockerService } = await import('./docker.service.js');

function build(environment: any) {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return new DockerService(logger as any, { environment } as any, {} as any);
}

const inspectJson = JSON.stringify([
  { Config: { Env: [] }, NetworkSettings: { Networks: {} }, State: {} },
]);

describe('DockerService swarm `service` resolution', () => {
  beforeEach(() => execMock.mockReset());

  it('resolves a `service` to its running task container id over DOCKER_HOST, then inspects it', async () => {
    execMock
      .mockResolvedValueOnce({ code: 0, stdout: 'abc123\n', stderr: '' }) // docker ps --filter
      .mockResolvedValueOnce({ code: 0, stdout: inspectJson, stderr: '' }); // docker inspect

    const service = build({
      platform: 'docker',
      name: 'dev',
      host: 'ssh://neoskop@dokploy.neoskop.net',
      service: 'stiebeleltron-directus-0kawnq',
    });

    const config = await (service as any).getContainerConfig();
    expect(config).toBeDefined();

    const psCmd = execMock.mock.calls[0][0] as string;
    expect(psCmd).toContain('DOCKER_HOST=ssh://neoskop@dokploy.neoskop.net');
    expect(psCmd).toContain(
      'docker ps --filter "label=com.docker.swarm.service.name=stiebeleltron-directus-0kawnq"',
    );

    const inspectCmd = execMock.mock.calls[1][0] as string;
    expect(inspectCmd).toContain('docker inspect abc123');
  });

  it('prefers an explicit containerName over service', async () => {
    execMock.mockResolvedValueOnce({ code: 0, stdout: inspectJson, stderr: '' });

    const service = build({
      platform: 'docker',
      name: 'dev',
      containerName: 'fixed-name',
      service: 'svc-x',
    });

    await (service as any).getContainerConfig();
    expect(execMock.mock.calls[0][0]).toContain('docker inspect fixed-name');
  });

  it('throws when no running container is found for the service', async () => {
    execMock.mockResolvedValueOnce({ code: 0, stdout: '\n', stderr: '' });

    const service = build({ platform: 'docker', name: 'dev', service: 'svc-x' });
    await expect((service as any).getContainerConfig()).rejects.toThrow(
      /No running container found for service/,
    );
  });

  it('throws when neither containerName nor service is set', async () => {
    const service = build({ platform: 'docker', name: 'dev' });
    await expect((service as any).getContainerConfig()).rejects.toThrow(
      /requires either `containerName` or `service`/,
    );
  });
});

describe('DockerService.ensureDatabaseContainerIsRunning', () => {
  beforeEach(() => execMock.mockReset());

  it('is a no-op for a file-based (sqlite) env with no host — never lists/starts containers', async () => {
    const service = build({ platform: 'docker', name: 'dev', service: 'svc' });
    (service as any).containerConfig = {
      Config: { Env: ['DB_CLIENT=sqlite3', 'DB_FILENAME=/database/sqlite.db'] },
    };
    (service as any).networks = ['dokploy-network'];

    await (service as any).ensureDatabaseContainerIsRunning();

    expect(execMock).not.toHaveBeenCalled();
  });
});
