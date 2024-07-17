import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { Config } from './config.interface.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { highlight } from 'cli-highlight';
import { RedactService } from '../redact/redact.service.js';
import password from '@inquirer/password';
import confirm from '@inquirer/confirm';
import { OnepasswordService } from '../onepassword/onepassword.service.js';
import which from 'which';

@Injectable()
export class ConfigService {
  public configPath: string = './migrateus.yaml';
  public envFilePath = './.env';
  private config: Config = {
    environments: [],
  };
  public noAssets = false;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly redactService: RedactService,
    private readonly onepasswordService: OnepasswordService,
  ) {}

  public async loadConfigFile() {
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
      this.redactCredentials();
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
  private redactCredentials() {
    for (const env of this.config.environments) {
      if (!env.credentials) {
        continue;
      }

      for (const credential of env.credentials) {
        this.redactService.addRedaction(credential.password);
        this.redactService.addRedaction(credential.token);
      }
    }
  }

  private async loadEnvFile() {
    try {
      let envFileContents = await fs.promises.readFile(
        this.envFilePath,
        'utf8',
      );

      if (envFileContents.includes('op://') && (await which('op'))) {
        const replaceOpCredentials = await confirm({
          message:
            'The .env file seems to contain 1Password references. Do you want to replace them now?',
        });

        if (!replaceOpCredentials) {
          process.exit(1);
        }

        if (!this.onepasswordService.isLoggedIn()) {
          const opPassword = await password({
            message: 'Enter your 1Password account password',
          });

          await this.onepasswordService.login(opPassword);
        }

        envFileContents = await this.onepasswordService.inject(
          this.envFilePath,
        );
      }

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
    return this.config.environments;
  }

  public async getEnvironment(name: string) {
    return this.config.environments.find((env) => env.name === name);
  }
}
