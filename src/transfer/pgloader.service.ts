import { Inject, Injectable } from '@nestjs/common';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { LoggerService } from '../logger/logger.service.js';
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
  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) private readonly logger: LoggerService,
  ) {}

  async run(opts: PgloaderRunOptions): Promise<void> {
    const { containerService, sqliteArtifact, pg } = opts;
    const castRules = sqliteToPgCastRules();

    const loadFile = [
      'LOAD DATABASE',
      `  FROM sqlite://${sqliteArtifact}`,
      `  INTO postgresql://${encodeURIComponent(pg.user)}:${encodeURIComponent(pg.password)}@${pg.host}:${pg.port}/${pg.name}`,
      'WITH include drop, create tables, create indexes, reset sequences',
      `SET work_mem to '128MB', maintenance_work_mem to '512MB'`,
      `${castRules};`,
    ].join('\n');

    // Write the load file via base64 round-trip to survive newline-collapsing in execute()
    const encoded = Buffer.from(loadFile).toString('base64');
    const writeResult = await containerService.execute(`echo ${encoded} | base64 -d > /tmp/migrateus.load`);
    if (writeResult.code !== 0) {
      throw new Error(`Failed to write pgloader load file with status code ${writeResult.code}: ${writeResult.stderr}`);
    }

    // Run pgloader. Surface its report — pgloader prints a per-table summary
    // (and any errors) to stdout/stderr and masks the password itself.
    const result = await containerService.execute('pgloader /tmp/migrateus.load');
    if (result.stdout) {
      this.logger.debug(`pgloader output:\n${result.stdout}`);
    }
    if (result.stderr) {
      this.logger.debug(`pgloader stderr:\n${result.stderr}`);
    }
    if (result.code !== 0) {
      throw new Error(
        `pgloader failed with status code ${result.code}:\n${result.stdout}\n${result.stderr}`,
      );
    }
  }
}
