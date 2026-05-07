const STRING_ESCAPE_MAP: Record<string, string> = {
  '\\': '\\\\',
  "'": "''",
  '"': '\\"',
  '\0': '\\0',
  '\b': '\\b',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\x1a': '\\Z',
};

const STRING_ESCAPE_REGEX = /[\\'"\0\b\n\r\t\x1a]/g;

export function escapeMysqlString(value: string): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  return `'${String(value).replace(STRING_ESCAPE_REGEX, (c) => STRING_ESCAPE_MAP[c])}'`;
}

export function escapeMysqlIdentifier(identifier: string): string {
  if (typeof identifier !== 'string' || identifier.length === 0) {
    throw new Error('Identifier must be a non-empty string');
  }

  return `\`${identifier.replaceAll('`', '``')}\``;
}

const SAFE_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_$]{0,63}$/;

export function assertSafeIdentifier(
  identifier: string,
  context: string,
): string {
  if (!SAFE_IDENTIFIER_REGEX.test(identifier)) {
    throw new Error(
      `Invalid SQL identifier for ${context}: ${JSON.stringify(identifier)}`,
    );
  }

  return identifier;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, context: string): string {
  if (!UUID_REGEX.test(value)) {
    throw new Error(`Invalid UUID for ${context}: ${JSON.stringify(value)}`);
  }

  return value;
}

const SAFE_CHARSET_REGEX = /^[A-Za-z0-9_]{1,64}$/;

export function assertSafeCharsetOrCollation(
  value: string,
  context: string,
): string {
  if (!SAFE_CHARSET_REGEX.test(value)) {
    throw new Error(
      `Invalid charset/collation for ${context}: ${JSON.stringify(value)}`,
    );
  }

  return value;
}
