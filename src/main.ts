#!/usr/bin/env node

import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module.js';
import which from 'which';

(async () => {
  const cliCommand = 'migrateus';
  const cliExecutable = await which('migrateus');

  const app = await CommandFactory.createWithoutRunning(AppModule, {
    errorHandler: () => {
      process.exit(1);
    },
    completion: {
      cmd: cliCommand,
      fig: false,
      nativeShell: {
        executablePath: cliExecutable,
      },
    },
    logger: ['error', 'warn'],
  });

  await CommandFactory.runApplication(app);
})();
