import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import shell from 'shelljs';
import { DockerEnvironment } from '../config/environment.interface.js';

@Injectable()
export class BackupDbService {
  public constructor(private readonly config: ConfigService) {}

  public async backup(sourceEnvironment: string, backupFile: string) {
    const environment = await this.config.getEnvironment(sourceEnvironment);

    if (environment.platform === 'docker') {
      const containerConfig = this.getContainerConfig(environment);
      const databaseConfig = this.getDatabaseConfig(containerConfig);
      const backupDir = this.createTemporaryDirectory();
      const command = this.getBackupCommand(
        containerConfig,
        backupDir,
        databaseConfig,
      );
      const output = shell.exec(command.join(' '), { silent: true });
      this.handleBackupOutput(output);
      this.createBackupArchive(backupDir, backupFile);
      shell.rm('-rf', backupDir);
    } else {
      throw new Error('Backing up from k8s is not implemented yet');
    }
  }

  private getContainerConfig(environment: DockerEnvironment) {
    const inspectOutput = shell.exec(
      `docker inspect ${environment.containerName}`,
      { silent: true },
    );
    return JSON.parse(inspectOutput.stdout)[0];
  }

  private getDatabaseConfig(containerConfig: { Config: { Env: string[] } }) {
    return {
      host: this.getDockerEnvValue(containerConfig, 'DB_HOST'),
      port: this.getDockerEnvValue(containerConfig, 'DB_PORT'),
      name: this.getDockerEnvValue(containerConfig, 'DB_DATABASE'),
      user: this.getDockerEnvValue(containerConfig, 'DB_USER'),
      password: this.getDockerEnvValue(containerConfig, 'DB_PASSWORD'),
    };
  }

  private createTemporaryDirectory() {
    return shell.exec('mktemp -d', { silent: true }).stdout.trim();
  }

  private getBackupCommand(
    containerConfig: { NetworkSettings: { Networks: string[] } },
    backupDir: string,
    databaseConfig: any,
  ) {
    const command = [
      'docker run',
      '--rm',
      '--name migrateus',
      '-v',
      `${backupDir}:/backup`,
    ];

    for (const networkName of Object.keys(
      containerConfig.NetworkSettings.Networks,
    )) {
      command.push('--network', networkName);
    }

    command.push(
      'mysql',
      `bash -c "mysqldump --no-tablespaces -h${databaseConfig.host} -P${databaseConfig.port} -u${databaseConfig.user} -p${databaseConfig.password} ${databaseConfig.name} >/backup/backup.sql"`,
    );
    return command;
  }

  private handleBackupOutput(output: shell.ShellString) {
    if (output.code !== 0) {
      throw new Error(`Backup failed: ${output.stderr}`);
    }
  }

  private createBackupArchive(backupDir: string, backupFile: string) {
    shell.exec(`tar -czf ${backupFile} ${backupDir}/backup.sql`, {
      silent: true,
    });
  }

  private getDockerEnvValue(
    containerConfig: { Config: { Env: string[] } },
    name: string,
  ) {
    const variable = containerConfig.Config.Env.find((env: string) =>
      env.startsWith(name),
    );

    if (!variable) {
      throw new Error(`Environment variable ${name} not found`);
    }

    return variable.split('=')[1];
  }
}
