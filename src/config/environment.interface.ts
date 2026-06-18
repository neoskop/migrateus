import { Credential } from '../directus/directus-user/credential.type.js';
import { ProjectSettings } from './project-settings.type.js';

export interface Environment {
  name: string;
  platform: 'docker' | 'docker-compose' | 'k8s' | 'aca';
  credentials?: Credential[];
  doubleCheck?: boolean;
  settings?: ProjectSettings;
  assetStorage?: string;
}

export interface AcaEnvironment extends Environment {
  platform: 'aca';
  aca: { subscription: string; resourceGroup: string; environment: string; app: string; filesShare?: string };
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
  host?: string;
  service?: string;
}

export interface DockerComposeEnvironment extends Environment {
  platform: 'docker-compose';
  serviceName?: string;
  composeFile?: string;
  host?: string;
}
