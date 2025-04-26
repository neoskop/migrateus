import { Kind } from './kind.type.js';

export type Change = {
  collection: string;
  field?: string;
  diff: {
    kind: Kind;
  }[];
};

export type Diff = {
  collections: Change[];
  fields: Change[];
  relations: Change[];
};
