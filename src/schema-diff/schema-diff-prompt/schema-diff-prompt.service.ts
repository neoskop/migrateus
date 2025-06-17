import {
  createPrompt,
  isEnterKey,
  isUpKey,
  isDownKey,
  isSpaceKey,
  useKeypress,
  useState,
  KeypressEvent,
  usePagination,
} from '@inquirer/core';
import { type Prompt } from '@inquirer/type';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../config/config.service.js';
import chalk from 'chalk';
import { SchemaDiffPromptConfig } from './types/schema-diff-prompt-config.type.js';
import { ChangeType } from './types/change-type.enum.js';
import { SchemaDiffPromptItem } from './schema-diff-prompt-item.js';
import { SchemaDiffOutput } from '@directus/sdk';
import { Change } from './types/diff.type.js';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

@Injectable()
export class SchemaDiffPromptService {
  public prompt: Prompt<SchemaDiffOutput, SchemaDiffPromptConfig>;

  constructor(
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
  ) {
    this.setupPrompt();
  }

  private setupPrompt() {
    this.prompt = createPrompt<SchemaDiffOutput, SchemaDiffPromptConfig>(
      (opts, done) => {
        const [active, setActive] = useState(0);
        const [items, setItems] = this.createItems(opts);
        const page = usePagination({
          items,
          active: active,
          renderItem: ({ item, isActive }) => item.render(isActive),
          pageSize: this.config.pageSize,
          loop: false,
        });
        const prefix = [
          `? Select the changes to apply from ${chalk.bold(opts.from)} to ${chalk.bold(opts.to)}`,
          `${chalk.bold('↑')} and ${chalk.bold('↓')} to navigate`,
          `${chalk.bold('space')} to select a change`,
          `${chalk.bold('a')} to select a change and all its children`,
          `${chalk.bold('d')} to show/hide details`,
          `${chalk.bold('enter')} to apply selected changes`,
        ].join('\n  ');
        useKeypress((key, _readline) => {
          this.handleKeypress(
            key,
            active,
            setActive,
            items,
            setItems,
            done,
            opts,
          );
        });
        return `${prefix}\n\n${page}`;
      },
    );
  }

  private handleKeypress(
    key: KeypressEvent,
    active: number,
    setActive: (newValue: number) => void,
    items: SchemaDiffPromptItem[],
    setItems: (newValue: SchemaDiffPromptItem[]) => void,
    done: (value: SchemaDiffOutput) => void,
    opts: SchemaDiffPromptConfig,
  ) {
    if (isEnterKey(key)) {
      const selectedItems = items.filter((item) => item.selected);
      const result: SchemaDiffOutput = {
        hash: opts.diffOutput.hash,
        diff: {
          collections: selectedItems
            .filter((change) => change.type === ChangeType.COLLECTION)
            .map((change) => change.change),
          fields: selectedItems
            .filter((change) => change.type === ChangeType.FIELD)
            .map((change) => change.change),
          relations: selectedItems
            .filter((change) => change.type === ChangeType.RELATION)
            .map((change) => change.change),
        },
      };
      done(result);
    } else if (isUpKey(key) || isDownKey(key)) {
      this.changeActiveIndex(active, setActive, items, isUpKey(key) ? -1 : 1);
    } else if (isSpaceKey(key)) {
      this.toggleSelectedItem(items, active, setActive, setItems);
    } else if (key.name === 'a') {
      this.toggleChildrenSelected(items, active, setActive, setItems);
    } else if (key.name === 'd') {
      this.toggleShowDetails(items, active, setItems);
    }
  }

  private changeActiveIndex(
    active: number,
    setActive: (newValue: number) => void,
    items: SchemaDiffPromptItem[],
    increment: number,
  ) {
    let next = active + increment;

    if (next >= 0 && next < items.length) {
      setActive(next);
    }
  }

  private toggleSelectedItem(
    items: SchemaDiffPromptItem[],
    active: number,
    setActive: (newValue: number) => void,
    setItems: (newValue: SchemaDiffPromptItem[]) => void,
  ) {
    const newItems = new Array(...items);
    const item = items[active];
    item.selected = item.selectable && !item.selected;
    setItems(newItems);
    this.changeActiveIndex(active, setActive, items, 1);
  }

  private toggleChildrenSelected(
    items: SchemaDiffPromptItem[],
    active: number,
    setActive: (newValue: number) => void,
    setItems: (newValue: SchemaDiffPromptItem[]) => void,
  ) {
    const newItems = new Array(...items);
    const item = items[active];
    item.selected = item.selectable && !item.selected;
    let next = active + 1;
    while (next < items.length && items[next].indent > items[active].indent) {
      const nextItem = items[next];
      if (nextItem.selectable) {
        nextItem.selected = !nextItem.selected;
      }
      next++;
    }
    setItems(newItems);
    this.changeActiveIndex(active, setActive, items, next - active);
  }

  private toggleShowDetails(
    items: SchemaDiffPromptItem[],
    active: number,
    setItems: (newValue: SchemaDiffPromptItem[]) => void,
  ) {
    const newItems = new Array(...items);
    const item = items[active];
    item.showDetails = !item.showDetails;
    setItems(newItems);
  }

  private createItems(opts: SchemaDiffPromptConfig) {
    const ignore = this.config.getSchemaDiffIgnore();

    const collections: string[] = Array.from(
      new Set([
        ...opts.diffOutput.diff.collections.map(({ collection }) => collection),
        ...opts.diffOutput.diff.relations.map(({ collection }) => collection),
        ...opts.diffOutput.diff.fields.map(({ collection }) => collection),
      ]),
    );

    const items = collections
      .filter((collection) => !ignore.collections.has(collection))
      .map((collectionName) => {
        const collectionItems = this.getItems(
          collectionName,
          opts.diffOutput.diff.collections,
          SchemaDiffPromptItem.fromCollection,
        );

        const fieldItems = this.getItems(
          collectionName,
          opts.diffOutput.diff.fields,
          SchemaDiffPromptItem.fromField,
          (field) => !ignore.fields[collectionName]?.includes(field.field),
        );

        const relationItems = this.getItems(
          collectionName,
          opts.diffOutput.diff.relations,
          SchemaDiffPromptItem.fromRelation,
          (relation) =>
            !ignore.fields[collectionName]?.includes(relation.field),
        );

        if (collectionItems.length === 0) {
          collectionItems.push(SchemaDiffPromptItem.getDummy(collectionName));
        }

        return [...collectionItems, ...fieldItems, ...relationItems];
      });

    return useState<Array<SchemaDiffPromptItem>>(items.flat());
  }

  private getItems(
    collectionName: string,
    changes: Change[],
    itemFn: (change: Change) => SchemaDiffPromptItem,
    filterFn?: (change: Change) => boolean,
  ): SchemaDiffPromptItem[] {
    return changes
      .filter((change) => change.collection === collectionName)
      .filter(filterFn || (() => true))
      .map(itemFn);
  }
}
