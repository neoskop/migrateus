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
  environments: (
    | K8sEnvironment
    | DockerEnvironment
    | DockerComposeEnvironment
    | AcaEnvironment
  )[];
}
