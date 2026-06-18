export interface DatabaseConfig {
  client?: 'mysql' | 'pg' | 'sqlite3';
  host: string;
  port: string;
  name: string;
  user: string;
  password: string;
  filename?: string;
}
