import { Injectable } from '@nestjs/common';

export type TransferMode = 'native' | 'pgloader';

@Injectable()
export class TransferPlanner {
  plan(
    source: 'mysql' | 'pg' | 'sqlite3',
    target: 'mysql' | 'pg' | 'sqlite3',
  ): { mode: TransferMode } {
    if (source === target) return { mode: 'native' };
    if (target === 'pg') {
      if (source === 'mysql')
        throw new Error(
          'MySQL→Postgres transfer is not yet supported (pgloader cannot read a mysqldump file; temp-MySQL shim deferred)',
        );
      return { mode: 'pgloader' }; // sqlite3 -> pg
    }
    throw new Error(
      `Cross-engine transfer ${source}→${target} is unsupported (pgloader only targets Postgres)`,
    );
  }
}
