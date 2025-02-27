import {
  DockerComposeEnvironment,
  DockerEnvironment,
  K8sEnvironment,
} from './environment.interface.js';

export interface Config {
  schemaDiff?: {
    ignore?: { [key: string]: string[] | boolean };
  };
  environments: (
    | K8sEnvironment
    | DockerEnvironment
    | DockerComposeEnvironment
  )[];
}
