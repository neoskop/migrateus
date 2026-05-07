import { describe, it, expect } from '@jest/globals';
import { DockerBackupService } from './docker-backup.service.js';

describe('DockerBackupService', () => {
  it('is exported as a class', () => {
    expect(DockerBackupService).toBeDefined();
    expect(typeof DockerBackupService).toBe('function');
  });
});
