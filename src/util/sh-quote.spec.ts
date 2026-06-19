import { describe, it, expect } from '@jest/globals';
import { shquote } from './sh-quote.js';

describe('shquote', () => {
  it("wraps a plain value in single quotes: shquote('a') === \"'a'\"", () => {
    expect(shquote('a')).toBe("'a'");
  });

  it("escapes an embedded single quote: shquote(\"a'b\") === \"'a'\\\\''b'\"", () => {
    // The resulting shell word is: 'a'\''b'
    expect(shquote("a'b")).toBe("'a'\\''b'");
  });

  it('wraps a value with $ in single quotes (prevents variable expansion)', () => {
    const result = shquote('$x');
    expect(result.startsWith("'")).toBe(true);
    expect(result.endsWith("'")).toBe(true);
    expect(result).toBe("'$x'");
  });

  it('wraps a value with a backtick in single quotes', () => {
    const result = shquote('`ls`');
    expect(result.startsWith("'")).toBe(true);
    expect(result.endsWith("'")).toBe(true);
    expect(result).toBe("'`ls`'");
  });

  it('wraps a value with double-quote in single quotes', () => {
    const result = shquote('"hello"');
    expect(result.startsWith("'")).toBe(true);
    expect(result.endsWith("'")).toBe(true);
    expect(result).toBe(`'"hello"'`);
  });
});
