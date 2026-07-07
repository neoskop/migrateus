import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
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
    @Inject(LOGGER_MODULE_PROVIDER) private readonly logger: LoggerService,
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
    // `spinner` is created lazily on the first `advance()`; guard against an
    // error before any step started (e.g. setup() throwing).
    if (this.useSpinner && this.spinner) {
      this.spinner.succeed(this.currentMessage);
    }
  }

  public succeed(info: string) {
    if (this.useSpinner && this.spinner) {
      this.spinner.succeed(`${this.currentMessage}: ${info}`);
    } else {
      this.logger.info(info);
    }
  }

  public warn(warning: string) {
    if (this.useSpinner && this.spinner) {
      this.spinner.warn(
        `${this.currentMessage} finished, however: ${chalk.yellow(warning)}`,
      );
    } else {
      this.logger.warn(warning);
    }
  }

  public fail(error: Error) {
    const formattedError = chalk.red(
      error.message ||
        highlight(JSON.stringify(error, null, 2), { language: 'json' }),
    );

    // Without a started spinner, fall back to the logger so the real error
    // surfaces instead of a `Cannot read properties of undefined` TypeError.
    if (this.useSpinner && this.spinner) {
      this.spinner.fail(`${this.currentMessage} failed: ${formattedError}`);
    } else {
      this.logger.error(formattedError);
    }
  }

  public updateText(newText: string) {
    if (!this.useSpinner || !this.spinner) {
      return;
    }

    this.spinner.text = newText;
  }
}
