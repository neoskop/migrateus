import { QuestionSet, Question, ChoicesFor, WhenFor } from 'nest-commander';
import { ConfigService } from '../config/config.service.js';
import { SchemaDiffAnswers } from './schema-diff-answers.interface.js';

@QuestionSet({ name: 'schema-diff-questions' })
export class SchemaDiffQuestions {
  constructor(private readonly config: ConfigService) {}

  @Question({
    message: 'What is the source environment for the diff?',
    name: 'from',
    type: 'list',
  })
  parseFrom(from: string) {
    return from;
  }

  @WhenFor({ name: 'from' })
  shouldAskFrom(answers: SchemaDiffAnswers) {
    return !answers.from;
  }

  @ChoicesFor({ name: 'from' })
  async fromChoices() {
    return (await this.config.getEnvironments()).map((env) => env.name);
  }

  @Question({
    message: 'What is the target environment for the diff?',
    name: 'to',
    type: 'list',
  })
  parseTo(to: string) {
    return to;
  }

  @ChoicesFor({ name: 'to' })
  async toChoices(answers: SchemaDiffAnswers) {
    return (await this.config.getEnvironments())
      .filter((env) => env.name !== answers.from)
      .map((env) => env.name);
  }
}
