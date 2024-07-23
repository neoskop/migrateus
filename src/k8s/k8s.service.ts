import { Inject, Injectable } from '@nestjs/common';
import { EnvironmentService } from '../environment/environment.service.js';
import { K8sEnvironment } from '../config/environment.interface.js';
import { SqlService } from '../sql/sql.service.js';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { exec } from '../util/exec.js';
import { ExecOptions } from 'shelljs';
import { spawn } from 'child_process';

@Injectable()
export class K8sService {
  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly sqlService: SqlService,
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
  ) {}

  public async setup() {
    await this.setDefaultContext();
    this.sqlService.databaseConfig = await this.retrieveDatabaseConfig();
  }

  public async restartDirectus() {
    await this.kubectl('rollout restart deploy directus', { silent: true });
  }

  public async kubectl(command: string, options: ExecOptions = {}) {
    const environment = this.environmentService.environment as K8sEnvironment;
    let fullCommand = `kubectl ${command}`;

    if (environment.kubeconfig) {
      fullCommand = `KUBECONFIG=${environment.kubeconfig} ${fullCommand}`;
    }

    return exec(fullCommand, options);
  }

  public async kubectlApply(spec: object) {
    const environment = this.environmentService.environment as K8sEnvironment;
    let fullCommand = `echo '${JSON.stringify(spec)}' | kubectl apply -f -`;

    if (environment.kubeconfig) {
      fullCommand = `KUBECONFIG=${environment.kubeconfig} ${fullCommand}`;
    }

    return exec(fullCommand, { silent: true });
  }

  portForward(
    podName: string,
    sourcePort: number | string,
    targetPort: number | string,
  ) {
    const environment = this.environmentService.environment as K8sEnvironment;
    let command = `kubectl`;

    if (environment.kubeconfig) {
      command = `KUBECONFIG=${environment.kubeconfig} ${command}`;
    }

    return spawn(
      command,
      ['port-forward', podName, `${sourcePort}:${targetPort}`],
      {
        stdio: ['ignore', 'ignore', 'ignore'],
        detached: true,
      },
    );
  }

  private async setDefaultContext() {
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

    const namespace = (this.environmentService.environment as K8sEnvironment)
      .namespace;

    if (namespace) {
      const setContestOutput = await this.kubectl(
        `config set-context --current --namespace=${namespace} --context=${context}`,
        { silent: true },
      );

      if (setContestOutput.code !== 0) {
        throw new Error(
          `Failed to set namespace to ${namespace} of context ${context} with code ${setContestOutput.code}: ${setContestOutput.stderr}`,
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
