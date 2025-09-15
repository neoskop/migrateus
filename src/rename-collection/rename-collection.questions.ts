import { QuestionSet, Question, ChoicesFor, ValidateFor } from 'nest-commander';
import { ConfigService } from '../config/config.service.js';

@QuestionSet({ name: 'rename-collection-questions' })
export class RenameCollectionQuestions {
  constructor(private readonly config: ConfigService) { }

  @Question({
    message: 'What is the environment to work in?',
    name: 'environment',
    type: 'list',
  })
  parseEnvironment(environment: string) {
    return environment;
  }

  @ChoicesFor({ name: 'environment' })
  environmentChoices() {
    return (this.config.getEnvironments())
      .map((env) => env.name);
  }

  @Question({
    message: 'What is the old name of the relation to rename?',
    name: 'oldName',
    type: 'input',
  })
  parseOldName(oldName: string) {
    return oldName;
  }

  @ValidateFor({ name: 'oldName' })
  validateOldName(name: string) {
    return this.validateName(name)
  }

  validateName(name: string) {
    if (name.length === 0) {
      return 'The name must not be empty';
    }

    if (!name.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
      return 'The name must start with a letter or underscore and contain only letters, numbers, and underscores';
    }

    return true;
  }

  @Question({
    message: 'What is the new name of the relation to rename?',
    name: 'newName',
    type: 'input',
  })
  parseNewName(newName: string) {
    return newName;
  }

  @ValidateFor({ name: 'newName' })
  validateNewName(name: string) {
    return this.validateName(name)
  }
}
