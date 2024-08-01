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
import tmp from 'tmp';
import fs from 'node:fs';
import { ConfigService } from '../config/config.service.js';

@Injectable()
export class K8sService {
  private kubeconfigPath: string;

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly sqlService: SqlService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
  ) {}

  public async cleanUp() {
    if (this.kubeconfigPath) {
      this.logger.debug(
        `Deleting kubeconfig at ${chalk.bold(this.kubeconfigPath)}`,
      );
      await fs.promises.unlink(this.kubeconfigPath);
    }
  }

  public async setup() {
    await this.setDefaultContext();
    await this.substituteKubeconfig();
    await this.retrieveKubeloginToken();
    this.sqlService.databaseConfig = await this.retrieveDatabaseConfig();
  }

  private async substituteKubeconfig() {
    const environment = this.environmentService.environment as K8sEnvironment;

    if (!environment.kubeconfig) {
      return;
    }

    const kubeconfigTemp = tmp.fileSync({
      prefix: 'migrateus_kubeconfig_',
    });

    const kubeconfigContent = await fs.promises.readFile(
      environment.kubeconfig,
      'utf-8',
    );
    const kubeconfigSubstitutedContent = kubeconfigContent.replaceAll(
      /\$(\w+)/g,
      (match, variable) => this.configService.envConfig[variable] || match,
    );
    await fs.promises.writeFile(
      kubeconfigTemp.name,
      kubeconfigSubstitutedContent,
    );
    this.logger.debug(
      `Substituted kubeconfig ${chalk.bold(environment.kubeconfig)} and copied to: ${chalk.bold(kubeconfigTemp.name)}`,
    );
    this.kubeconfigPath = kubeconfigTemp.name;
  }

  private async retrieveKubeloginToken() {
    const environment = this.environmentService.environment as K8sEnvironment;

    if (!environment.kubelogin) {
      return;
    }

    const env = this.kubeconfigPath
      ? { ...process.env, KUBECONFIG: this.kubeconfigPath }
      : process.env;

    const child = spawn('kubectl', ['version'], {
      env,
    });

    const port = await new Promise<string>((resolve) => {
      child.on('close', () => {
        this.logger.debug(`Already logged in via kubelogin!`);
        resolve(null);
      });
      child.stderr.on('data', (data) => {
        const match = data.toString().match(/http:\/\/localhost:(\d+)/);

        if (match) {
          resolve(match[1]);
        }
      });
    });

    if (!port) {
      return;
    }

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

    if (this.kubeconfigPath) {
      fullCommand = `KUBECONFIG=${this.kubeconfigPath} ${fullCommand}`;
    }

    this.logger.debug(
      `Running ${highlight(fullCommand, { language: 'bash' })}`,
    );
    return exec(fullCommand, options);
  }

  public async kubectlApply(spec: object) {
    let fullCommand = `echo '${JSON.stringify(spec)}' |`;

    if (this.kubeconfigPath) {
      fullCommand = `${fullCommand} KUBECONFIG=${this.kubeconfigPath}`;
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
    const env = this.kubeconfigPath
      ? { ...process.env, KUBECONFIG: this.kubeconfigPath }
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
