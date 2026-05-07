import { describe, it, expect } from '@jest/globals';
import { DockerService } from './docker.service.js';

describe('DockerService', () => {
  it('is exported as a class', () => {
    expect(DockerService).toBeDefined();
    expect(typeof DockerService).toBe('function');
  });
});
