import { Inject, Injectable } from '@nestjs/common';
import { exec } from '../util/exec.js';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { RedactService } from '../redact/redact.service.js';
import { highlight } from 'cli-highlight';
import chalk from 'chalk';
import { OnepasswordAccount } from './onepassword-account.interface.js';

@Injectable()
export class OnepasswordService {
  private sessionToken: string = null;
  private userUuid: string = null;
  private cachedAccounts: OnepasswordAccount[];

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    private readonly redactService: RedactService,
  ) {}

  public isLoggedIn() {
    return (
      this.sessionToken ||
      Object.keys(process.env).find((envName) =>
        envName.startsWith('OP_SESSION'),
      )
    );
  }

  public async getAvailableAccounts(): Promise<OnepasswordAccount[]> {
    if (this.cachedAccounts) {
      return this.cachedAccounts;
    }

    const command = `op account ls --format=json`;
    this.logger.debug(
      `Executing command: ${highlight(command, { language: 'bash' })}`,
    );
    const output = await exec(command, {
      silent: true,
    });

    if (output.code != 0) {
      throw new Error(`1Password account list failed: ${output.stderr}`);
    }

    this.cachedAccounts = JSON.parse(output.stdout);
    return this.cachedAccounts;
  }

  public async hasMultipleAccounts() {
    return (await this.getAvailableAccounts()).length > 1;
  }

  public async login(password: string, account: OnepasswordAccount) {
    this.redactService.addRedaction(password);
    let command = `echo "${password}" | op signin -f`;

    if (account) {
      command += ` --account ${account.shorthand}`;
    }

    this.logger.debug(
      `Executing command: ${highlight(command, { language: 'bash' })}`,
    );
    const signinOutput = await exec(command, {
      silent: true,
    });

    if (signinOutput.code != 0) {
      throw new Error(`1Password signin failed: ${signinOutput.stderr}`);
    }

    const match = signinOutput.stdout.match(/export OP_SESSION_(.*)="([^"]+)"/);

    if (match) {
      this.userUuid = match[1];
      this.sessionToken = match[2];
      this.redactService.addRedaction(match[2]);
      this.logger.debug(
        `Session token  ${chalk.bold(this.sessionToken)} and user uuid ${chalk.bold(this.userUuid)} extracted`,
      );
    } else {
      throw new Error('Failed to extract session token from signin output');
    }
  }

  public async inject(filePath: string) {
    const command = `${this.getTokenEnv()} op inject -i ${filePath}`;
    this.logger.debug(
      `Executing command: ${highlight(command, { language: 'bash' })}`,
    );
    const injectOutput = await exec(command, {
      silent: true,
    });

    if (injectOutput.code != 0) {
      throw new Error(`1Password inject failed: ${injectOutput.stderr}`);
    }

    return injectOutput.stdout;
  }

  private getTokenEnv() {
    return this.sessionToken
      ? `OP_SESSION_${this.userUuid}="${this.sessionToken}"`
      : '';
  }
}
