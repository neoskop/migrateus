import { ChalkInstance } from 'chalk';
import { ProgressBarUpdater } from './progress-bar-updater.type.js';

export interface ProgressBarOptions {
  color: ChalkInstance;
  updater: ProgressBarUpdater;
  total: number;
  prefix: string;
}
