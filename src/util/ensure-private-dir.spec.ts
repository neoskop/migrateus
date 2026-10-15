import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensurePrivateDir } from './backup-archive.js';

describe('ensurePrivateDir', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'epd-'));

  it('creates the directory with mode 0700', async () => {
    const dir = path.join(base, 'new');
    await ensurePrivateDir(dir);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('tightens an existing group/world-accessible directory', async () => {
    const dir = path.join(base, 'loose');
    fs.mkdirSync(dir, { mode: 0o777 });
    fs.chmodSync(dir, 0o777);
    await ensurePrivateDir(dir);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('rejects a symlink', async () => {
    const dir = path.join(base, 'link');
    fs.symlinkSync(base, dir);
    await expect(ensurePrivateDir(dir)).rejects.toThrow(/Refusing/);
  });
});
