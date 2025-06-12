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
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { MigrateDataPromptItem } from './migrate-data-prompt-item.js';
import { MigrateDataPromptConfig } from './types/migrate-data-prompt-config.type.js';

@Injectable()
export class MigrateDataPromptService {
  public prompt: Prompt<string[], MigrateDataPromptConfig>;

  constructor(
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) protected readonly logger: Logger,
  ) {
    this.setupPrompt();
  }

  private setupPrompt() {
    this.prompt = createPrompt<string[], MigrateDataPromptConfig>(
      (opts, done) => {
        const [active, setActive] = useState(0);
        const [items, setItems] = useState(this.createItems(opts));
        const page = usePagination({
          items,
          active: active,
          renderItem: ({ item, isActive }) => item.render(isActive),
          pageSize: this.config.pageSize,
          loop: false,
        });
        const prefix = [
          `? Select the collections to migrate from ${chalk.bold(opts.from)} to ${chalk.bold(opts.to)}`,
          `${chalk.bold('↑')} and ${chalk.bold('↓')} to navigate`,
          `${chalk.bold('space')} to select a change`,
          `${chalk.bold('enter')} to migrate data`,
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

  private createItems(opts: MigrateDataPromptConfig) {
    return opts.collections.map(
      (collection) => new MigrateDataPromptItem(collection),
    );
  }

  private handleKeypress(
    key: KeypressEvent,
    active: number,
    setActive: (newValue: number) => void,
    items: MigrateDataPromptItem[],
    setItems: (newValue: MigrateDataPromptItem[]) => void,
    done: (value: string[]) => void,
    opts: MigrateDataPromptConfig,
  ) {
    if (isEnterKey(key)) {
      const result = items
        .filter((item) => item.selected)
        .map((item) => item.name);
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
    }
  }
}
