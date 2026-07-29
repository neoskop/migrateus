import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { EventEmitter } from 'node:events';
import { PortForwardService } from './port-forward.service.js';

describe('PortForwardService', () => {
  it('is exported as a class', () => {
    expect(PortForwardService).toBeDefined();
    expect(typeof PortForwardService).toBe('function');
  });
});

class FakeForward extends EventEmitter {
  public readonly kill = jest.fn((_signal?: string) => true);
  public readonly unref = jest.fn();
  public readonly stderr = null;
}

function build() {
  const logger = { debug: jest.fn(), warn: jest.fn() };
  const spawned: FakeForward[] = [];
  const k8sService = {
    kubectl: jest.fn(async () => ({ stdout: 'pod/directus-1\n' })),
    portForward: jest.fn(() => {
      const forward = new FakeForward();
      spawned.push(forward);
      return forward;
    }),
  };
  const service = new PortForwardService(logger as never, k8sService as never);
  return { service, spawned, logger };
}

describe('PortForwardService.forward', () => {
  // Each spawn waits 5s for the tunnel to settle; don't sit through it.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function forward(service: PortForwardService) {
    const pending = service.forward();
    await jest.advanceTimersByTimeAsync(6000);
    return pending;
  }

  it('re-forwards the same local port when kubectl drops the tunnel', async () => {
    const { service, spawned } = build();

    const port = await forward(service);
    // The API server drops the idle connection while a prompt is open.
    spawned[0].emit('exit', 1, null);
    await jest.advanceTimersByTimeAsync(6000);

    expect(spawned).toHaveLength(2);
    // Same local port, so URLs already handed to the Directus SDK stay valid.
    const forwards = (service as unknown as { forwards: Map<number, unknown> })
      .forwards;
    expect(forwards.has(port)).toBe(true);
  });

  it('does not re-forward the exit that stop() caused', async () => {
    const { service, spawned } = build();

    await forward(service);
    service.stop();
    spawned[0].emit('exit', null, 'SIGKILL');
    await jest.advanceTimersByTimeAsync(6000);

    expect(spawned).toHaveLength(1);
    expect(spawned[0].kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('gives up after a bounded number of restarts instead of respawning forever', async () => {
    const { service, spawned, logger } = build();

    await forward(service);
    for (let attempt = 0; attempt < 6; attempt++) {
      spawned[spawned.length - 1].emit('exit', 1, null);
      await jest.advanceTimersByTimeAsync(6000);
    }

    expect(spawned).toHaveLength(4); // initial + MAX_RESTARTS
    expect(logger.warn).toHaveBeenCalled();
  });
});
