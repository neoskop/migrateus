import { ExecOutputReturnValue } from 'shelljs';

export type Exec = (command: string) => Promise<ExecOutputReturnValue>;

export interface DbDriver {
  readonly client: 'mysql' | 'pg' | 'sqlite3';

  dump(exec: Exec, artifact: string, tables?: string[]): Promise<void>;
  restore(exec: Exec, artifact: string): Promise<void>;
  postRestoreFixups(exec: Exec): Promise<void>;

  listTables(exec: Exec): Promise<string[]>;

  executeSql(exec: Exec, sql: string): Promise<string>;

  escapeString(value: string): string;
  escapeIdentifier(identifier: string): string;
  assertSafeIdentifier(identifier: string, context: string): string;

  boolLiteral(value: boolean): string;
  deleteOne(table: string, where: string): string;
  disableFks(): string;
  enableFks(): string;
}
