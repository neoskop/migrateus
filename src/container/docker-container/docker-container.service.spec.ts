import { describe, it, expect } from '@jest/globals';
import { DockerContainerService } from './docker-container.service.js';

describe('DockerContainerService', () => {
  it('is exported as a class', () => {
    expect(DockerContainerService).toBeDefined();
    expect(typeof DockerContainerService).toBe('function');
  });
});
