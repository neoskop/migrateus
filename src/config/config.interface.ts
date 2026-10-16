import {
  AcaEnvironment,
  DockerComposeEnvironment,
  DockerEnvironment,
  K8sEnvironment,
} from './environment.interface.js';
import { PseudonymizeRules } from '../pseudonymize/pseudonymize.js';

export interface Config {
  schemaDiff?: {
    ignore?: { [key: string]: string[] | boolean };
  };
  pseudonymize?: PseudonymizeRules;
  /** Faker locale for pseudonyms, e.g. `de`. Default: `en`. */
  pseudonymizeLocale?: string;
  environments: (
    | K8sEnvironment
    | DockerEnvironment
    | DockerComposeEnvironment
    | AcaEnvironment
  )[];
}
