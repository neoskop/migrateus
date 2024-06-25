#!/usr/bin/env node

import { CommandFactory, CompletionFactory } from 'nest-commander';
import { AppModule } from './app.module.js';
import which from 'which';

(async () => {
  const cliCommand = 'migrateus';
  const cliExecutable = await which('migrateus');

  const app = await CommandFactory.createWithoutRunning(AppModule, {
    completion: {
      cmd: cliCommand,
      fig: true,
      nativeShell: {
        executablePath: cliExecutable,
      },
    },
    logger: ['error', 'warn'],
  });

  CompletionFactory.registerCompletionCommand(app, {
    cmd: cliCommand,
    fig: true,
    nativeShell: {
      executablePath: cliExecutable,
    },
  });

  await CommandFactory.runApplication(app);
})();
