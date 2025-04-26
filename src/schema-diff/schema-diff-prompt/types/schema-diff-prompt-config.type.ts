import { SchemaDiffOutput } from '@directus/sdk';

export type SchemaDiffPromptConfig = {
  from: string;
  to: string;
  diffOutput: SchemaDiffOutput;
};
