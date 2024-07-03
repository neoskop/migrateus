import { CommandRunner, Option } from 'nest-commander';
import { Logger } from 'winston';
import { ConfigService } from './config/config.service.js';

export abstract class MigrateusCommand extends CommandRunner {
  protected verbose: boolean = false;

  constructor(
    protected readonly logger: Logger,
    protected readonly config: ConfigService,
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
  }

  @Option({
    flags: '-c, --config <path>',
    description: 'path to Migrateus config file',
    defaultValue: './migrateus.yaml',
  })
  setConfigFile(configPath: string) {
    this.config.configPath = configPath;
  }

  @Option({
    flags: '-e, --env <path>',
    description: 'path to env file for config substitutions',
    defaultValue: './.env',
  })
  setEnvFile(envFilePath: string) {
    this.config.envFilePath = envFilePath;
  }
}
