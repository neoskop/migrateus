import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { createDirectus, staticToken, rest } from '@directus/sdk';
import { Inject, Injectable } from '@nestjs/common';
import chalk from 'chalk';

@Injectable()
export class DirectusService {
  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) private readonly logger: LoggerService,
  ) {}

  public getClient(port: number, token: string) {
    this.logger.debug(
      `Connecting to Directus at http://localhost:${port} with token ${chalk.bold(token)}`,
    );
    return createDirectus(`http://localhost:${port}`, {
      globals: { logger: this.logger, fetch: this.fetch.bind(this) },
    })
      .with(staticToken(token))
      .with(rest());
  }

  private fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const { method = 'GET' } = options;
    const methodUpper = method.toUpperCase();

    const formattedUrl = chalk.bold(url);
    const formattedMethod =
      methodUpper === 'DELETE'
        ? chalk.red(methodUpper)
        : methodUpper === 'PUT'
          ? chalk.yellow(methodUpper)
          : methodUpper === 'PATCH'
            ? chalk.green(methodUpper)
            : methodUpper === 'HEAD'
              ? chalk.blue(methodUpper)
              : chalk.white(methodUpper);

    this.logger.debug(
      `Directus SDK request: ${formattedMethod} ${formattedUrl}`,
    );

    return fetch(url, options);
  }
}
