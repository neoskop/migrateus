import { Injectable } from '@nestjs/common';
import { RedactOptions } from './redact-options.interface.js';
import { Redaction } from './redaction.interface.js';
import chalk from 'chalk';

@Injectable()
export class RedactService {
  private readonly REDACTION = chalk.bgGrey('[REDACTED]');
  private readonly EXCEPTIONS = ['directus'];
  private redactions: Redaction[] = [];
  public enabled = true;

  public addRedaction(text: string, options?: RedactOptions): void {
    if (!text || text.length === 0 || this.EXCEPTIONS.includes(text)) {
      return;
    }

    this.redactions.push({ text, options });
  }

  public redact(text: string): string {
    if (
      !this.enabled ||
      !text ||
      typeof text !== 'string' ||
      text.length === 0
    ) {
      return text;
    }

    for (const redaction of this.redactions) {
      if (
        redaction.options &&
        (redaction.options.prefix || redaction.options.suffix)
      ) {
        text = text.replaceAll(
          redaction.text,
          (redaction.options.prefix || '') +
            this.REDACTION +
            (redaction.options.suffix || ''),
        );
      } else {
        text = text.replaceAll(redaction.text, this.REDACTION);
      }
    }

    return text;
  }
}
