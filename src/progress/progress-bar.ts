import { ProgressBarOptions } from './progress-bar-options.interface.js';

export class ProgressBar {
  private current = 0;
  private renderInterval: NodeJS.Timeout;

  constructor(private readonly opts: ProgressBarOptions) {}

  public increment() {
    this.current += 1;
  }

  public start() {
    this.render();
    this.renderInterval = setInterval(() => {
      this.render();
    }, 100);
  }

  public stop() {
    clearInterval(this.renderInterval);
  }

  private render() {
    const barLength = 40;
    const completeBars = Math.floor(
      (this.current / this.opts.total) * barLength,
    );
    const incompleteBars = barLength - completeBars;
    const bar = `[${this.opts.color('=').repeat(completeBars)}${'-'.repeat(incompleteBars)}]`;
    this.opts.updater(
      `${this.opts.prefix} ${bar} ${this.current}/${this.opts.total}`,
    );
  }
}
