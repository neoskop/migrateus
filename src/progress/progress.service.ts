import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { highlight } from 'cli-highlight';

@Injectable()
export class ProgressService {
  public useSpinner: boolean = true;
  private spinner: Ora;
  private currentMessage: string;
  public indent = 0;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  public advance(message: string) {
    this.currentMessage = message;

    if (!this.useSpinner) {
      this.logger.info(message);
      return;
    }

    if (this.spinner) {
      this.startNewStep(message);
    } else {
      this.spinner = ora({ indent: this.indent, text: message }).start();
    }
  }

  private startNewStep(message: string) {
    if (this.spinner.isSpinning) {
      this.spinner.succeed();
    }
    this.spinner.start(message);
  }

  public finish() {
    if (this.useSpinner) {
      this.spinner.succeed(this.currentMessage);
    }
  }

  public succeed(info: string) {
    if (this.useSpinner) {
      this.spinner.succeed(`${this.currentMessage}: ${info}`);
    } else {
      this.logger.info(info);
    }
  }

  public warn(warning: string) {
    if (this.useSpinner) {
      this.spinner.warn(
        `${this.currentMessage} finished, however: ${chalk.yellow(warning)}`,
      );
    } else {
      this.logger.warn(warning);
    }
  }

  public fail(error: Error) {
    if (this.useSpinner) {
      this.spinner.fail(
        `${this.currentMessage} failed: ${chalk.red(error.message || highlight(JSON.stringify(error, null, 2), { language: 'json' }))}`,
      );
    } else {
      this.logger.error(error);
    }
  }

  public updateText(newText: string) {
    if (!this.useSpinner) {
      return;
    }

    this.spinner.text = newText;
  }
}
