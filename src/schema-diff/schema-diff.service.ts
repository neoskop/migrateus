import { LoggerService } from '../logger/logger.service.js';
import { LOGGER_MODULE_PROVIDER } from '../logger/logger.constants.js';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { DirectusService } from '../directus/directus.service.js';
import {
  RestClient,
  schemaApply,
  schemaDiff,
  SchemaDiffOutput,
  schemaSnapshot,
  serverInfo,
} from '@directus/sdk';
import chalk from 'chalk';
import { SqlService } from '../sql/sql.service.js';
import { DirectusUserService } from '../directus/directus-user/directus-user.service.js';
import { PlatformResolver } from '../platform/platform-resolver.service.js';
import { Platform } from '../platform/platform.js';
import { EnvironmentService } from '../environment/environment.service.js';
import confirm from '@inquirer/confirm';
import semver from 'semver';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { SchemaDiffPromptService } from './schema-diff-prompt/schema-diff-prompt.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { highlight } from 'cli-highlight';
import { ErrorFormatterService } from '../error-formatter/error-formatter.service.js';

@Injectable()
export class SchemaDiffService {
  private platforms: { [name: string]: Platform } = {};

  constructor(
    @Inject(LOGGER_MODULE_PROVIDER) protected readonly logger: LoggerService,
    private readonly config: ConfigService,
    private readonly directus: DirectusService,
    private readonly platformResolver: PlatformResolver,
    private readonly sqlService: SqlService,
    private readonly directusUserService: DirectusUserService,
    private readonly environmentService: EnvironmentService,
    private readonly schemaDiffPromptService: SchemaDiffPromptService,
    private readonly progressService: ProgressService,
    private readonly errorFormatter: ErrorFormatterService,
  ) {}

  public async diff(from: string, to: string) {
    try {
      const fromClient = await this.setupDirectusClient(from);
      const toClient = await this.setupDirectusClient(to);
      this.progressService.advance('🔎 Compare Directus versions');
      await this.checkVersions(from, fromClient, to, toClient);
      this.progressService.advance('📸 Get schema snapshot');
      const snapshot = await fromClient.request(schemaSnapshot());
      this.progressService.advance('🧬 Get schema diff');
      const diffOutput = await toClient.request<
        SchemaDiffOutput & { status: number }
      >(schemaDiff(snapshot, true));
      this.logger.debug(
        `Schema diff: ${highlight(JSON.stringify(diffOutput), { language: 'json' })}`,
      );

      if (!diffOutput || diffOutput.status === 204) {
        this.progressService.succeed(
          `No changes between ${chalk.bold(from)} and ${chalk.bold(to)}`,
        );
      } else {
        if (this.config.schemaDiffSavePath) {
          this.logger.debug(
            `Saving diff to ${chalk.bold(this.config.schemaDiffSavePath)}`,
          );
          await fs.promises.writeFile(
            this.config.schemaDiffSavePath,
            yaml.dump(diffOutput),
          );
        }

        this.progressService.finish();
        const filteredDiff = await this.schemaDiffPromptService.prompt({
          from,
          to,
          diffOutput,
        });

        const changes =
          filteredDiff.diff.collections.length +
          filteredDiff.diff.fields.length +
          filteredDiff.diff.relations.length;

        if (changes > 0) {
          await this.doubleCheck(changes);
          this.progressService.advance(
            `Applying ${chalk.bold(changes)} changes!`,
          );
          await this.applyDiff(toClient, filteredDiff);
        } else {
          this.logger.debug(`No changes to apply - stopping!`);
        }
      }
    } catch (error: any) {
      this.progressService.fail(this.errorFormatter.format(error));
    } finally {
      this.progressService.advance('🧹 Cleaning up');
      await this.cleanUpEnv(from);
      await this.cleanUpEnv(to);
      this.progressService.finish();
    }
  }

  private async checkVersions(
    fromName: string,
    fromClient: RestClient<any>,
    toName: string,
    toClient: RestClient<any>,
  ) {
    const fromVersion = await this.getDirectusVersion(fromClient);
    const toVersion = await this.getDirectusVersion(toClient);

    if (fromVersion !== toVersion) {
      throw new Error(
        `Directus server versions mismatch. ${chalk.bold(fromName)} has ${semver.lt(fromVersion, toVersion) ? chalk.red(fromVersion) : chalk.green(fromVersion)}, while ${chalk.bold(toName)} has ${semver.lt(toVersion, fromVersion) ? chalk.red(toVersion) : chalk.green(toVersion)}`,
      );
    }
  }

  private async getDirectusVersion(client: RestClient<any>) {
    return (await client.request<{ version: string }>(serverInfo())).version;
  }

  private async doubleCheck(changes: number) {
    const environment = this.environmentService.environment;

    if (environment.doubleCheck) {
      const answer = await confirm({
        message: `Are you sure you want to apply ${chalk.red(changes)} changes to the environment ${chalk.red(environment.name)}?`,
        default: false,
      });

      if (!answer) {
        process.exit(0);
      }
    }
  }

  private async cleanUpEnv(name: string) {
    const platform = this.platforms[name];

    if (!platform) {
      return;
    }

    // Remove the temp admin (an HTTP call) BEFORE teardown closes the
    // tunnel/port-forward. Best-effort: a failure must not skip teardown, which
    // closes local servers that would otherwise keep the process alive.
    try {
      await this.sqlService.cleanUpDirectusUser();
    } catch (error: any) {
      this.logger.warn(
        `Failed to remove the temporary Directus admin: ${error?.message ?? error}`,
      );
    }

    await platform.teardown();
  }

  private async setupDirectusClient(name: string): Promise<RestClient<any>> {
    const env = this.config.getEnvironment(name);
    this.environmentService.environment = env;
    const platform = this.platformResolver.resolve(env.platform);
    this.platforms[name] = platform;

    this.progressService.advance(
      `🚀 Set-up platform for environment ${chalk.bold(name)}`,
    );
    const { port, containerService } = await platform.connect();

    this.progressService.advance(
      `👤 Set-up Directus user in environment ${chalk.bold(name)}`,
    );
    await this.sqlService.setupDirectusUser(containerService, port);
    return this.directus.getClient(port, this.directusUserService.token);
  }

  private async applyDiff(client: RestClient<any>, diff) {
    const version = await this.getDirectusVersion(client);

    if (semver.gte(version, '11.13.0')) {
      diff.diff.systemFields = [];
    }

    return await client.request(schemaApply(diff));
  }
}
