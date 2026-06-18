// NOTE: These tests exercise the storeMetadata method via a concrete subclass.
// We use fs.promises.writeFile spy to intercept what gets written without hitting the filesystem.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fs from 'node:fs';
import { BackupPerformer } from './backup-performer.js';

// Minimal concrete subclass to test the abstract class
class TestBackupPerformer extends BackupPerformer {
  protected async setup(): Promise<void> {}
  protected async getDirectusPort(): Promise<number> {
    return 8055;
  }
}

type AnyMock = jest.Mock<any>;

interface Built {
  performer: TestBackupPerformer;
  logger: { debug: AnyMock };
  sqlService: { client: string; clientImage: string; performMysqlDump: AnyMock; setupDirectusUser: AnyMock; cleanUpDirectusUser: AnyMock };
  directusVersionService: { getVersion: AnyMock };
  writeFileSpy: jest.SpiedFunction<typeof fs.promises.writeFile>;
  containerService: { setup: AnyMock; cleanUp: AnyMock; image: string };
}

function build(clientImage = 'neoskop/migrateus:latest'): Built {
  const logger = { debug: jest.fn() };
  const sqlService = {
    client: 'mysql' as const,
    clientImage,
    performMysqlDump: jest.fn(async () => undefined) as AnyMock,
    setupDirectusUser: jest.fn(async () => undefined) as AnyMock,
    cleanUpDirectusUser: jest.fn(async () => undefined) as AnyMock,
  };
  const directusVersionService = {
    getVersion: jest.fn(async () => '10.0.0') as AnyMock,
  };
  const directusAssetService = {} as never;
  const containerService = {
    setup: jest.fn(async () => undefined) as AnyMock,
    cleanUp: jest.fn(async () => undefined) as AnyMock,
    image: 'neoskop/migrateus:latest',
  };
  const config = { noAssets: true } as never;
  const progressService = {
    advance: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
    finish: jest.fn(),
    updateText: jest.fn(),
    warn: jest.fn(),
  } as never;

  const performer = new TestBackupPerformer(
    logger as never,
    directusAssetService,
    sqlService as never,
    containerService as never,
    config,
    progressService,
    directusVersionService as never,
  );

  const writeFileSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as never);

  return { performer, logger, sqlService, directusVersionService, writeFileSpy, containerService };
}

describe('BackupPerformer.storeMetadata', () => {
  let built: Built;

  beforeEach(() => {
    jest.clearAllMocks();
    built = build();
  });

  it('includes client in the written meta.json', async () => {
    const { performer, writeFileSpy } = built;
    // Call backup to trigger storeMetadata
    await performer.backup('output.tar.gz');

    const writeCall = writeFileSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('meta.json'),
    );
    expect(writeCall).toBeDefined();

    const written = JSON.parse(writeCall![1] as string);
    expect(written).toHaveProperty('client', 'mysql');
  });

  it('still includes version and timestamp in meta.json', async () => {
    const { performer, writeFileSpy } = built;
    await performer.backup('output.tar.gz');

    const writeCall = writeFileSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('meta.json'),
    );
    const written = JSON.parse(writeCall![1] as string);
    expect(written).toHaveProperty('version', '10.0.0');
    expect(written).toHaveProperty('timestamp');
  });
});

describe('BackupPerformer: containerService.image set from sqlService.clientImage before setup()', () => {
  let built: Built;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets containerService.image to sqlService.clientImage before calling containerService.setup()', async () => {
    const pgImage = 'neoskop/migrateus:latest';
    built = build(pgImage);
    const { performer, containerService } = built;

    let imageAtSetupTime: string | undefined;
    (containerService.setup as jest.Mock<any>).mockImplementation(async () => {
      imageAtSetupTime = containerService.image;
    });

    await performer.backup('output.tar.gz');

    expect(imageAtSetupTime).toBe(pgImage);
    expect(containerService.image).toBe(pgImage);
  });

  it('uses the mysql image for a mysql driver (no behavior change for existing mysql deployments)', async () => {
    const mysqlImage = 'neoskop/migrateus:latest';
    built = build(mysqlImage);
    const { performer, containerService } = built;

    let imageAtSetupTime: string | undefined;
    (containerService.setup as jest.Mock<any>).mockImplementation(async () => {
      imageAtSetupTime = containerService.image;
    });

    await performer.backup('output.tar.gz');

    expect(imageAtSetupTime).toBe(mysqlImage);
  });
});
