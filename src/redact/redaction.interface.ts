import { RedactOptions } from './redact-options.interface.js';

export interface Redaction {
  text: string;
  options?: RedactOptions;
}
