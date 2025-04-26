import figures from '@inquirer/figures';
import { ChangeType } from './types/change-type.enum.js';
import { Change } from './types/diff.type.js';
import { Kind } from './types/kind.type.js';
import chalk from 'chalk';

export class SchemaDiffPromptItem {
  public readonly change: Change;
  public readonly indent: boolean;
  public readonly type: ChangeType;
  public selected: boolean;

  public constructor(
    public opts: {
      change: Change;
      type: ChangeType;
      indent?: boolean;
      selected?: boolean;
    },
  ) {
    Object.assign(this, { indent: false, selected: false }, opts);
  }

  public static fromCollection(collection: Change): SchemaDiffPromptItem {
    return new SchemaDiffPromptItem({
      change: collection,
      type: ChangeType.COLLECTION,
    });
  }

  public static fromField(field: Change): SchemaDiffPromptItem {
    return new SchemaDiffPromptItem({
      change: field,
      indent: true,
      type: ChangeType.FIELD,
    });
  }

  public static fromRelation(relation: Change): SchemaDiffPromptItem {
    return new SchemaDiffPromptItem({
      change: relation,
      indent: true,
      type: ChangeType.RELATION,
    });
  }

  public render(active: boolean): string {
    const cursor = active ? figures.pointer : ' ';
    const checkbox = this.selected ? figures.circleFilled : figures.circle;
    return `${this.indent ? '  ' : ''}${cursor} ${checkbox} ${this.colorizeDiff(this.change)}`;
  }

  private colorizeDiff(change: Change) {
    const kind = change.diff[0].kind;
    return this.kindToColor(kind)(
      change.field ? change.field : change.collection,
    );
  }

  private kindToColor(kind: Kind) {
    const kindToColorMap = {
      E: chalk.yellow,
      N: chalk.green,
      D: chalk.red,
      A: chalk.blue,
    };

    return kindToColorMap[kind];
  }
}
