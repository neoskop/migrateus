import { Inject, Injectable } from '@nestjs/common';
import { K8sEnvironment } from '../../config/environment.interface.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DirectusAssetService } from '../../directus/directus-asset/directus-asset.service.js';
import { DirectusUserService } from '../../directus/directus-user/directus-user.service.js';
import { BackupPerformer } from '../backup-performer.js';
import { ExecOutputReturnValue } from 'shelljs';
import { DatabaseConfig } from '../database-config.interface.js';
import shell from 'shelljs';
import { customAlphabet } from 'nanoid';
import chalk from 'chalk';
import portfinder from 'portfinder';
import { ChildProcess, spawn } from 'child_process';

@Injectable()
export class K8sBackupService extends BackupPerformer<K8sEnvironment> {
  private namespace: string;
  private context: string;
  private migrateusPodName: string;
  private backupDir: string;
  private directusPort: number;
  private directusPortForward: ChildProcess;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    directusUserService: DirectusUserService,
    directusAssetService: DirectusAssetService,
  ) {
    super(logger, directusUserService, directusAssetService);
  }

  protected async setup(
    environment: K8sEnvironment,
    backupDir: string,
  ): Promise<void> {
    this.namespace = environment.namespace;
    this.context = environment.context;
    this.backupDir = backupDir;
    this.migrateusPodName = `migrateus-${customAlphabet('abcdef1234567890')(6)}`;
    this.setDefaultContext();
    this.startMigrateusPod();
  }

  protected async afterMysqlDump(): Promise<void> {
    const ouput = shell.exec(
      `kubectl cp ${this.migrateusPodName}:/tmp/backup.sql ${this.backupDir}/backup.sql`,
      { silent: true },
    );

    if (ouput.code !== 0) {
      throw new Error(
        `Failed to copy ${this.migrateusPodName}:${chalk.bold('/tmp/backup.sql')} to ${chalk.bold(this.backupDir)}/backup.sql: ${ouput.stderr}`,
      );
    }
  }

  protected async getDirectusPort(): Promise<number> {
    this.directusPort = await portfinder.getPortPromise();
    const podName = shell
      .exec(`kubectl get pod -l app.kubernetes.io/name=directus -oname`, {
        silent: true,
      })
      .stdout.split('\n')[0];
    this.logger.debug(
      `Forwarding local port ${chalk.bold(this.directusPort)} to ${chalk.bold('8055')} in ${chalk.bold(podName)}`,
    );

    this.directusPortForward = spawn(
      'kubectl',
      ['port-forward', podName, `${this.directusPort}:8055`],
      {
        stdio: ['ignore', 'ignore', 'ignore'],
        detached: true,
      },
    );

    this.directusPortForward.unref();
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return this.directusPort;
  }

  protected async cleanUp(): Promise<void> {
    this.directusPortForward.kill('SIGKILL');
    this.deleteMigrateusPod();
  }

  protected executeInMigrateusContainer(
    command: string,
  ): ExecOutputReturnValue {
    this.logger.debug(
      `Executing ${chalk.bold(command)} in pod/${chalk.bold(this.migrateusPodName)}`,
    );
    return shell.exec(
      `kubectl exec ${this.migrateusPodName} -- bash -c "${command}"`,
      {
        silent: true,
      },
    );
  }

  protected getDatabaseConfig(): DatabaseConfig {
    const deployManifest = JSON.parse(
      shell.exec(`kubectl get deploy directus -ojson`, { silent: true }).stdout,
    );

    const directusContainer = deployManifest.spec.template.spec.containers.find(
      (container: { name: string }) => container.name === 'directus',
    ) as { name: string; env: { name: string; value: string }[] };

    const envMap = directusContainer.env.reduce((acc, { name, value }) => {
      acc[name] = value;
      return acc;
    }, {});

    const result = {
      host: envMap['DB_HOST'],
      port: envMap['DB_PORT'],
      user: envMap['DB_USER'],
      password: envMap['DB_PASSWORD'],
      name: envMap['DB_DATABASE'],
    };

    this.logger.debug(`Database config: ${JSON.stringify(result)}`);
    return result;
  }

  private setDefaultContext() {
    const output = shell.exec(
      `kubectl config set-context --current --namespace=${this.namespace} --context=${this.context}`,
      { silent: true },
    );

    if (output.code !== 0) {
      throw new Error(
        `Failed to set default context with code ${output.code}: ${output.stderr}`,
      );
    }
  }

  private startMigrateusPod() {
    const output = shell.exec(
      `kubectl run ${this.migrateusPodName} --image=mysql -- bash -c "sleep infinity"`,
      { silent: true },
    );

    if (output.code !== 0) {
      throw new Error(
        `Failed to start pod with code ${output.code}: ${output.stderr}`,
      );
    }

    shell.exec(
      `kubectl wait --for=condition=ready pod ${this.migrateusPodName}`,
      { silent: true },
    );
  }

  private deleteMigrateusPod() {
    this.logger.debug(`Deleting pod ${chalk.bold(this.migrateusPodName)}`);
    shell.exec(`kubectl delete pod ${this.migrateusPodName}`, { silent: true });
  }
}
