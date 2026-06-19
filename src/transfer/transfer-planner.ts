import { Injectable } from '@nestjs/common';

export type TransferMode = 'native';

@Injectable()
export class TransferPlanner {
  plan(
    source: 'mysql' | 'pg' | 'sqlite3',
    target: 'mysql' | 'pg' | 'sqlite3',
  ): { mode: TransferMode } {
    if (source === target) return { mode: 'native' };
    throw new Error(
      "This is a physical backup; cross-DBMS restore needs a logical backup — re-run 'backup-db -l' on the source.",
    );
  }
}
