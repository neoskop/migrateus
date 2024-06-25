import { QuestionSet, Question, ChoicesFor, WhenFor } from 'nest-commander';
import { ConfigService } from '../config/config.service.js';
import { RestoreDbAnswers } from './restore-db-answers.interface.js';
import { Glob, glob } from 'glob';

@QuestionSet({ name: 'restore-db-questions' })
export class RestoreDbQuestions {
  private glob: Glob<{}>;

  constructor(private readonly config: ConfigService) {
    this.glob = new Glob('**/migrateus*.{tgz,tar.gz}', {});
  }

  @Question({
    message: 'Which backup file to use?',
    name: 'from',
    type: 'list',
  })
  parseFrom(from: string) {
    return from;
  }

  @WhenFor({ name: 'from' })
  async shouldAskFrom(answers: RestoreDbAnswers) {
    return !answers.from && (await this.glob.walk()).length > 0;
  }

  @ChoicesFor({ name: 'from' })
  async fromChoices() {
    return await this.glob.walk();
  }

  @Question({
    message: 'No backup found - what is the path to the backup file?',
    name: 'fromManual',
    type: 'input',
    default: '../migrateus.tgz',
  })
  parseFromManual(from: string) {
    return from;
  }

  @WhenFor({ name: 'fromManual' })
  shouldAskFromManual(answers: RestoreDbAnswers) {
    return !answers.from;
  }

  @Question({
    message: 'What is the target environment for the operation?',
    name: 'to',
    type: 'list',
  })
  parseTo(to: string) {
    return to;
  }

  @ChoicesFor({ name: 'to' })
  async toChoices() {
    return await this.config.getEnvironments();
  }
}
