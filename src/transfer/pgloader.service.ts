import { Injectable } from '@nestjs/common';
import { ContainerService } from '../container/container.service.js';
import { sqliteToPgCastRules } from './directus-cast-rules.js';

export interface PgloaderRunOptions {
  containerService: ContainerService;
  sqliteArtifact: string;
  pg: {
    host: string;
    port: string;
    user: string;
    password: string;
    name: string;
  };
}

@Injectable()
export class PgloaderService {
  async run(opts: PgloaderRunOptions): Promise<void> {
    const { containerService, sqliteArtifact, pg } = opts;
    const castRules = sqliteToPgCastRules();

    const loadFile = [
      'LOAD DATABASE',
      `  FROM sqlite://${sqliteArtifact}`,
      `  INTO postgresql://${pg.user}:${pg.password}@${pg.host}:${pg.port}/${pg.name}`,
      'WITH include drop, create tables, create indexes, reset sequences',
      `SET work_mem to '128MB', maintenance_work_mem to '512MB'`,
      `${castRules};`,
    ].join('\n');

    // Write the load file into the container via heredoc
    const writeCmd = `cat > /tmp/migrateus.load <<'PGEOF'\n${loadFile}\nPGEOF`;
    await containerService.execute(writeCmd);

    // Run pgloader
    const result = await containerService.execute('pgloader /tmp/migrateus.load');
    if (result.code !== 0) {
      throw new Error(`pgloader failed with status code ${result.code}: ${result.stderr}`);
    }
  }
}
