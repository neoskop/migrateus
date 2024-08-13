import { Inject } from '@nestjs/common';
import { Option, Command, InquirerService } from 'nest-commander';
import { MigrateusCommand } from '../migrateus.command.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '../config/config.service.js';
import chalk from 'chalk';
import { RestoreDbAnswers } from './restore-db-answers.interface.js';
import { DockerRestoreService } from './docker-restore/docker-restore.service.js';
import { K8sRestoreService } from './k8s-restore/k8s-restore.service.js';
import { EnvironmentService } from '../environment/environment.service.js';
import { RedactService } from '../redact/redact.service.js';
import { DependenciesService } from '../dependencies/dependencies.service.js';
import { ProgressService } from '../progress/progress.service.js';
import confirm from '@inquirer/confirm';
import { ContainerService } from '../container/container.service.js';
import { UpdateService } from '../update/update.service.js';

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
    private readonly dockerRestoreService: DockerRestoreService,
    private readonly k8sRestoreService: K8sRestoreService,
    private readonly environmentService: EnvironmentService,
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

  @Option({
    flags: '-n, --no-assets',
    description: "Don't restore assets",
  })
  setNoAssets() {
    this.config.noAssets = true;
  }

  @Option({
    flags: '-f, --force',
    description: "Don't check for version differences",
  })
  setForce() {
    this.config.force = true;
  }

  async execute(params: string[]): Promise<void> {
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

    const environment = await this.config.getEnvironment(to);
    this.environmentService.environment = environment;

    this.logger.debug(
      `Restoring the DB from local file ${chalk.bold(from)} to environment ${chalk.bold(to)}`,
    );

    if (environment.doubleCheck) {
      const answer = await confirm({
        message: `Are you sure you want ${chalk.red('REPLACE')} the database in the environment ${chalk.red(to)}?`,
        default: false,
      });

      if (!answer) {
        process.exit(0);
      }
    }

    if (environment.platform === 'docker') {
      await this.dockerRestoreService.restore(from);
    } else {
      await this.k8sRestoreService.restore(from);
    }
  }
}
