import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { Config } from './config.interface.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import chalk from 'chalk';

@Injectable()
export class ConfigService {
  public path: string = './migrateus.yaml';
  private loadingConfigAttempted = false;
  private config: Config = {
    environments: [],
  };

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  private async loadConfigFile() {
    try {
      const configFileContents = await fs.promises.readFile(this.path, 'utf8');
      this.config = yaml.load(configFileContents) as Config;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.logger.error(`Config file not found: ${chalk.bold(this.path)}`);
        process.exit(1);
      } else {
        throw err;
      }
    }
  }

  public async getEnvironments() {
    if (!this.loadingConfigAttempted) {
      await this.loadConfigFile();
      this.loadingConfigAttempted = true;
    }
    return this.config.environments;
  }

  public async getEnvironment(name: string) {
    if (!this.loadingConfigAttempted) {
      await this.loadConfigFile();
      this.loadingConfigAttempted = true;
    }
    return this.config.environments.find((env) => env.name === name);
  }
}
