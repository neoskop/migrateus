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
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../config/config.service.js';
import chalk from 'chalk';
import { SchemaDiffPromptConfig } from './types/schema-diff-prompt-config.type.js';
import { ChangeType } from './types/change-type.enum.js';
import { SchemaDiffPromptItem } from './schema-diff-prompt-item.js';
import { SchemaDiffOutput } from '@directus/sdk';

@Injectable()
export class SchemaDiffPromptService {
  public prompt: Prompt<SchemaDiffOutput, SchemaDiffPromptConfig>;

  constructor(private readonly config: ConfigService) {
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
      const increment = isUpKey(key) ? -1 : 1;
      let next = active + increment;

      if (next >= 0 && next < items.length) {
        setActive(next);
      }
    } else if (isSpaceKey(key)) {
      const newItems = new Array(...items);
      items.forEach((item, index) => {
        if (index === active) {
          item.selected = !item.selected;
        }
      });
      setItems(newItems);
    } else if (key.name === 'd') {
      const newItems = new Array(...items);
      items[active].showDetails = !items[active].showDetails;
      setItems(newItems);
    }
  }

  private createItems(opts: SchemaDiffPromptConfig) {
    const ignore = this.config.getSchemaDiffIgnore();
    return useState<Array<SchemaDiffPromptItem>>(
      opts.diffOutput.diff.collections
        .filter((collection) => !ignore.collections.has(collection.collection))
        .map((collection) => {
          const items = [SchemaDiffPromptItem.fromCollection(collection)]
            .concat(
              opts.diffOutput.diff.fields
                .filter((field) => field.collection === collection.collection)
                .filter(
                  (field) =>
                    !ignore.fields[collection.collection]?.includes(
                      field.field,
                    ),
                )
                .map((field) => SchemaDiffPromptItem.fromField(field)),
            )
            .concat(
              opts.diffOutput.diff.relations
                .filter(
                  (relation) => relation.collection === collection.collection,
                )
                .filter(
                  (relation) =>
                    !ignore.fields[collection.collection]?.includes(
                      relation.field,
                    ),
                )
                .map((relation) => SchemaDiffPromptItem.fromRelation(relation)),
            );

          return items;
        })
        .flat(),
    );
  }
}
