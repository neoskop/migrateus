import { Inject, Injectable } from '@nestjs/common';
import { exec } from '../util/exec.js';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { RedactService } from '../redact/redact.service.js';
import { highlight } from 'cli-highlight';
import chalk from 'chalk';

@Injectable()
export class OnepasswordService {
  private sessionToken: string = null;
  private teamShorthand: string = null;

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

  public async login(password: string) {
    this.redactService.addRedaction(password);
    const command = `echo "${password}" | op signin`;
    this.logger.debug(
      `Exectuing command: ${highlight(command, { language: 'bash' })}`,
    );
    const signinOutput = await exec(`echo "${password}" | op signin -f`, {
      silent: true,
    });

    if (signinOutput.code != 0) {
      throw new Error(`1Password signin failed: ${signinOutput.stderr}`);
    }

    const match = signinOutput.stdout.match(/export OP_SESSION_(.*)="([^"]+)"/);

    if (match) {
      this.teamShorthand = match[1];
      this.sessionToken = match[2];
      this.redactService.addRedaction(match[2]);
      this.logger.debug(
        `Session token  ${chalk.bold(this.sessionToken)} and team shorthand ${chalk.bold(this.teamShorthand)} extracted`,
      );
    } else {
      throw new Error('Failed to extract session token from signin output');
    }
  }

  public async inject(filePath: string) {
    const command = `${this.getTokenEnv()} op inject -i ${filePath}`;
    this.logger.debug(
      `Exectuing command: ${highlight(command, { language: 'bash' })}`,
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
      ? `OP_SESSION_${this.teamShorthand}="${this.sessionToken}"`
      : '';
  }
}
