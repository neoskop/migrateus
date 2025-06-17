import figures from '@inquirer/figures';

export class MigrateDataPromptItem {
  public readonly name: string;
  public isActive: boolean = false;
  public selected: boolean = false;

  public constructor(name: string) {
    this.name = name;
  }

  public render(active: boolean): string {
    const cursor = active ? figures.pointer : ' ';
    const checkbox = this.selected ? figures.circleFilled : figures.circle;
    return `${cursor} ${checkbox} ${this.name}`;
  }
}
