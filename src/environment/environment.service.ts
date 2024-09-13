import { Injectable } from '@nestjs/common';
import {
  DockerComposeEnvironment,
  DockerEnvironment,
  K8sEnvironment,
} from '../config/environment.interface.js';

@Injectable()
export class EnvironmentService {
  public environment:
    | K8sEnvironment
    | DockerEnvironment
    | DockerComposeEnvironment;
}
