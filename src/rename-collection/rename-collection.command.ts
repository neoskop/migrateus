import { Inject } from '@nestjs/common';
import { Command, InquirerService, Option } from 'nest-commander';
import { MigrateusCommand } from '../migrateus.command.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ConfigService } from '../config/config.service.js';
import { RedactService } from '../redact/redact.service.js';
import { DependenciesService } from '../dependencies/dependencies.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { ContainerService } from '../container/container.service.js';
import { UpdateService } from '../update/update.service.js';
import { RenameCollectionAnswers } from './rename-collection-answers.interface.js';
import { RenameCollectionService } from './rename-collection.service.js';

@Command({
  name: 'rename-collection',
  description: 'Rename a relation',
  arguments: '[environment] [oldName] [newName]',
  argsDescription: {
    environment: 'Environment to work in',
    oldName: 'Old name of the relation to rename',
    newName: 'New name of the relation to rename',
  },
})
export class RenameCollectionCommand extends MigrateusCommand {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger,
    config: ConfigService,
    private readonly inquirer: InquirerService,
    private readonly renameCollectionService: RenameCollectionService,
    protected readonly redactService: RedactService,
    protected readonly dependenciesService: DependenciesService,
    protected readonly progressService: ProgressService,
    @Inject('ContainerServices')
    protected readonly containerServices: ContainerService[],
    protected readonly updateService: UpdateService,
  ) {
    super(
      logger,
      config,
      redactService,
      dependenciesService,
      progressService,
      containerServices,
      updateService,
    );
  }

  async execute(params: string[]): Promise<void> {
    let [environment, oldName, newName] = params;

    if (!environment || !oldName || !newName) {
      const answers = await this.inquirer.ask<RenameCollectionAnswers>('rename-collection-questions', {
        environment,
        oldName,
        newName,
      });
      environment = answers.environment;
      oldName = answers.oldName;
      newName = answers.newName;
    }

    this.renameCollectionService.RenameCollection(environment, oldName, newName);
  }
}
