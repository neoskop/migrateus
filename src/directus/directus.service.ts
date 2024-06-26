import { createDirectus, staticToken, rest } from '@directus/sdk';
import { Inject, Injectable } from '@nestjs/common';
import chalk from 'chalk';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class DirectusService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  public getClient(port: number, token: string) {
    this.logger.debug(
      `Connecting to Directus at http://localhost:${port} with token ${chalk.bold(token)}`,
    );
    return createDirectus(`http://localhost:${port}`, {
      globals: { logger: this.logger },
    })
      .with(staticToken(token))
      .with(rest());
  }
}
