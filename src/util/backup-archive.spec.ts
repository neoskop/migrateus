import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import { join } from 'node:path';
import {
  createWorkDir,
  removeWorkDir,
  createArchive,
  extractArchive,
  peekArchiveFormat,
} from './backup-archive.js';

describe('backup-archive', () => {
  let work: string;

  beforeEach(() => {
    work = createWorkDir(0o700);
  });

  afterEach(async () => {
    await removeWorkDir(work);
  });

  it('createWorkDir returns an existing directory named with the migrateus- prefix', () => {
    expect(fs.existsSync(work)).toBe(true);
    expect(work).toContain('migrateus-');
  });

  it('removeWorkDir deletes the directory', async () => {
    const dir = createWorkDir(0o700);
    expect(fs.existsSync(dir)).toBe(true);
    await removeWorkDir(dir);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('createArchive then extractArchive round-trips the contents', async () => {
    await fs.promises.writeFile(join(work, 'hello.txt'), 'world');
    const archive = join(work, '..', `${work.split('/').pop()}.tgz`);

    const size = await createArchive(work, archive);
    expect(typeof size).toBe('string');
    expect(fs.existsSync(archive)).toBe(true);

    const out = createWorkDir(0o700);
    try {
      await extractArchive(archive, out);
      expect(await fs.promises.readFile(join(out, 'hello.txt'), 'utf8')).toBe(
        'world',
      );
    } finally {
      await removeWorkDir(out);
      await fs.promises.rm(archive, { force: true });
    }
  });

  it('extractArchive throws on a non-existent archive', async () => {
    await expect(
      extractArchive(join(work, 'does-not-exist.tgz'), work),
    ).rejects.toThrow(/Failed to extract backup archive/);
  });

  it('peekArchiveFormat returns the format recorded in meta.json', async () => {
    await fs.promises.writeFile(
      join(work, 'meta.json'),
      JSON.stringify({ format: 'logical' }),
    );
    const archive = join(work, '..', `${work.split('/').pop()}-peek.tgz`);
    await createArchive(work, archive);
    try {
      expect(await peekArchiveFormat(archive)).toBe('logical');
    } finally {
      await fs.promises.rm(archive, { force: true });
    }
  });

  it('peekArchiveFormat returns undefined when the archive has no meta.json', async () => {
    await fs.promises.writeFile(join(work, 'data.txt'), 'no meta here');
    const archive = join(work, '..', `${work.split('/').pop()}-nometa.tgz`);
    await createArchive(work, archive);
    try {
      expect(await peekArchiveFormat(archive)).toBeUndefined();
    } finally {
      await fs.promises.rm(archive, { force: true });
    }
  });
});
