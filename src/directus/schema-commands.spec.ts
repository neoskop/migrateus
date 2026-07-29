import { describe, it, expect } from '@jest/globals';
import { schemaApply, schemaDiff } from './schema-commands.js';

describe('schema commands', () => {
  it('uploads the snapshot as a JSON file part instead of a JSON body', async () => {
    const snapshot = { version: 1, collections: [{ collection: 'posts' }] };
    const options = schemaDiff(snapshot as never, true)();

    expect(options.path).toBe('/schema/diff');
    expect(options.params).toEqual({ force: true });
    // Signals the rest composable to let fetch set the multipart boundary.
    expect(options.headers).toEqual({ 'Content-Type': 'multipart/form-data' });

    const body = options.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const file = body.get('file') as File;
    expect(file.type).toBe('application/json');
    expect(JSON.parse(await file.text())).toEqual(snapshot);
  });

  it('omits the force param when not forcing and posts the diff to /schema/apply', async () => {
    const diff = { hash: 'abc', diff: { collections: [] } };
    const options = schemaApply(diff)();

    expect(options.path).toBe('/schema/apply');
    expect(options.params).toEqual({});
    const file = (options.body as FormData).get('file') as File;
    expect(JSON.parse(await file.text())).toEqual(diff);
  });
});
