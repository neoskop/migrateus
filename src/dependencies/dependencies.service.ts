import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import chalk from 'chalk';
import which from 'which';

@Injectable()
export class DependenciesService {
  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
  ) {}

  public async check() {
    await Promise.all(
      ['kubectl', 'docker', 'tar'].map(this.checkCommand.bind(this)),
    );
  }

  private async checkCommand(command: string) {
    try {
      await which(command);
    } catch (e) {
      this.logger.error(
        `Needed dependency ${chalk.bold(command)} not found. Please install it.`,
      );
      process.exit(1);
    }
  }
}
