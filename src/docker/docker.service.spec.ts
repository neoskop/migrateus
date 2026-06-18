import { describe, it, expect, jest } from '@jest/globals';
import { DockerService } from './docker.service.js';
import type { ContainerConfig } from './container-config.type.js';

function makeServiceWithContainerEnv(envArray: string[]) {
  const containerConfig: Partial<ContainerConfig> = {
    Config: { Env: envArray },
  };
  const environmentService = {
    environment: {
      platform: 'docker' as const,
      name: 'test',
      containerName: 'my-container',
    },
  };
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const sqlService = {} as any;
  const service = new DockerService(
    logger as any,
    environmentService as any,
    sqlService,
  );
  service.containerConfig = containerConfig as ContainerConfig;
  return service;
}

describe('DockerService', () => {
  it('is exported as a class', () => {
    expect(DockerService).toBeDefined();
    expect(typeof DockerService).toBe('function');
  });

  describe('databaseConfig', () => {
    it('includes client when DB_CLIENT is present in container env', () => {
      const service = makeServiceWithContainerEnv([
        'DB_HOST=db.example.com',
        'DB_PORT=5432',
        'DB_DATABASE=mydb',
        'DB_USER=admin',
        'DB_PASSWORD=s3cret',
        'DB_CLIENT=pg',
      ]);

      expect(service.databaseConfig.client).toBe('pg');
    });

    it('omits client when DB_CLIENT is absent from container env', () => {
      const service = makeServiceWithContainerEnv([
        'DB_HOST=db.example.com',
        'DB_PORT=5432',
        'DB_DATABASE=mydb',
        'DB_USER=admin',
        'DB_PASSWORD=s3cret',
      ]);

      expect(service.databaseConfig.client).toBeUndefined();
    });

    it('includes filename when DB_FILENAME is present in container env', () => {
      const service = makeServiceWithContainerEnv([
        'DB_HOST=localhost',
        'DB_PORT=0',
        'DB_DATABASE=',
        'DB_USER=',
        'DB_PASSWORD=',
        'DB_CLIENT=sqlite3',
        'DB_FILENAME=/data/db.sqlite',
      ]);

      expect(service.databaseConfig.filename).toBe('/data/db.sqlite');
    });

    it('omits filename when DB_FILENAME is absent from container env', () => {
      const service = makeServiceWithContainerEnv([
        'DB_HOST=db.example.com',
        'DB_PORT=5432',
        'DB_DATABASE=mydb',
        'DB_USER=admin',
        'DB_PASSWORD=s3cret',
      ]);

      expect(service.databaseConfig.filename).toBeUndefined();
    });

    it('does not throw when DB_CLIENT is absent (required fields still present)', () => {
      const service = makeServiceWithContainerEnv([
        'DB_HOST=db.example.com',
        'DB_PORT=5432',
        'DB_DATABASE=mydb',
        'DB_USER=admin',
        'DB_PASSWORD=s3cret',
      ]);

      expect(() => service.databaseConfig).not.toThrow();
    });

    it('still includes required fields alongside client', () => {
      const service = makeServiceWithContainerEnv([
        'DB_HOST=db.example.com',
        'DB_PORT=5432',
        'DB_DATABASE=mydb',
        'DB_USER=admin',
        'DB_PASSWORD=s3cret',
        'DB_CLIENT=mysql',
      ]);

      const config = service.databaseConfig;
      expect(config.host).toBe('db.example.com');
      expect(config.port).toBe('5432');
      expect(config.name).toBe('mydb');
      expect(config.user).toBe('admin');
      expect(config.password).toBe('s3cret');
      expect(config.client).toBe('mysql');
    });
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
