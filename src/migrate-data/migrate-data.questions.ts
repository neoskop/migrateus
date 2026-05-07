import { Injectable } from '@nestjs/common';
import { QuestionSet, Question, ChoicesFor, WhenFor } from 'nest-commander';
import { ConfigService } from '../config/config.service.js';
import { MigrateDataAnswers } from './migrate-data-answers.interface.js';

@Injectable()
@QuestionSet({ name: 'migrate-data-questions' })
export class MigrateDataQuestions {
  constructor(private readonly config: ConfigService) { }

  @Question({
    message: 'What is the source environment for the diff?',
    name: 'from',
    type: 'list',
  })
  parseFrom(from: string) {
    return from;
  }

  @WhenFor({ name: 'from' })
  shouldAskFrom(answers: MigrateDataAnswers) {
    return !answers.from;
  }

  @ChoicesFor({ name: 'from' })
  fromChoices() {
    return (this.config.getEnvironments()).map((env) => env.name);
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
  toChoices(answers: MigrateDataAnswers) {
    return (this.config.getEnvironments())
      .filter((env) => env.name !== answers.from)
      .map((env) => env.name);
  }
}
