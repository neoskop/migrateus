import {
  QuestionSet,
  Question,
  ChoicesFor,
  WhenFor,
  DefaultFor,
} from 'nest-commander';
import { ConfigService } from '../config/config.service.js';
import { BackupDbAnswers } from './backup-db-answers.interface.js';

@QuestionSet({ name: 'backup-db-questions' })
export class BackupDbQuestions {
  constructor(private readonly config: ConfigService) {}

  @Question({
    message: 'What is the environment to back-up?',
    name: 'from',
    type: 'list',
  })
  parseFrom(from: string) {
    return from;
  }

  @WhenFor({ name: 'from' })
  shouldAskFrom(answers: BackupDbAnswers) {
    return !answers.from;
  }

  @ChoicesFor({ name: 'from' })
  async fromChoices() {
    return (await this.config.getEnvironments()).map((env) => env.name);
  }

  @Question({
    message: 'What is the target path for the backup?',
    name: 'to',
    type: 'input',
  })
  parseTo(to: string) {
    return to;
  }

  @DefaultFor({ name: 'to' })
  defaultTo(answers: BackupDbAnswers) {
    const date = new Date().toISOString().substring(0, 10).replaceAll('-', '');
    return `migrateus-${answers.from}-${date}.tgz`;
  }
}
