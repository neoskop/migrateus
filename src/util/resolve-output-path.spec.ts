import { describe, it, expect } from '@jest/globals';
import path from 'node:path';
import { resolveOutputPath } from './resolve-output-path.js';

describe('resolveOutputPath', () => {
  it('returns an absolute path unchanged', () => {
    expect(resolveOutputPath('/tmp/backup.tgz')).toBe('/tmp/backup.tgz');
  });

  it('resolves a relative path against the current working directory', () => {
    const result = resolveOutputPath('backup.tgz');
    expect(path.isAbsolute(result)).toBe(true);
    expect(result.endsWith('/backup.tgz')).toBe(true);
    expect(result).toBe(path.join(process.cwd(), 'backup.tgz'));
  });

  it('resolves a nested relative path', () => {
    const result = resolveOutputPath('out/backup.tgz');
    expect(result).toBe(path.join(process.cwd(), 'out/backup.tgz'));
  });
});
