import { describe, it, expect } from '@jest/globals';
import { platformKey, selectByPlatform } from './platform-key.js';

describe('platformKey', () => {
  it('maps docker and docker-compose to "docker"', () => {
    expect(platformKey('docker')).toBe('docker');
    expect(platformKey('docker-compose')).toBe('docker');
  });

  it('maps aca to "aca"', () => {
    expect(platformKey('aca')).toBe('aca');
  });

  it('defaults anything else to "k8s"', () => {
    expect(platformKey('k8s')).toBe('k8s');
  });
});

describe('selectByPlatform', () => {
  const choices = { docker: 'D', aca: 'A', k8s: 'K' };

  it('picks the docker value for docker platforms', () => {
    expect(selectByPlatform('docker', choices)).toBe('D');
    expect(selectByPlatform('docker-compose', choices)).toBe('D');
  });

  it('picks the aca value for aca', () => {
    expect(selectByPlatform('aca', choices)).toBe('A');
  });

  it('picks the k8s value as the default', () => {
    expect(selectByPlatform('k8s', choices)).toBe('K');
  });
});
