interface SnapshotField {
  collection: string;
  field: string;
  type?: string;
  schema?: {
    is_primary_key?: boolean;
    data_type?: string;
    max_length?: number | null;
    numeric_precision?: number | null;
    numeric_scale?: number | null;
  } | null;
}

interface SnapshotRelation {
  collection: string;
  field: string;
  related_collection?: string | null;
}

/**
 * Aligns each many-to-one foreign-key field's type to the referenced
 * collection's primary-key type when that PK is a `uuid`.
 *
 * SQLite has no native uuid type, so a snapshot taken there records uuid FK
 * columns as `string`/`varchar`. Applied verbatim to a database with a real
 * uuid type (e.g. Postgres), the FK column (varchar) then mismatches the
 * referenced uuid PK and the foreign key cannot be created
 * ("incompatible types: character varying and uuid").
 *
 * Mutates the snapshot in place.
 */
export function alignUuidForeignKeyTypes(snapshot: {
  fields?: SnapshotField[];
  relations?: SnapshotRelation[];
}): void {
  const fields = snapshot.fields ?? [];
  const relations = snapshot.relations ?? [];

  const pkByCollection = new Map<string, SnapshotField>();
  for (const field of fields) {
    if (field.schema?.is_primary_key) {
      pkByCollection.set(field.collection, field);
    }
  }

  for (const relation of relations) {
    const relatedCollection = relation.related_collection;
    if (!relatedCollection) {
      continue;
    }

    const pk = pkByCollection.get(relatedCollection);
    if (!pk || pk.type !== 'uuid') {
      continue;
    }

    const fkField = fields.find(
      (f) => f.collection === relation.collection && f.field === relation.field,
    );
    if (!fkField || fkField.type === 'uuid') {
      continue;
    }

    // Match the FK column to the referenced uuid PK so apply builds a uuid
    // column on databases with a native uuid type.
    fkField.type = 'uuid';
    if (fkField.schema && pk.schema) {
      fkField.schema.data_type = pk.schema.data_type;
      fkField.schema.max_length = pk.schema.max_length ?? null;
      fkField.schema.numeric_precision = pk.schema.numeric_precision ?? null;
      fkField.schema.numeric_scale = pk.schema.numeric_scale ?? null;
    }
  }
}
