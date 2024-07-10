import { Inject, Injectable } from '@nestjs/common';
import chalk from 'chalk';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import which from 'which';
import { Logger } from 'winston';

@Injectable()
export class DependenciesService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
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
