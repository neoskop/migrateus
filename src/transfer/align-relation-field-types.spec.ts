import { describe, it, expect } from '@jest/globals';
import { alignUuidForeignKeyTypes } from './align-relation-field-types.js';

describe('alignUuidForeignKeyTypes', () => {
  it('coerces a string m2o FK to uuid when the referenced PK is uuid', () => {
    const snapshot = {
      fields: [
        {
          collection: 'parent',
          field: 'id',
          type: 'uuid',
          schema: { is_primary_key: true, data_type: 'char', max_length: 36 },
        },
        {
          collection: 'child',
          field: 'parent_id',
          type: 'string',
          schema: { is_primary_key: false, data_type: 'varchar', max_length: 255 },
        },
      ],
      relations: [
        { collection: 'child', field: 'parent_id', related_collection: 'parent' },
      ],
    };

    alignUuidForeignKeyTypes(snapshot);

    const fk = snapshot.fields[1];
    expect(fk.type).toBe('uuid');
    // Mirrors the referenced PK's column description so apply builds a uuid column.
    expect(fk.schema.data_type).toBe('char');
    expect(fk.schema.max_length).toBe(36);
  });

  it('leaves the FK untouched when the referenced PK is not uuid (e.g. integer)', () => {
    const snapshot = {
      fields: [
        {
          collection: 'parent',
          field: 'id',
          type: 'integer',
          schema: { is_primary_key: true, data_type: 'integer' },
        },
        {
          collection: 'child',
          field: 'parent_id',
          type: 'integer',
          schema: { is_primary_key: false, data_type: 'integer' },
        },
      ],
      relations: [
        { collection: 'child', field: 'parent_id', related_collection: 'parent' },
      ],
    };

    alignUuidForeignKeyTypes(snapshot);

    expect(snapshot.fields[1].type).toBe('integer');
  });

  it('ignores relations without a related_collection (M2A) and missing FK fields', () => {
    const snapshot = {
      fields: [
        {
          collection: 'parent',
          field: 'id',
          type: 'uuid',
          schema: { is_primary_key: true, data_type: 'char', max_length: 36 },
        },
      ],
      relations: [
        { collection: 'child', field: 'item', related_collection: null },
        { collection: 'ghost', field: 'x', related_collection: 'parent' },
      ],
    };

    expect(() => alignUuidForeignKeyTypes(snapshot)).not.toThrow();
  });

  it('is a no-op when the FK is already uuid', () => {
    const snapshot = {
      fields: [
        {
          collection: 'parent',
          field: 'id',
          type: 'uuid',
          schema: { is_primary_key: true, data_type: 'char', max_length: 36 },
        },
        {
          collection: 'child',
          field: 'parent_id',
          type: 'uuid',
          schema: { is_primary_key: false, data_type: 'char', max_length: 36 },
        },
      ],
      relations: [
        { collection: 'child', field: 'parent_id', related_collection: 'parent' },
      ],
    };

    alignUuidForeignKeyTypes(snapshot);

    expect(snapshot.fields[1].type).toBe('uuid');
  });
});
