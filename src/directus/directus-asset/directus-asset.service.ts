import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import {
  DirectusFile,
  RestClient,
  aggregate,
  readFiles,
  updateFile,
} from '@directus/sdk';
import { Readable } from 'node:stream';
import { ReadableStream } from 'stream/web';
import fs from 'node:fs';
import { join, parse } from 'node:path';
import { finished } from 'node:stream/promises';
import pLimit from 'p-limit';
import chalk from 'chalk';
import { DirectusUserService } from '../directus-user/directus-user.service.js';
import { DirectusService } from '../directus.service.js';
import { mkdir } from 'node:fs/promises';
import { glob } from 'glob';
import { fileTypeFromFile } from 'file-type';
import mime from 'mime';
import { ProgressBar } from '../../progress/progress-bar.js';
import { ProgressBarUpdater } from '../../progress/progress-bar-updater.type.js';
import { highlight } from 'cli-highlight';

@Injectable()
export class DirectusAssetService {
  public limit = pLimit(10);

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly directusUserService: DirectusUserService,
    private readonly directusService: DirectusService,
  ) {}

  public async restoreAssets(
    directusPort: number,
    backupDir: string,
    updater: ProgressBarUpdater,
  ) {
    const assets = await this.getAllLocalAssets(backupDir);
    const directus = this.directusService.getClient(
      directusPort,
      this.directusUserService.token,
    );
    this.logger.debug(`Found ${chalk.bold(assets.length)} assets to restore`);
    const progressBar = new ProgressBar({
      total: assets.length,
      updater,
      prefix: '🖼️ Restoring assets',
      color: chalk.green,
    });

    progressBar.start();
    const failedUploads: { path: string; error: Error }[] = [];

    await Promise.all(
      assets.map((asset) =>
        this.limit(async () => {
          try {
            await this.uploadAsset(directus, asset);
          } catch (error) {
            failedUploads.push({ path: asset, error });
          }
          progressBar.increment();
        }),
      ),
    );

    progressBar.stop();

    if (failedUploads.length > 0) {
      for (const failedUpload of failedUploads) {
        const errorMessage =
          failedUpload.error.message ||
          highlight(JSON.stringify(failedUpload.error, null, 2), {
            language: 'json',
          });
        this.logger.debug(
          `Failed to restore asset ${chalk.bold(failedUpload.path)}: ${errorMessage}`,
        );
      }
    }

    return failedUploads.length;
  }

  private async uploadAsset(directus: RestClient<any>, assetPath: string) {
    const parsedPath = parse(assetPath);

    const formData = new FormData();
    const readStream = fs.createReadStream(assetPath);
    const chunks: Buffer[] = [];
    readStream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    await new Promise<void>((resolve) => readStream.on('end', resolve));
    const blob = new Blob(chunks, { type: mime.lookup(assetPath) });
    formData.append('file', blob, parsedPath.base);

    const mimeType = await fileTypeFromFile(assetPath);
    if (mimeType) {
      formData.append('type', mimeType.mime);
    }

    await directus.request(updateFile(parsedPath.name, formData));
  }

  private async getAllLocalAssets(backupDir: string): Promise<string[]> {
    const assetBackupDir = this.getAssetBackupDir(backupDir);
    return glob(`${assetBackupDir}/**/*`, {});
  }

  public async backupAssets(
    directusPort: number,
    backupDir: string,
    updater: ProgressBarUpdater,
  ) {
    const assets = await this.getAllRemoteAssets(directusPort);
    this.logger.debug(`Found ${chalk.bold(assets.length)} assets to backup`);
    const assetBackupDir = this.getAssetBackupDir(backupDir);
    this.logger.debug(`Creating directory ${chalk.bold(assetBackupDir)}`);
    await mkdir(assetBackupDir, { recursive: true });

    const progressBar = new ProgressBar({
      total: assets.length,
      updater,
      prefix: '🖼️ Downloading assets',
      color: chalk.blue,
    });

    progressBar.start();
    const failedDownloads = [];

    await Promise.all(
      assets.map((asset) =>
        this.limit(async () => {
          try {
            await this.downloadAsset(
              directusPort,
              assetBackupDir,
              asset,
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
    return failedDownloads;
  }

  private getAssetBackupDir(backupDir: string) {
    return join(backupDir, 'assets');
  }

  private async getAllRemoteAssets(
    directusPort: number,
  ): Promise<DirectusFile<any>[]> {
    try {
      const directus = this.directusService.getClient(
        directusPort,
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

      const fields = ['id', 'filename_disk', 'type'];
      let assets = await directus.request<DirectusFile<any>[]>(
        readFiles({ fields, limit: 100 }),
      );

      while (assets.length < assetCount) {
        const nextAssets = await directus.request<DirectusFile<any>[]>(
          readFiles({
            fields,
            offset: assets.length,
            limit: 100,
          }),
        );
        assets = [...assets, ...nextAssets];
      }
      return assets;
    } catch (error) {
      this.logger.error(
        `Failed to get assets: ${error.message || JSON.stringify(error)}`,
      );
      return [];
    }
  }

  private async downloadAsset(
    directusPort: number,
    backupDir: string,
    asset: DirectusFile<any>,
    directusToken: string,
  ) {
    const res = await fetch(
      `http://localhost:${directusPort}/assets/${asset.id}`,
      {
        headers: {
          Authorization: `Bearer ${directusToken}`,
        },
      },
    );

    if (res.ok) {
      const extension = mime.extension(asset.type);
      const path = join(
        backupDir,
        extension ? asset.id + '.' + extension : asset.id,
      );
      const readStream = Readable.fromWeb(res.body as ReadableStream<any>);
      const fileStream = fs.createWriteStream(path, {
        flags: 'wx',
      });
      await finished(readStream.pipe(fileStream));

      if (!extension) {
        const fileType = await fileTypeFromFile(path);

        if (fileType) {
          await fs.promises.rename(path, path + '.' + fileType.ext);
        }
      }
    } else {
      throw new Error(res.statusText);
    }
  }
}
