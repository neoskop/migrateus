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
import select from '@inquirer/select';
import { OnepasswordService } from '../onepassword/onepassword.service.js';
import which from 'which';
import { OnepasswordAccount } from '../onepassword/onepassword-account.interface.js';
import { glob } from 'glob';
import path from 'node:path';
import { exec } from '../util/exec.js';
import { fileExists } from '../util/file-exists.js';

@Injectable()
export class ConfigService {
  public configFilePattern = './migrateus.{yaml,yml}';
  public configFilePath: string = null;
  public envFilePath = './.env';
  public envTemplateFilePattern = './{.env,env}.tpl';
  private config: Config = {
    environments: [],
  };
  public noAssets = false;
  public envConfig: dotenv.DotenvParseOutput;
  public force: boolean = false;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly redactService: RedactService,
    private readonly onepasswordService: OnepasswordService,
  ) {}

  public async loadConfigFile() {
    let configFilePath = this.configFilePath;

    try {
      if (!configFilePath) {
        configFilePath = await this.findFirstFileForPattern(
          this.configFilePattern,
        );

        if (!configFilePath) {
          throw new Error(
            `Config file not found for glob pattern ${chalk.bold(this.configFilePattern)}`,
          );
        }
      }

      const configFileContents = await fs.promises.readFile(
        configFilePath,
        'utf8',
      );
      await this.injectEnvFile();
      this.envConfig = await this.loadEnvFile();
      const subsitutedConfig = configFileContents.replaceAll(
        /\$(\w+)/g,
        (_match, name) => this.envConfig[name] || '',
      );
      this.config = yaml.load(subsitutedConfig) as Config;
      this.redactCredentials();
      this.logger.debug(
        `Loaded Migrateus config: ${highlight(JSON.stringify(this.config), { language: 'json' })}`,
      );
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.logger.error(
          `Config file not found: ${chalk.bold(configFilePath)}`,
        );
        process.exit(1);
      } else {
        throw err;
      }
    }
  }

  private async injectEnvFile() {
    if (await fileExists(this.envFilePath)) {
      this.logger.debug(
        `Env file already exists: ${chalk.bold(this.envFilePath)}`,
      );
      return;
    }

    const envTemplateFile = await this.findFirstFileForPattern(
      this.envTemplateFilePattern,
    );

    if (!envTemplateFile) {
      this.logger.debug(
        `Env template file does not exist for pattern: ${chalk.bold(this.envTemplateFilePattern)}`,
      );
      return;
    }

    const envTemplateFileContents = await fs.promises.readFile(
      envTemplateFile,
      'utf8',
    );

    const envFileContents = await this.processOnePasswordReferences({
      message: `The template ${envTemplateFile} file contains 1Password references. Inject those into ${this.envFilePath}?`,
      fileContents: envTemplateFileContents,
      filePath: envTemplateFile,
      exitOnReject: false,
    });

    if (!envFileContents) {
      return;
    }

    await fs.promises.writeFile(this.envFilePath, envFileContents);
    await this.checkDotenvIsIgnored();
  }

  private async checkDotenvIsIgnored() {
    const hasGitCli = await which('git');

    if (!hasGitCli) {
      return;
    }

    const envFileDir = path.dirname(this.envFilePath);
    const isInGitRepo = await this.isInGitRepository(envFileDir);

    if (!isInGitRepo) {
      this.logger.warn(
        `Env file directory ${chalk.bold(envFileDir)} is not in a Git repository. Skipping check to see if it's ignored.`,
      );
      return;
    }

    const isIgnored = await this.isFileIgnored(this.envFilePath);

    if (isIgnored) {
      this.logger.debug(
        `Env file ${chalk.bold(this.envFilePath)} is already ignored in Git.`,
      );
      return;
    }

    const basename = path.basename(this.envFilePath);
    await fs.promises.appendFile(
      path.join(envFileDir, '.gitignore'),
      `${basename}\n`,
    );

    this.logger.debug(
      `Env file ${chalk.bold(this.envFilePath)} is now ignored in Git.`,
    );
  }

  private async isInGitRepository(dir: string) {
    const { code } = await exec(`git rev-parse --is-inside-work-tree`, {
      cwd: dir,
      silent: true,
    });

    return code === 0;
  }

  private async isFileIgnored(filePath: string) {
    const { stdout } = await exec(`git check-ignore ${filePath}`, {
      silent: true,
    });
    return stdout.trim() !== '';
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

      envFileContents = await this.processOnePasswordReferences({
        message:
          'The .env file contains 1Password references. Replace them now?',
        fileContents: envFileContents,
        filePath: this.envFilePath,
        exitOnReject: true,
      });

      return dotenv.parse(envFileContents);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.debug(
          `Env file not found: ${chalk.bold(this.envFilePath)}`,
        );
        return {};
      } else {
        this.logger.error(error.message);
        process.exit(1);
      }
    }
  }

  private async processOnePasswordReferences(opts: {
    message: string;
    fileContents: string;
    filePath: string;
    exitOnReject: boolean;
  }): Promise<string> {
    const { message, filePath, exitOnReject } = opts;
    let { fileContents } = opts;
    const hasOnePasswordRefs = fileContents.includes('op://');
    const hasOpCli = await which('op');

    if (!hasOnePasswordRefs || !hasOpCli) return fileContents;

    const userConsent = await confirm({
      message,
    });

    if (!userConsent) {
      this.logger.debug('1Password injection cancelled by the user.');

      if (exitOnReject) {
        process.exit(1);
      } else {
        return null;
      }
    }

    await this.ensureOnePasswordLoggedIn();

    fileContents = await this.onepasswordService.inject(filePath);
    return fileContents;
  }

  private async ensureOnePasswordLoggedIn(): Promise<void> {
    if (this.onepasswordService.isLoggedIn()) return;

    let account: OnepasswordAccount = await this.selectOnePasswordAccount();
    const passwordPrompt = `Enter password for ${account.email} at ${account.url}`;
    const opPassword = await password({ message: passwordPrompt });

    await this.onepasswordService.login(opPassword, account);
  }

  private async selectOnePasswordAccount(): Promise<OnepasswordAccount> {
    const hasMultipleAccounts =
      await this.onepasswordService.hasMultipleAccounts();
    if (!hasMultipleAccounts) {
      return (await this.onepasswordService.getAvailableAccounts())[0];
    }

    const accountChoices = (
      await this.onepasswordService.getAvailableAccounts()
    ).map((account) => ({
      name: `${account.url} (${account.email})`,
      value: account,
    }));

    const accountSelectionMsg = 'Select your 1Password account';
    return await select({
      message: accountSelectionMsg,
      choices: accountChoices,
    });
  }

  public getSchemaDiffIgnore() {
    const schemaDiffIgnore = this.config.schemaDiff?.ignore || {};

    const collections: Set<string> = new Set();
    const fields: Record<string, string[]> = {};

    for (const [collectionName, ignore] of Object.entries(schemaDiffIgnore)) {
      if (typeof ignore === 'boolean') {
        if (ignore) {
          collections.add(collectionName);
        }
      } else {
        fields[collectionName] = ignore;
      }
    }

    return { collections, fields };
  }

  public getEnvironments() {
    return this.config.environments;
  }

  public getEnvironment(name: string) {
    return this.config.environments.find((env) => env.name === name);
  }

  private async findFirstFileForPattern(pattern: string) {
    const files = await glob(pattern);
    return files.length > 0 ? files[0] : null;
  }
}
