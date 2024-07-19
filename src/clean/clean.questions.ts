import { QuestionSet, Question, ChoicesFor } from 'nest-commander';
import { ConfigService } from '../config/config.service.js';

@QuestionSet({ name: 'clean-questions' })
export class CleanQuestions {
  constructor(private readonly config: ConfigService) {}

  @Question({
    message: 'What is the environment to clean up?',
    name: 'environment',
    type: 'list',
  })
  parseEnvironment(environment: string) {
    return environment;
  }

  @ChoicesFor({ name: 'environment' })
  async environmentChoices() {
    return (await this.config.getEnvironments()).map((env) => env.name);
  }
}
