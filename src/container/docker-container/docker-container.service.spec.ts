import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockExecFn = jest.fn<
  (cmd: string, opts?: unknown) => Promise<{ code: number; stdout: string; stderr: string }>
>();

jest.unstable_mockModule('../../util/exec.js', () => ({
  exec: mockExecFn,
}));

const { DockerContainerService } = await import('./docker-container.service.js');

describe('DockerContainerService', () => {
  it('is exported as a class', () => {
    expect(DockerContainerService).toBeDefined();
    expect(typeof DockerContainerService).toBe('function');
  });

  describe('with no DOCKER_HOST (identity withHost)', () => {
    let service: InstanceType<typeof DockerContainerService>;

    beforeEach(() => {
      mockExecFn.mockReset();
      const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      const dockerService = {
        networks: ['app_network'],
        withHost: jest.fn((cmd: string) => cmd),
      };
      service = new DockerContainerService(logger as any, dockerService as any);
      service.image = 'directus/directus:latest';
    });

    it('passes unprefixed command to exec for container create', async () => {
      mockExecFn
        .mockResolvedValueOnce({ code: 0, stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.setup();

      const createCall = mockExecFn.mock.calls[0][0] as string;
      expect(createCall).toMatch(/^docker container create/);
      expect(createCall).not.toMatch(/^DOCKER_HOST=/);
    });

    it('passes unprefixed command to exec for docker start', async () => {
      mockExecFn
        .mockResolvedValueOnce({ code: 0, stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.setup();

      const startCall = mockExecFn.mock.calls[1][0] as string;
      expect(startCall).toMatch(/^docker start/);
      expect(startCall).not.toMatch(/^DOCKER_HOST=/);
    });

    it('passes unprefixed command to exec for docker exec', async () => {
      service.migrateusContainerId = 'container-id';
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: 'output', stderr: '' });

      await service.execute('echo hello');

      const execCall = mockExecFn.mock.calls[0][0] as string;
      expect(execCall).toMatch(/^docker exec/);
      expect(execCall).not.toMatch(/^DOCKER_HOST=/);
    });

    it('passes unprefixed command to exec for docker cp (exfilFile)', async () => {
      service.migrateusContainerId = 'container-id';
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.exfilFile('/tmp/source.sql', '/local/dest.sql');

      const cpCall = mockExecFn.mock.calls[0][0] as string;
      expect(cpCall).toMatch(/^docker cp/);
      expect(cpCall).not.toMatch(/^DOCKER_HOST=/);
    });

    it('passes unprefixed command to exec for docker cp (infilFile)', async () => {
      service.migrateusContainerId = 'container-id';
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.infilFile('/local/source.sql', '/tmp/dest.sql');

      const cpCall = mockExecFn.mock.calls[0][0] as string;
      expect(cpCall).toMatch(/^docker cp/);
      expect(cpCall).not.toMatch(/^DOCKER_HOST=/);
    });

    it('passes unprefixed docker rm to exec (cleanUp)', async () => {
      service.migrateusContainerId = 'container-id';
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.cleanUp();

      const rmCall = mockExecFn.mock.calls[0][0] as string;
      expect(rmCall).toMatch(/^docker rm/);
      expect(rmCall).not.toMatch(/^DOCKER_HOST=/);
    });

    it('passes unprefixed docker ps to exec (cleanUpAll)', async () => {
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.cleanUpAll();

      const psCall = mockExecFn.mock.calls[0][0] as string;
      expect(psCall).toMatch(/^docker ps/);
      expect(psCall).not.toMatch(/^DOCKER_HOST=/);
    });
  });

  describe('with DOCKER_HOST set (prefixing withHost)', () => {
    let service: InstanceType<typeof DockerContainerService>;
    const HOST_PREFIX = 'DOCKER_HOST=ssh://deploy@example';

    beforeEach(() => {
      mockExecFn.mockReset();
      const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      const dockerService = {
        networks: ['app_network'],
        withHost: jest.fn((cmd: string) => `${HOST_PREFIX} ${cmd}`),
      };
      service = new DockerContainerService(logger as any, dockerService as any);
      service.image = 'directus/directus:latest';
    });

    it('prefixes DOCKER_HOST on docker container create', async () => {
      mockExecFn
        .mockResolvedValueOnce({ code: 0, stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.setup();

      const createCall = mockExecFn.mock.calls[0][0] as string;
      expect(createCall).toMatch(/^DOCKER_HOST=ssh:\/\/deploy@example docker container create/);
    });

    it('prefixes DOCKER_HOST on docker start', async () => {
      mockExecFn
        .mockResolvedValueOnce({ code: 0, stdout: 'abc123\n', stderr: '' })
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.setup();

      const startCall = mockExecFn.mock.calls[1][0] as string;
      expect(startCall).toMatch(/^DOCKER_HOST=ssh:\/\/deploy@example docker start/);
    });

    it('prefixes DOCKER_HOST on docker exec', async () => {
      service.migrateusContainerId = 'container-id';
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: 'output', stderr: '' });

      await service.execute('echo hello');

      const execCall = mockExecFn.mock.calls[0][0] as string;
      expect(execCall).toMatch(/^DOCKER_HOST=ssh:\/\/deploy@example docker exec/);
    });

    it('prefixes DOCKER_HOST on docker cp (exfilFile)', async () => {
      service.migrateusContainerId = 'container-id';
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.exfilFile('/tmp/source.sql', '/local/dest.sql');

      const cpCall = mockExecFn.mock.calls[0][0] as string;
      expect(cpCall).toMatch(/^DOCKER_HOST=ssh:\/\/deploy@example docker cp/);
    });

    it('prefixes DOCKER_HOST on docker cp (infilFile)', async () => {
      service.migrateusContainerId = 'container-id';
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.infilFile('/local/source.sql', '/tmp/dest.sql');

      const cpCall = mockExecFn.mock.calls[0][0] as string;
      expect(cpCall).toMatch(/^DOCKER_HOST=ssh:\/\/deploy@example docker cp/);
    });

    it('prefixes DOCKER_HOST on docker rm (cleanUp)', async () => {
      service.migrateusContainerId = 'container-id';
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.cleanUp();

      const rmCall = mockExecFn.mock.calls[0][0] as string;
      expect(rmCall).toMatch(/^DOCKER_HOST=ssh:\/\/deploy@example docker rm/);
    });

    it('prefixes DOCKER_HOST on docker ps (cleanUpAll)', async () => {
      mockExecFn.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

      await service.cleanUpAll();

      const psCall = mockExecFn.mock.calls[0][0] as string;
      expect(psCall).toMatch(/^DOCKER_HOST=ssh:\/\/deploy@example docker ps/);
    });
  });
});
