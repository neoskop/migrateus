import { describe, it, expect, jest } from '@jest/globals';
import { DockerService } from './docker.service.js';

describe('DockerService', () => {
  it('is exported as a class', () => {
    expect(DockerService).toBeDefined();
    expect(typeof DockerService).toBe('function');
  });

  describe('withHost', () => {
    function makeService(host?: string) {
      const environmentService = {
        environment: {
          platform: 'docker' as const,
          name: 'test',
          containerName: 'my-container',
          ...(host !== undefined ? { host } : {}),
        },
      };
      const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      const sqlService = {} as any;
      return new DockerService(
        logger as any,
        environmentService as any,
        sqlService,
      );
    }

    it('returns the command unchanged when host is undefined', () => {
      const service = makeService(undefined);
      expect(service.withHost('docker ps')).toBe('docker ps');
    });

    it('prefixes DOCKER_HOST when host is set', () => {
      const service = makeService('ssh://deploy@example');
      expect(service.withHost('docker ps')).toBe(
        'DOCKER_HOST=ssh://deploy@example docker ps',
      );
    });

    it('works with docker-compose environment and host set', () => {
      const environmentService = {
        environment: {
          platform: 'docker-compose' as const,
          name: 'test',
          host: 'ssh://deploy@remote.example.com',
        },
      };
      const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      const service = new DockerService(
        logger as any,
        environmentService as any,
        {} as any,
      );
      expect(service.withHost('docker compose ps')).toBe(
        'DOCKER_HOST=ssh://deploy@remote.example.com docker compose ps',
      );
    });

    it('works with docker-compose environment without host (no prefix)', () => {
      const environmentService = {
        environment: {
          platform: 'docker-compose' as const,
          name: 'test',
        },
      };
      const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      const service = new DockerService(
        logger as any,
        environmentService as any,
        {} as any,
      );
      expect(service.withHost('docker compose ps')).toBe('docker compose ps');
    });
  });
});
