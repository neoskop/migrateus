import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DirectusService } from '../directus.service.js';
import { DirectusUserService } from '../directus-user/directus-user.service.js';
import { highlight } from 'cli-highlight';
import { serverInfo, ServerInfoOutput } from '@directus/sdk';
import semver from 'semver';

@Injectable()
export class DirectusVersionService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly directusService: DirectusService,
    private readonly directusUserService: DirectusUserService,
  ) {}

  public async getVersion(directusPort: number): Promise<string> {
    const directus = this.directusService.getClient(
      directusPort,
      this.directusUserService.token,
    );

    const data = await directus.request<ServerInfoOutput & { version: string }>(
      serverInfo(),
    );
    this.logger.debug(
      `Loaded Directus server info: ${highlight(JSON.stringify(data, null, 2), { language: 'json' })}`,
    );
    return data.version;
  }

  public isDangerousMismatch(
    firstVersion: string,
    secondVersion: string,
  ): boolean {
    const diff = semver.diff(firstVersion, secondVersion);
    return diff !== null && diff !== 'patch';
  }
}
