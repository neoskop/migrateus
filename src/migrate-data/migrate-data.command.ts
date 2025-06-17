import { Inject } from '@nestjs/common';
import { Command, InquirerService } from 'nest-commander';
import { MigrateusCommand } from '../migrateus.command.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '../config/config.service.js';
import chalk from 'chalk';
import { RedactService } from '../redact/redact.service.js';
import { DependenciesService } from '../dependencies/dependencies.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { ContainerService } from '../container/container.service.js';
import { UpdateService } from '../update/update.service.js';
import { MigrateDataAnswers } from './migrate-data-answers.interface.js';
import { MigrateDataService } from './migrate-data.service.js';

@Command({
  name: 'migrate-data',
  description:
    'Migrate data of individual collections between two Directus instances',
  arguments: '[from] [to]',
  argsDescription: {
    from: 'Source instance',
    to: 'Target instance',
  },
})
export class MigrateDataCommand extends MigrateusCommand {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    config: ConfigService,
    private readonly inquirer: InquirerService,
    protected readonly redactService: RedactService,
    private readonly migrateDataService: MigrateDataService,
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
      const answers = await this.inquirer.ask<MigrateDataAnswers>(
        'migrate-data-questions',
        {
          from,
          to,
        },
      );
      from = answers.from;
      to = answers.to;
    }
    this.logger.debug(
      `Migrate data from ${chalk.bold(from)} to ${chalk.bold(to)}`,
    );
    await this.migrateDataService.migrate(from, to);
  }
}
