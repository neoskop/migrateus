import { Inject, Injectable } from '@nestjs/common';
import { ContainerService } from '../container.service.js';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { customAlphabet } from 'nanoid/non-secure';
import { AcaService } from '../../aca/aca.service.js';
import fs from 'node:fs';
import { ExecOutputReturnValue } from 'shelljs';

@Injectable()
export class AcaContainerService extends ContainerService {
  public migrateusAppName: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
    private readonly acaService: AcaService,
  ) {
    super();
    this.migrateusAppName = `migrateus-${customAlphabet('abcdef1234567890')(6)}`;
  }

  public async setup(): Promise<void> {
    const { resourceGroup, environment } = this.acaService.acaEnv;
    const result = await this.acaService.az(
      `containerapp create -n ${this.migrateusAppName} -g ${resourceGroup} --environment ${environment} --image ${this.image} --command "/bin/sh" --args "-c,sleep infinity" --min-replicas 1`,
    );

    if (result.code !== 0) {
      throw new Error(
        `Failed to create ACA container app with code ${result.code}: ${result.stderr}`,
      );
    }
  }

  public async execute(command: string): Promise<ExecOutputReturnValue> {
    const { resourceGroup } = this.acaService.acaEnv;
    const safeCommand = command.replaceAll(/\n/g, ' ');
    // TODO(verify): az containerapp exec stdout capture is interactive and UNVERIFIED for headless use
    return await this.acaService.az(
      `containerapp exec -n ${this.migrateusAppName} -g ${resourceGroup} --command "bash -c \\"${safeCommand}\\""`,
    );
  }

  public async cleanUp(): Promise<void> {
    const { resourceGroup } = this.acaService.acaEnv;
    await this.acaService.az(
      `containerapp delete -n ${this.migrateusAppName} -g ${resourceGroup} --yes`,
    );
  }

  public async cleanUpAll(): Promise<void> {
    const { resourceGroup } = this.acaService.acaEnv;
    const result = await this.acaService.az(
      `containerapp list -g ${resourceGroup} --query "[?starts_with(name,'migrateus-')].name" -o tsv`,
    );

    const apps = result.stdout
      .split('\n')
      .map((name: string) => name.trim())
      .filter(Boolean);

    for (const app of apps) {
      await this.acaService.az(
        `containerapp delete -n ${app} -g ${resourceGroup} --yes`,
      );
    }
  }

  public async exfilFile(source: string, destination: string): Promise<void> {
    // TODO(verify): large .sqlite via Azure Files share; base64-through-exec is for small payloads only
    const result = await this.execute(`base64 ${source}`);

    if (result.code !== 0) {
      throw new Error(
        `Failed to exfil file ${source}: ${result.stderr}`,
      );
    }

    const decoded = Buffer.from(result.stdout.trim(), 'base64');
    await fs.promises.writeFile(destination, decoded);
  }

  public async infilFile(source: string, destination: string): Promise<void> {
    // source is always a controlled CLI-internal path, not user-supplied HTTP input — path traversal risk is acceptable here
    const fileContent = await fs.promises.readFile(source);
    const b64 = fileContent.toString('base64');
    const result = await this.execute(`echo ${b64} | base64 -d > ${destination}`);

    if (result.code !== 0) {
      throw new Error(
        `Failed to infil file to ${destination}: ${result.stderr}`,
      );
    }
  }
}
