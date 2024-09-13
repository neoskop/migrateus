import {
  DockerComposeEnvironment,
  DockerEnvironment,
  K8sEnvironment,
} from './environment.interface.js';

export interface Config {
  environments: (
    | K8sEnvironment
    | DockerEnvironment
    | DockerComposeEnvironment
  )[];
}
