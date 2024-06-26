import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { aggregate, readFiles } from '@directus/sdk';
import { Readable } from 'node:stream';
import { ReadableStream } from 'stream/web';
import fs from 'node:fs';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import pLimit from 'p-limit';
import cliProgress from 'cli-progress';
import chalk from 'chalk';
import { DirectusUserService } from '../directus-user/directus-user.service.js';
import { DirectusService } from '../directus.service.js';

@Injectable()
export class DirectusAssetService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly directusUserService: DirectusUserService,
    private readonly directusService: DirectusService,
  ) {}

  public async backupAssets(backupDir: string) {
    const assets = await this.getAllAssets();
    this.logger.debug(`Found ${chalk.bold(assets.length)} assets to backup`);
    const limit = pLimit(10);

    const progressBar = new cliProgress.SingleBar({
      etaBuffer: 50,
      format:
        'Downloading assets |' +
        chalk.cyan('{bar}') +
        '| {percentage}% || {value}/{total}',
      hideCursor: true,
    });

    progressBar.start(assets.length, 0);
    const failedDownloads = [];

    await Promise.all(
      assets.map((asset) =>
        limit(async () => {
          try {
            await this.downloadAsset(
              backupDir,
              asset.id,
              this.directusUserService.token,
            );
          } catch (error) {
            failedDownloads.push(asset);
          }
          progressBar.increment();
        }),
      ),
    );

    progressBar.stop();

    if (failedDownloads.length > 0) {
      this.logger.warn(
        `Failed to download ${chalk.bold(failedDownloads.length)} assets`,
      );

      for (const asset of failedDownloads) {
        this.logger.debug(
          `Failed to download asset ${chalk.bold(asset.id)}: ${chalk.bold(asset.filename_disk)}`,
        );
      }
    }
  }

  private async getAllAssets() {
    const directus = this.directusService.getClient(
      8055,
      this.directusUserService.token,
    );

    const assetCount = Number(
      (
        await directus.request(
          aggregate('directus_files', {
            aggregate: { count: '*' },
          }),
        )
      )[0].count,
    );

    const fields = ['id', 'filename_disk'];
    let assets = await directus.request(readFiles({ fields, limit: 100 }));

    while (assets.length < assetCount) {
      const nextAssets = await directus.request(
        readFiles({
          fields,
          offset: assets.length,
          limit: 100,
        }),
      );
      assets = [...assets, ...nextAssets];
    }

    return assets;
  }

  private async downloadAsset(
    backupDir: string,
    fileId: string,
    directusToken: string,
  ) {
    const res = await fetch(`http://localhost:8055/assets/${fileId}`, {
      headers: {
        Authorization: `Bearer ${directusToken}`,
      },
    });

    if (res.ok) {
      const path = join(backupDir, fileId);
      const fileStream = fs.createWriteStream(path, {
        flags: 'wx',
      });
      await finished(
        Readable.fromWeb(res.body as ReadableStream<any>).pipe(fileStream),
      );
    } else {
      throw new Error(res.statusText);
    }
  }
}
