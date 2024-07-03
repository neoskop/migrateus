import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { Config } from './config.interface.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { highlight } from 'cli-highlight';

@Injectable()
export class ConfigService {
  public configPath: string = './migrateus.yaml';
  public envFilePath = './.env';
  private loadingConfigAttempted = false;
  private config: Config = {
    environments: [],
  };
  public noAssets = false;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  private async loadConfigFile() {
    try {
      const configFileContents = await fs.promises.readFile(
        this.configPath,
        'utf8',
      );
      const envConfig = await this.loadEnvFile();
      const subsitutedConfig = configFileContents.replaceAll(
        /\$(\w+)/g,
        (_match, name) => envConfig[name] || '',
      );
      this.config = yaml.load(subsitutedConfig) as Config;
      this.logger.debug(
        `Loaded Migrateus config: ${highlight(JSON.stringify(this.config), { language: 'json' })}`,
      );
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.logger.error(
          `Config file not found: ${chalk.bold(this.configPath)}`,
        );
        process.exit(1);
      } else {
        throw err;
      }
    }
  }

  private async loadEnvFile() {
    try {
      const envFileContents = await fs.promises.readFile(
        this.envFilePath,
        'utf8',
      );
      return dotenv.parse(envFileContents);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.logger.debug(
          `Env file not found: ${chalk.bold(this.envFilePath)}`,
        );
        return {};
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
