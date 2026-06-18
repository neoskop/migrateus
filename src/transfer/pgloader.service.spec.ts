import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PgloaderService } from './pgloader.service.js';

type AnyMock = jest.Mock<any>;

interface ExecOutput {
  code: number;
  stdout: string;
  stderr: string;
}

function makeContainerService(execImpl?: (cmd: string) => ExecOutput): { execute: AnyMock } {
  return {
    execute: jest.fn(async (cmd: string) =>
      execImpl ? execImpl(cmd) : ({ code: 0, stdout: '', stderr: '' } satisfies ExecOutput),
    ) as AnyMock,
  };
}

describe('PgloaderService.run', () => {
  let service: PgloaderService;

  beforeEach(() => {
    service = new PgloaderService();
    jest.clearAllMocks();
  });

  it('executes a command containing "pgloader"', async () => {
    const containerService = makeContainerService();
    await service.run({
      containerService: containerService as never,
      sqliteArtifact: '/tmp/backup.sqlite',
      pg: { host: 'pg-host', port: '5432', user: 'pguser', password: 'pgpass', name: 'pgdb' },
    });

    const allCommands: string[] = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    expect(allCommands.some((cmd) => cmd.includes('pgloader'))).toBe(true);
  });

  it('load file content includes FROM sqlite:// reference to the artifact', async () => {
    const containerService = makeContainerService();
    await service.run({
      containerService: containerService as never,
      sqliteArtifact: '/tmp/backup.sqlite',
      pg: { host: 'pg-host', port: '5432', user: 'pguser', password: 'pgpass', name: 'pgdb' },
    });

    const allCommands: string[] = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    expect(allCommands.some((cmd) => cmd.includes('FROM sqlite:///tmp/backup.sqlite'))).toBe(true);
  });

  it('load file content includes INTO postgresql:// with pg credentials', async () => {
    const containerService = makeContainerService();
    await service.run({
      containerService: containerService as never,
      sqliteArtifact: '/tmp/backup.sqlite',
      pg: { host: 'pg-host', port: '5432', user: 'pguser', password: 'pgpass', name: 'pgdb' },
    });

    const allCommands: string[] = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    expect(
      allCommands.some((cmd) => cmd.includes('INTO postgresql://pguser:pgpass@pg-host:5432/pgdb')),
    ).toBe(true);
  });

  it('load file content includes the cast rules', async () => {
    const containerService = makeContainerService();
    await service.run({
      containerService: containerService as never,
      sqliteArtifact: '/tmp/backup.sqlite',
      pg: { host: 'pg-host', port: '5432', user: 'pguser', password: 'pgpass', name: 'pgdb' },
    });

    const allCommands: string[] = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    expect(allCommands.some((cmd) => cmd.includes('to boolean'))).toBe(true);
    expect(allCommands.some((cmd) => cmd.includes('to timestamptz'))).toBe(true);
  });

  it('throws with the status code and stderr when pgloader exits non-zero', async () => {
    const containerService = makeContainerService((cmd) => {
      if (cmd.includes('pgloader')) {
        return { code: 1, stdout: '', stderr: 'pgloader: connection refused' };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    await expect(
      service.run({
        containerService: containerService as never,
        sqliteArtifact: '/tmp/backup.sqlite',
        pg: { host: 'pg-host', port: '5432', user: 'pguser', password: 'pgpass', name: 'pgdb' },
      }),
    ).rejects.toThrow('pgloader failed with status code 1: pgloader: connection refused');
  });
});
