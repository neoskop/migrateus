/** POSIX single-quote a string so it is safe as one shell word (handles $,`,",',space,etc.). */
export function shquote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
