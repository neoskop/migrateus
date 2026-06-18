import { describe, it, expect, jest } from '@jest/globals';
import { K8sContainerService } from './k8s-container.service.js';

function makeService() {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const k8sService = {} as any;
  return new K8sContainerService(logger as any, k8sService);
}

describe('K8sContainerService', () => {
  it('is exported as a class', () => {
    expect(K8sContainerService).toBeDefined();
    expect(typeof K8sContainerService).toBe('function');
  });

  describe('copyFromDirectus()', () => {
    it('rejects with a message about docker-only support', async () => {
      const service = makeService();
      await expect(service.copyFromDirectus('/database/sqlite.db', '/tmp/out')).rejects.toThrow(
        /only supported on docker/,
      );
    });
  });

  describe('copyToDirectus()', () => {
    it('rejects with a message about docker-only support', async () => {
      const service = makeService();
      await expect(service.copyToDirectus('/tmp/in', '/database/sqlite.db')).rejects.toThrow(
        /only supported on docker/,
      );
    });
  });
});
