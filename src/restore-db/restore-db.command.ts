import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { Option, Command, InquirerService } from 'nest-commander';
import { MigrateusCommand } from '../migrateus.command.js';
import { ConfigService } from '../config/config.service.js';
import chalk from 'chalk';
import { RestoreDbAnswers } from './restore-db-answers.interface.js';
import { DockerRestoreService } from './docker-restore/docker-restore.service.js';
import { K8sRestoreService } from './k8s-restore/k8s-restore.service.js';
import { AcaRestoreService } from './aca-restore/aca-restore.service.js';
import { EnvironmentService } from '../environment/environment.service.js';
import { RedactService } from '../redact/redact.service.js';
import { DependenciesService } from '../dependencies/dependencies.service.js';
import { ProgressService } from '../progress/progress.service.js';
import confirm from '@inquirer/confirm';
import { ContainerService } from '../container/container.service.js';
import { UpdateService } from '../update/update.service.js';
import { LogicalRestorePerformer } from './logical-restore.performer.js';
import { join } from 'node:path';
import fs from 'node:fs';
import tmp from 'tmp';
import { fileExists } from '../util/file-exists.js';
import { exec } from '../util/exec.js';

@Injectable()
@Command({
  name: 'restore-db',
  description: 'Restore database from a local file to a Directus instance',
  arguments: '[from] [to]',
  argsDescription: {
    from: 'Path to local file',
    to: 'Environment to restore to',
  },
})
export class RestoreDbCommand extends MigrateusCommand {
  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) logger: LoggerService,
    config: ConfigService,
    private readonly inquirer: InquirerService,
    private readonly dockerRestoreService: DockerRestoreService,
    private readonly k8sRestoreService: K8sRestoreService,
    private readonly acaRestoreService: AcaRestoreService,
    private readonly logicalRestorePerformer: LogicalRestorePerformer,
    private readonly environmentService: EnvironmentService,
    protected readonly redactService: RedactService,
    protected readonly dependenciesService: DependenciesService,
    protected readonly progressService: ProgressService,
    @Inject('ContainerServices')
    protected readonly containerServices: ContainerService[],
    protected readonly updateService: UpdateService,
  ) {
    super(
      logger,
      config,
      redactService,
      dependenciesService,
      progressService,
      containerServices,
      updateService,
    );
  }

  @Option({
    flags: '-n, --no-assets',
    description: "Don't restore assets",
  })
  setNoAssets() {
    this.config.noAssets = true;
  }

  @Option({
    flags: '-f, --force',
    description: "Don't check for version differences",
  })
  setForce() {
    this.config.force = true;
  }

  async execute(params: string[]): Promise<void> {
    let [from, to] = params;

    if (!from || !to) {
      const answers = await this.inquirer.ask<RestoreDbAnswers>(
        'restore-db-questions',
        {
          from,
          to,
        },
      );
      from = answers.from || answers.fromManual;
      to = answers.to;
    }

    const environment = this.config.getEnvironment(to);
    this.environmentService.environment = environment;

    this.logger.debug(
      `Restoring the DB from local file ${chalk.bold(from)} to environment ${chalk.bold(to)}`,
    );

    if (environment.doubleCheck) {
      const answer = await confirm({
        message: `Are you sure you want ${chalk.red('REPLACE')} the database in the environment ${chalk.red(to)}?`,
        default: false,
      });

      if (!answer) {
        process.exit(0);
      }
    }

    // Logical backups carry `meta.format === 'logical'`; they restore via the
    // SDK (schema apply + ordered item import) regardless of platform. Peek the
    // archive's meta.json before dispatching to the physical platform branch.
    if ((await this.peekBackupFormat(from)) === 'logical') {
      await this.logicalRestorePerformer.restore(from, to);
      return;
    }

    if (environment.platform.startsWith('docker')) {
      await this.dockerRestoreService.restore(from);
    } else if (environment.platform === 'aca') {
      await this.acaRestoreService.restore(from);
    } else {
      await this.k8sRestoreService.restore(from);
    }
  }

  /** Extract just `meta.json` from the archive and return its `format` (or undefined). */
  private async peekBackupFormat(
    backupFile: string,
  ): Promise<string | undefined> {
    const tempDir = tmp.dirSync({ mode: 0o700, prefix: 'migrateus-' }).name;
    try {
      await exec(`tar -xf ${backupFile} -C ${tempDir} meta.json`, {
        silent: true,
      });
      const metaPath = join(tempDir, 'meta.json');
      if (!(await fileExists(metaPath))) {
        return undefined;
      }
      const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
      return meta.format;
    } catch {
      // A physical archive may not contain meta.json — treat as non-logical.
      return undefined;
    } finally {
      await exec(`rm -rf ${tempDir}`, { silent: true });
    }
  }
}
