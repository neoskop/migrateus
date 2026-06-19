import { Injectable } from '@nestjs/common';
import chalk from 'chalk';
import { highlight } from 'cli-highlight';
import { RedactService } from '../redact/redact.service.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

type LogValue = unknown;

const LEVEL_PRIORITIES: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

@Injectable()
export class LoggerService {
  level: LogLevel = 'info';

  constructor(private readonly redactService: RedactService) {}

  log(message: LogValue, ...optionalParams: LogValue[]): void {
    this.info(message, ...optionalParams);
  }

  error(message: LogValue, ...optionalParams: LogValue[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: LogValue, ...optionalParams: LogValue[]): void {
    this.write('warn', message, optionalParams);
  }

  info(message: LogValue, ...optionalParams: LogValue[]): void {
    this.write('info', message, optionalParams);
  }

  debug(message: LogValue, ...optionalParams: LogValue[]): void {
    this.write('debug', message, optionalParams);
  }

  isDebugEnabled(): boolean {
    return this.isLevelEnabled('debug');
  }

  isLevelEnabled(level: LogLevel): boolean {
    return LEVEL_PRIORITIES[level] <= LEVEL_PRIORITIES[this.level];
  }

  private write(
    level: LogLevel,
    message: LogValue,
    optionalParams: LogValue[],
  ): void {
    if (!this.isLevelEnabled(level)) {
      return;
    }

    const formattedMessage = [message, ...optionalParams]
      .map((value) => this.formatValue(value))
      .join(' ');

    const line = `[${this.colorizeLevel(level)}]: ${formattedMessage}`;

    if (level === 'error') {
      process.stderr.write(`${line}\n`);
      return;
    }

    process.stdout.write(`${line}\n`);
  }

  private colorizeLevel(level: LogLevel): string {
    const upperLevel = level.toUpperCase();

    switch (level) {
      case 'error':
        return chalk.red(upperLevel);
      case 'warn':
        return chalk.yellow(upperLevel);
      case 'info':
        return chalk.green(upperLevel);
      case 'debug':
        return chalk.blue(upperLevel);
    }
  }

  private formatValue(value: LogValue): string {
    if (value instanceof Error) {
      return this.redactString(value.stack || value.message);
    }

    if (typeof value === 'object' && value !== null) {
      return highlight(this.stringify(value), { language: 'json' });
    }

    if (typeof value === 'string') {
      return this.redactString(value);
    }

    return String(value);
  }

  private stringify(value: object): string {
    try {
      return JSON.stringify(
        value,
        (_key, nestedValue) => {
          if (nestedValue instanceof Error) {
            return nestedValue.stack || nestedValue.message;
          }

          return nestedValue;
        },
        2,
      );
    } catch {
      return String(value);
    }
  }

  private redactString(value: string): string {
    return this.redactService.redact(value);
  }
}
