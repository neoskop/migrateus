export interface Environment {
  name: string;
  platform: 'docker' | 'k8s';
}

export interface K8sEnvironment extends Environment {
  platform: 'k8s';
  namespace: string;
  context: string;
}

export interface DockerEnvironment extends Environment {
  platform: 'docker';
  containerName: string;
}
