import { Inject } from '@nestjs/common';
import { Command, InquirerService } from 'nest-commander';
import { MigrateusCommand } from '../migrateus.command.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '../config/config.service.js';
import chalk from 'chalk';
import { RestoreDbAnswers } from './restore-db-answers.interface.js';

interface BasicCommandOptions {
  string?: string;
  boolean?: boolean;
  number?: number;
}

@Command({
  name: 'restore-db',
  description: 'Restore database from a local file to a Directus instance',
  arguments: '[from] [to]',
  argsDescription: {
    from: 'Path to local file',
    to: 'Environment to restore to',
  },
})
export class RestoreDbCommand extends MigrateusCommand {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    config: ConfigService,
    private readonly inquirer: InquirerService,
  ) {
    super(logger, config);
  }

  async run(params: string[], options?: BasicCommandOptions): Promise<void> {
    let [from, to] = params;

    if (!from || !to) {
      const answers = await this.inquirer.ask<RestoreDbAnswers>(
        'restore-db-questions',
        {
          from,
          to,
        },
      );
      from = answers.from || answers.fromManual;
      to = answers.to;
    }
    this.logger.debug(
      `Restoring the DB from local file ${chalk.bold(from)} to environment ${chalk.bold(to)}`,
    );
    this.logger.error(`Not implemented yet`);
  }
}
