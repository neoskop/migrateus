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

/** Extract the base64 payload from the write command and decode it back to the load file string. */
function decodeLoadFileFromWriteCmd(cmd: string): string {
  const match = cmd.match(/echo\s+([A-Za-z0-9+/=]+)\s+\|\s+base64\s+-d\s+>/);
  if (!match) throw new Error(`No base64 write command found in: ${cmd}`);
  return Buffer.from(match[1], 'base64').toString('utf8');
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

  it('write command uses base64 round-trip (no heredoc)', async () => {
    const containerService = makeContainerService();
    await service.run({
      containerService: containerService as never,
      sqliteArtifact: '/tmp/backup.sqlite',
      pg: { host: 'pg-host', port: '5432', user: 'pguser', password: 'pgpass', name: 'pgdb' },
    });

    const allCommands: string[] = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    const writeCmd = allCommands.find((cmd) => cmd.includes('base64 -d > /tmp/migrateus.load'));
    expect(writeCmd).toBeDefined();
    // Must not contain literal newlines (safe through newline-collapsing execute)
    expect(writeCmd).not.toContain('\n');
  });

  it('decoded load file contains FROM sqlite:// reference to the artifact', async () => {
    const containerService = makeContainerService();
    await service.run({
      containerService: containerService as never,
      sqliteArtifact: '/tmp/backup.sqlite',
      pg: { host: 'pg-host', port: '5432', user: 'pguser', password: 'pgpass', name: 'pgdb' },
    });

    const allCommands: string[] = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    const writeCmd = allCommands.find((cmd) => cmd.includes('base64 -d > /tmp/migrateus.load'))!;
    const loadFile = decodeLoadFileFromWriteCmd(writeCmd);
    expect(loadFile).toContain('FROM sqlite:///tmp/backup.sqlite');
  });

  it('decoded load file contains INTO postgresql:// with pg credentials', async () => {
    const containerService = makeContainerService();
    await service.run({
      containerService: containerService as never,
      sqliteArtifact: '/tmp/backup.sqlite',
      pg: { host: 'pg-host', port: '5432', user: 'pguser', password: 'pgpass', name: 'pgdb' },
    });

    const allCommands: string[] = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    const writeCmd = allCommands.find((cmd) => cmd.includes('base64 -d > /tmp/migrateus.load'))!;
    const loadFile = decodeLoadFileFromWriteCmd(writeCmd);
    expect(loadFile).toContain('INTO postgresql://pguser:pgpass@pg-host:5432/pgdb');
  });

  it('decoded load file contains the cast rules', async () => {
    const containerService = makeContainerService();
    await service.run({
      containerService: containerService as never,
      sqliteArtifact: '/tmp/backup.sqlite',
      pg: { host: 'pg-host', port: '5432', user: 'pguser', password: 'pgpass', name: 'pgdb' },
    });

    const allCommands: string[] = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    const writeCmd = allCommands.find((cmd) => cmd.includes('base64 -d > /tmp/migrateus.load'))!;
    const loadFile = decodeLoadFileFromWriteCmd(writeCmd);
    expect(loadFile).toContain('to boolean');
    expect(loadFile).toContain('to timestamptz');
  });

  it('percent-encodes special characters in the PG password', async () => {
    const containerService = makeContainerService();
    await service.run({
      containerService: containerService as never,
      sqliteArtifact: '/tmp/backup.sqlite',
      pg: { host: 'pg-host', port: '5432', user: 'pguser', password: 'p@ss/w$rd', name: 'pgdb' },
    });

    const allCommands: string[] = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    const writeCmd = allCommands.find((cmd) => cmd.includes('base64 -d > /tmp/migrateus.load'))!;
    const loadFile = decodeLoadFileFromWriteCmd(writeCmd);
    // Must contain the percent-encoded form
    expect(loadFile).toContain('p%40ss%2Fw%24rd');
    // Must NOT contain the raw special chars in the credential position
    // (raw @ or / between user: and @host would break URL parsing)
    const intoLine = loadFile.split('\n').find((l) => l.includes('INTO postgresql://'))!;
    const credentialsPart = intoLine.match(/INTO postgresql:\/\/([^@]+)@/)![1];
    expect(credentialsPart).not.toContain('@');
    expect(credentialsPart).not.toContain('/');
  });

  it('percent-encodes special characters in the PG user', async () => {
    const containerService = makeContainerService();
    await service.run({
      containerService: containerService as never,
      sqliteArtifact: '/tmp/backup.sqlite',
      pg: { host: 'pg-host', port: '5432', user: 'user@domain', password: 'pgpass', name: 'pgdb' },
    });

    const allCommands: string[] = containerService.execute.mock.calls.map((c: any[]) => c[0] as string);
    const writeCmd = allCommands.find((cmd) => cmd.includes('base64 -d > /tmp/migrateus.load'))!;
    const loadFile = decodeLoadFileFromWriteCmd(writeCmd);
    expect(loadFile).toContain('user%40domain');
  });

  it('throws with the status code and stderr when pgloader exits non-zero', async () => {
    const containerService = makeContainerService((cmd) => {
      if (cmd.includes('pgloader') && !cmd.includes('base64')) {
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

  it('throws when the write command exits non-zero', async () => {
    const containerService = makeContainerService((cmd) => {
      if (cmd.includes('base64 -d')) {
        return { code: 1, stdout: '', stderr: 'write failed' };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    await expect(
      service.run({
        containerService: containerService as never,
        sqliteArtifact: '/tmp/backup.sqlite',
        pg: { host: 'pg-host', port: '5432', user: 'pguser', password: 'pgpass', name: 'pgdb' },
      }),
    ).rejects.toThrow('Failed to write pgloader load file with status code 1: write failed');
  });
});
