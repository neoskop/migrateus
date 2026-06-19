import path from 'node:path';
import shell from 'shelljs';

/**
 * Resolves a backup output path. Absolute paths are returned unchanged;
 * relative paths are resolved against the current working directory.
 *
 * `path.join(cwd, '/tmp/x.tgz')` would mangle an absolute path into
 * `cwd/tmp/x.tgz`, so absolute paths must be handled explicitly.
 */
export function resolveOutputPath(backupFile: string): string {
  return path.isAbsolute(backupFile)
    ? backupFile
    : path.join(shell.pwd().stdout, backupFile);
}
