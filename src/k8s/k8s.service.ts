import { Inject, Injectable } from '@nestjs/common';
import { EnvironmentService } from '../environment/environment.service.js';
import { K8sEnvironment } from '../config/environment.interface.js';
import { SqlService } from '../sql/sql.service.js';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { exec } from '../util/exec.js';
import { ExecOptions } from 'shelljs';
import { spawn } from 'child_process';
import { highlight } from 'cli-highlight';
import chalk from 'chalk';

@Injectable()
export class K8sService {
  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly sqlService: SqlService,
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
  ) {}

  public async setup() {
    await this.setDefaultContext();
    await this.retrieveKubeloginToken();
    this.sqlService.databaseConfig = await this.retrieveDatabaseConfig();
  }

  private async retrieveKubeloginToken() {
    const environment = this.environmentService.environment as K8sEnvironment;

    if (!environment.kubelogin) {
      return;
    }

    const env = environment.kubeconfig
      ? { ...process.env, KUBECONFIG: environment.kubeconfig }
      : process.env;

    const child = spawn('kubectl', ['version'], {
      detached: true,
      env,
    });

    const port = await new Promise<string>((resolve) => {
      child.stderr.on('data', (data) => {
        const match = data.toString().match(/http:\/\/localhost:(\d+)/);

        if (match) {
          resolve(match[1]);
        }
      });
    });

    this.logger.info(
      `Open URL ${chalk.bold(`http://localhost:${port}`)} in your browser to login to the Kubernetes cluster`,
    );

    await new Promise<void>((resolve) => {
      child.on('close', () => {
        this.logger.debug(`Login completed successfully!`);
        resolve();
      });
    });
  }

  public async restartDirectus() {
    await this.kubectl('rollout restart deploy directus', { silent: true });
  }

  public async kubectl(command: string, options: ExecOptions = {}) {
    const environment = this.environmentService.environment as K8sEnvironment;
    let fullCommand = `kubectl -n ${environment.namespace} ${command}`;

    if (environment.kubeconfig) {
      fullCommand = `KUBECONFIG=${environment.kubeconfig} ${fullCommand}`;
    }

    this.logger.debug(
      `Running ${highlight(fullCommand, { language: 'bash' })}`,
    );
    return exec(fullCommand, options);
  }

  public async kubectlApply(spec: object) {
    const environment = this.environmentService.environment as K8sEnvironment;
    let fullCommand = `echo '${JSON.stringify(spec)}' |`;

    if (environment.kubeconfig) {
      fullCommand = `${fullCommand} KUBECONFIG=${environment.kubeconfig}`;
    }

    fullCommand = `${fullCommand} kubectl apply -f -`;

    this.logger.debug(
      `Running ${highlight(fullCommand, { language: 'bash' })}`,
    );
    return exec(fullCommand, { silent: true });
  }

  public portForward(
    podName: string,
    sourcePort: number | string,
    targetPort: number | string,
  ) {
    const environment = this.environmentService.environment as K8sEnvironment;
    const env = environment.kubeconfig
      ? { ...process.env, KUBECONFIG: environment.kubeconfig }
      : process.env;

    return spawn(
      'kubectl',
      [
        '-n',
        environment.namespace,
        'port-forward',
        podName,
        `${sourcePort}:${targetPort}`,
      ],
      {
        stdio: ['ignore', 'ignore', 'ignore'],
        detached: true,
        env,
      },
    );
  }

  private async setDefaultContext() {
    const env = this.environmentService.environment as K8sEnvironment;

    if (env.kubeconfig) {
      return;
    }

    const context = (this.environmentService.environment as K8sEnvironment)
      .context;

    if (context) {
      const useContextOutput = await this.kubectl(
        `config use-context ${context}`,
        { silent: true },
      );

      if (useContextOutput.code !== 0) {
        throw new Error(
          `Failed to set default context with code ${useContextOutput.code}: ${useContextOutput.stderr}`,
        );
      }
    }
  }

  protected async retrieveDatabaseConfig() {
    const deployManifest = JSON.parse(
      (await this.kubectl(`get deploy directus -ojson`, { silent: true }))
        .stdout,
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

    return result;
  }
}
