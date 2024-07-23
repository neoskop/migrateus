import fs from 'node:fs';

export async function fileExists(path: string) {
  try {
    await fs.promises.access(path, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
