import { Credential } from '../directus/directus-user/credential.type.js';
import { ProjectSettings } from './project-settings.type.js';

export interface Environment {
  name: string;
  platform: 'docker' | 'docker-compose' | 'k8s';
  credentials?: Credential[];
  doubleCheck?: boolean;
  settings?: ProjectSettings;
}

export interface K8sEnvironment extends Environment {
  platform: 'k8s';
  namespace?: string;
  context?: string;
  kubeconfig?: string;
  kubelogin?: boolean;
}

export interface DockerEnvironment extends Environment {
  platform: 'docker';
  containerName: string;
}

export interface DockerComposeEnvironment extends Environment {
  platform: 'docker-compose';
  serviceName?: string;
  composeFile?: string;
}
