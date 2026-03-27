import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '../config/config.service.js';
import chalk from 'chalk';
import { EnvironmentService } from '../environment/environment.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { ContainerService } from '../container/container.service.js';
import { K8sContainerService } from '../container/k8s-container/k8s-container.service.js';
import { DockerContainerService } from '../container/docker-container/docker-container.service.js';
import { SqlService } from '../sql/sql.service.js';
import { K8sService } from '../k8s/k8s.service.js';
import { DockerService } from '../docker/docker.service.js';

@Injectable()
export class RenameCollectionService {
    constructor(@Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger, private readonly config: ConfigService, private readonly environmentService: EnvironmentService, @Inject('ContainerServices') private readonly containerServices: { [name: string]: any }, private readonly progressService: ProgressService, private readonly sqlService: SqlService, private readonly k8sService: K8sService,
        private readonly dockerService: DockerService,) { }

    public async renameCollection(environmentName: string, oldName: string, newName: string) {
        const containerService = await this.prepareContainerService(environmentName);

        try {
            const environment = this.config.getEnvironment(environmentName);
            this.environmentService.environment = environment;
            this.progressService.advance(`🚀 Rename collection ${chalk.bold(oldName)} to ${chalk.bold(newName)}`);
            const tableExists = await this.sqlService.listTables(containerService).then((tables) => tables.includes(oldName));

            if (tableExists) {
                const alterTableStatement = `ALTER TABLE ${oldName} RENAME TO ${newName};`;
                await this.sqlService.executeSql(alterTableStatement, containerService);
            }

            const otherStatements = [
                'SET foreign_key_checks = 0;',
                `UPDATE directus_collections c SET c.group = '${newName}' WHERE c.group = '${oldName}';`,
                `UPDATE directus_collections SET collection = '${newName}' WHERE collection = '${oldName}';`,
                `UPDATE directus_fields SET collection = '${newName}' WHERE collection = '${oldName}';`,
                `UPDATE directus_relations SET many_collection = '${newName}' WHERE many_collection = '${oldName}';`,
                `UPDATE directus_relations SET one_collection = '${newName}' WHERE one_collection = '${oldName}';`,
                `UPDATE directus_permissions SET collection = '${newName}' WHERE collection = '${oldName}';`,
                'SET foreign_key_checks = 1;',
            ];

            await this.sqlService.executeSql(otherStatements.join('\n'), containerService);
            this.progressService.finish();
        } catch (error: any) {
            this.progressService.fail(error);
        } finally {
            this.progressService.advance('🧹 Cleaning up');
            await containerService.cleanUp();
            this.progressService.finish();
        }
    }

    private async prepareContainerService(name: string) {
        if (!this.containerServices[name]) {
            this.progressService.advance(
                `🚀 Set-up Migrateus container for environment ${chalk.bold(name)}`,
            );
            const env = this.config.getEnvironment(name);
            this.environmentService.environment = env;
            await this.setupContainerService(name);
        }

        return this.containerServices[name];
    }

    private async setupContainerService(name: string) {
        let containerService: ContainerService;
        const env = this.config.getEnvironment(name);
        this.environmentService.environment = env;

        if (env.platform === 'k8s') {
            containerService = new K8sContainerService(this.logger, this.k8sService);
            await this.k8sService.setup();
        } else {
            containerService = new DockerContainerService(
                this.logger,
                this.dockerService,
            );
            await this.dockerService.setup();
        }

        await containerService.setup();
        this.containerServices[name] = containerService;
    }
}
