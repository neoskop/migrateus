import { Inject } from '@nestjs/common';
import { Command, InquirerService } from 'nest-commander';
import { MigrateusCommand } from '../migrateus.command.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '../config/config.service.js';
import chalk from 'chalk';
import { CleanService } from './clean.service.js';
import { CleanAnswers } from './clean-answers.interface.js';
import { RedactService } from '../redact/redact.service.js';
import { DependenciesService } from '../dependencies/dependencies.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { ContainerService } from '../container/container.service.js';
import { UpdateService } from '../update/update.service.js';

@Command({
  name: 'clean',
  description: 'Clean remains of the database backup from an environment',
  arguments: '[environment]',
  argsDescription: {
    environment: 'Environment to clean',
  },
})
export class CleanCommand extends MigrateusCommand {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    config: ConfigService,
    private readonly inquirer: InquirerService,
    private readonly cleanService: CleanService,
    protected readonly redactService: RedactService,
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
    let [environment] = params;

    if (!environment) {
      const answers = await this.inquirer.ask<CleanAnswers>('clean-questions', {
        environment,
      });
      environment = answers.environment;
    }
    this.logger.debug(`Cleaning environment ${chalk.bold(environment)}`);

    try {
      await this.cleanService.clean(environment);
    } catch (err) {
      this.logger.error(
        `Cleaning of the environment ${chalk.bold(environment)} failed:`,
        err,
      );
    }
  }
}
