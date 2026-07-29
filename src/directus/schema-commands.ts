import type {
  RestCommand,
  SchemaDiffOutput,
  SchemaSnapshotOutput,
} from '@directus/sdk';

/**
 * Drop-in replacements for the SDK's `schemaDiff`/`schemaApply` that upload the
 * payload as a file instead of sending it as a JSON body.
 *
 * The SDK sends `JSON.stringify(snapshot)` as the request body, which Directus
 * runs through express' JSON body parser — capped at `MAX_PAYLOAD_SIZE` (1mb by
 * default). Any non-trivial schema exceeds that and the server answers
 * `INVALID_PAYLOAD: Invalid payload. request entity too large.`
 *
 * Both `/schema/diff` and `/schema/apply` also accept `multipart/form-data`
 * (see Directus' `schemaMultipartHandler`), which streams the upload through
 * busboy and is therefore not subject to the body-parser limit.
 */
const jsonUpload = (payload: unknown): FormData => {
  const form = new FormData();
  // The part's mime type decides how Directus parses it: `application/json`
  // goes through JSON.parse, anything else through the YAML loader.
  form.append(
    'file',
    new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    'payload.json',
  );
  return form;
};

export const schemaDiff =
  <Schema>(
    snapshot: SchemaSnapshotOutput,
    force = false,
  ): RestCommand<SchemaDiffOutput, Schema> =>
  () => ({
    method: 'POST',
    path: '/schema/diff',
    params: force ? { force } : {},
    // The rest composable strips this header so fetch can set the boundary.
    headers: { 'Content-Type': 'multipart/form-data' },
    body: jsonUpload(snapshot),
  });

export const schemaApply =
  <Schema>(
    diff: SchemaDiffOutput,
    force = false,
  ): RestCommand<void, Schema> =>
  () => ({
    method: 'POST',
    path: '/schema/apply',
    params: force ? { force } : {},
    headers: { 'Content-Type': 'multipart/form-data' },
    body: jsonUpload(diff),
  });
