import { Inject } from '@nestjs/common';
import { Command, InquirerService } from 'nest-commander';
import { MigrateusCommand } from '../migrateus.command.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '../config/config.service.js';
import { SchemaDiffAnswers } from './schema-diff-answers.interface.js';
import chalk from 'chalk';

interface BasicCommandOptions {
  string?: string;
  boolean?: boolean;
  number?: number;
}

@Command({
  name: 'schema-diff',
  description: 'Calculate and apply schema diff between two Directus instance',
  arguments: '[from] [to]',
  argsDescription: {
    from: 'Context name from which to diff',
    to: 'Context name to which to diff',
  },
})
export class SchemaDiffCommand extends MigrateusCommand {
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
      const answers = await this.inquirer.ask<SchemaDiffAnswers>(
        'schema-diff-questions',
        {
          from,
          to,
        },
      );
      from = answers.from;
      to = answers.to;
    }
    this.logger.debug(
      `Performing schema diff from ${chalk.bold(from)} to ${chalk.bold(to)}`,
    );
    this.logger.error(`Not implemented yet`);
  }
}
