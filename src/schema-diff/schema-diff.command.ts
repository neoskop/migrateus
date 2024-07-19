import { Inject } from '@nestjs/common';
import { Command, InquirerService } from 'nest-commander';
import { MigrateusCommand } from '../migrateus.command.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '../config/config.service.js';
import { SchemaDiffAnswers } from './schema-diff-answers.interface.js';
import chalk from 'chalk';
import { RedactService } from '../redact/redact.service.js';
import { SchemaDiffService } from './schema-diff.service.js';
import { DependenciesService } from '../dependencies/dependencies.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { ContainerService } from '../container/container.service.js';
import { UpdateService } from '../update/update.service.js';

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
    protected readonly redactService: RedactService,
    private readonly schemaDiffService: SchemaDiffService,
    protected readonly dependenciesService: DependenciesService,
    protected readonly progressService: ProgressService,
    @Inject('ContainerServices')
    protected readonly containerServices: ContainerService[],
    protected readonly updateService: UpdateService,
  ) {
    super(
      logger,
      config,
      redactService,
      dependenciesService,
      progressService,
      containerServices,
      updateService,
    );
  }

  async execute(params: string[]): Promise<void> {
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
    await this.schemaDiffService.diff(from, to);
  }
}
