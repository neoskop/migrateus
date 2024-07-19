import { CommandRunner, Option } from 'nest-commander';
import { Logger } from 'winston';
import { ConfigService } from './config/config.service.js';
import { RedactService } from './redact/redact.service.js';
import { DependenciesService } from './dependencies/dependencies.service.js';
import { ProgressService } from './progress/progress.service.js';
import { ContainerService } from './container/container.service.js';
import chalk from 'chalk';
import { ContainerModule } from './container/container.module.js';
import { UpdateService } from './update/update.service.js';

export abstract class MigrateusCommand extends CommandRunner {
  protected verbose: boolean = false;

  constructor(
    protected readonly logger: Logger,
    protected readonly config: ConfigService,
    protected readonly redactService: RedactService,
    protected readonly dependenciesService: DependenciesService,
    protected readonly progressService: ProgressService,
    protected readonly containerServices: ContainerService[],
    protected readonly updateService: UpdateService,
  ) {
    super();
  }

  @Option({
    flags: '-v, --verbose',
    description: 'Verbose information',
  })
  setVerbose() {
    this.verbose = true;
    this.logger.level = 'debug';
    this.progressService.useSpinner = false;
  }

  @Option({
    flags: '-c, --config <path>',
    description: 'path to Migrateus config file',
    defaultValue: './migrateus.{yaml,yml}',
  })
  setConfigFile(configFilePath: string) {
    this.config.configFilePath = configFilePath;
  }

  @Option({
    flags: '-e, --env <path>',
    description: 'path to env file for config substitutions',
    defaultValue: './.env',
  })
  setEnvFile(envFilePath: string) {
    this.config.envFilePath = envFilePath;
  }

  @Option({
    flags: '-s, --show-secrets',
    description: 'Show secrets in debug logs',
  })
  setShowSecrets() {
    this.redactService.enabled = false;
  }

  @Option({
    flags: '-i, --image <docker-image>',
    description: 'Set Docker image for Migrateus container',
    defaultValue: ContainerModule.DEFAULT_IMAGE,
  })
  setImage(dockerImage: string) {
    this.logger.debug(
      'Using Docker image: ' +
        chalk.bold(dockerImage) +
        ' for container services ' +
        this.containerServices
          .map((container) => chalk.bold(container.constructor.name))
          .join(', '),
    );
    this.containerServices.forEach(
      (container) => (container.image = dockerImage),
    );
  }

  abstract execute(params: string[]): Promise<void>;

  async run(params: string[]): Promise<void> {
    await this.updateService.checkForUpdates();
    await this.dependenciesService.check();
    await this.config.loadConfigFile();
    await this.execute(params);
  }
}
