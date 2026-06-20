import fs from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import tmp from 'tmp';
import prettyBytes from 'pretty-bytes';
import { resolveOutputPath } from './resolve-output-path.js';
import { fileExists } from './file-exists.js';
import { exec } from './exec.js';

/**
 * Shared staging-directory and tar archive helpers used by every backup/restore
 * performer. Previously each of the four performers (and the restore command's
 * format peek) carried its own copy of this logic, which drifted: the physical
 * restore path silently ignored tar's exit code while the logical path checked
 * it. Consolidating here makes the behaviour uniform.
 */

const PREFIX = 'migrateus-';

/**
 * Create a staging directory.
 *
 * `mode` differs by caller: the physical path uses `0o777` because the dumped
 * artifacts are produced by a uid-1000 sidecar bind-mounted into this dir; the
 * logical path uses `0o700` because the process writes the staging files itself
 * and they include `directus_users` password hashes, so no world access.
 *
 * `unsafeCleanup` lets `tmp` remove the (non-empty) directory on process exit as
 * a backstop; callers still remove it explicitly via {@link removeWorkDir}.
 */
export function createWorkDir(mode: number): string {
  return tmp.dirSync({ mode, prefix: PREFIX, unsafeCleanup: true }).name;
}

/** Remove a staging directory and everything in it. */
export async function removeWorkDir(dir: string): Promise<void> {
  await exec(`rm -rf ${dir}`, { silent: true });
}

/**
 * Tar+gzip the contents of `dir` into `outFile` and return the human-readable
 * archive size. Relative `outFile` paths are resolved against the cwd.
 */
export async function createArchive(
  dir: string,
  outFile: string,
): Promise<string> {
  const targetPath = resolveOutputPath(outFile);
  const output = await exec(`tar -czf ${targetPath} *`, {
    silent: true,
    cwd: dir,
  });

  if (output.code !== 0) {
    throw new Error(
      `Failed to create backup archive ${chalk.bold(targetPath)}: ${chalk.red(output.stderr)}`,
    );
  }

  const { size } = await fs.promises.stat(targetPath);
  return prettyBytes(size);
}

/**
 * Extract `file` into `dir`, optionally limited to specific archive members.
 * Throws on a non-zero tar exit code (the previous physical-restore path
 * swallowed this, hiding corrupt/unreadable archives).
 */
export async function extractArchive(
  file: string,
  dir: string,
  members: string[] = [],
): Promise<void> {
  const memberArgs = members.length ? ` ${members.join(' ')}` : '';
  const output = await exec(`tar -xf ${file} -C ${dir}${memberArgs}`, {
    silent: true,
  });

  if (output.code !== 0) {
    throw new Error(
      `Failed to extract backup archive ${chalk.bold(file)}: ${chalk.red(output.stderr)}`,
    );
  }
}

/**
 * Read just `meta.json` out of an archive and return its `format`. Returns
 * `undefined` when the archive has no `meta.json` (e.g. an older physical
 * archive) — such archives are treated as non-logical by callers.
 */
export async function peekArchiveFormat(
  file: string,
): Promise<string | undefined> {
  const dir = createWorkDir(0o700);
  try {
    // A physical archive may not contain meta.json; tar then exits non-zero.
    await extractArchive(file, dir, ['meta.json']);
    const metaPath = join(dir, 'meta.json');
    if (!(await fileExists(metaPath))) {
      return undefined;
    }
    const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
    return meta.format;
  } catch {
    return undefined;
  } finally {
    await removeWorkDir(dir);
  }
}
