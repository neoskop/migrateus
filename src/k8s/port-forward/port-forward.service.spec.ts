import { describe, it, expect } from '@jest/globals';
import { PortForwardService } from './port-forward.service.js';

describe('PortForwardService', () => {
  it('is exported as a class', () => {
    expect(PortForwardService).toBeDefined();
    expect(typeof PortForwardService).toBe('function');
  });
});
