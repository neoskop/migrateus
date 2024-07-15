import { Inject, Injectable } from '@nestjs/common';
import { EnvironmentService } from '../environment/environment.service.js';
import { K8sEnvironment } from '../config/environment.interface.js';
import { SqlService } from '../sql/sql.service.js';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { exec } from '../util/exec.js';

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

  private async setDefaultContext() {
    const context = (this.environmentService.environment as K8sEnvironment)
      .context;
    const namespace = (this.environmentService.environment as K8sEnvironment)
      .namespace;
    const useContextOutput = await exec(
      `kubectl config use-context ${context}`,
      { silent: true },
    );

    if (useContextOutput.code !== 0) {
      throw new Error(
        `Failed to set default context with code ${useContextOutput.code}: ${useContextOutput.stderr}`,
      );
    }

    const setContestOutput = await exec(
      `kubectl config set-context --current --namespace=${namespace} --context=${context}`,
      { silent: true },
    );

    if (setContestOutput.code !== 0) {
      throw new Error(
        `Failed to set namespace to ${namespace} of context ${context} with code ${setContestOutput.code}: ${setContestOutput.stderr}`,
      );
    }
  }

  protected async retrieveDatabaseConfig() {
    const deployManifest = JSON.parse(
      (await exec(`kubectl get deploy directus -ojson`, { silent: true }))
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
