import { Injectable } from '@nestjs/common';
import { K8sEnvironment } from '../../config/environment.interface.js';

@Injectable()
export class K8sBackupService {
  public async backup(environment: K8sEnvironment, backupFile: string) {
    throw new Error('Backing up from k8s is not implemented yet');
  }
}
