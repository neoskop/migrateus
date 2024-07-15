import { Inject } from '@nestjs/common';
import { Option, Command, InquirerService } from 'nest-commander';
import { MigrateusCommand } from '../migrateus.command.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '../config/config.service.js';
import chalk from 'chalk';
import { BackupDbAnswers } from './backup-db-answers.interface.js';
import { BackupDbService } from './backup-db.service.js';
import { RedactService } from '../redact/redact.service.js';
import { DependenciesService } from '../dependencies/dependencies.service.js';
import { ProgressService } from '../progress/progress.service.js';

@Command({
  name: 'backup-db',
  description: 'Backup database from a local file to a Directus instance',
  arguments: '[from] [to]',
  argsDescription: {
    from: 'Path to local file',
    to: 'Environment to backup to',
  },
})
export class BackupDbCommand extends MigrateusCommand {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    config: ConfigService,
    private readonly inquirer: InquirerService,
    private readonly backupDbService: BackupDbService,
    protected readonly redactService: RedactService,
    protected readonly dependenciesService: DependenciesService,
    protected readonly progressService: ProgressService,
  ) {
    super(logger, config, redactService, dependenciesService, progressService);
  }

  @Option({
    flags: '-n, --no-assets',
    description: "Don't backup assets",
  })
  setNoAssets() {
    this.config.noAssets = true;
  }

  async execute(params: string[]): Promise<void> {
    let [from, to] = params;

    if (!from || !to) {
      const answers = await this.inquirer.ask<BackupDbAnswers>(
        'backup-db-questions',
        {
          from,
          to,
        },
      );
      from = answers.from;
      to = answers.to;
    }
    this.logger.debug(
      `Backup up the DB from environment ${chalk.bold(from)} to the local file ${chalk.bold(to)}`,
    );

    try {
      await this.backupDbService.backup(from, to);
    } catch (err) {
      this.logger.error('Backup of the database failed:', err);
    }
  }
}
