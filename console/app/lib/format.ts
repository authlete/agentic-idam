// Small, pure text helpers shared across the console. No React, no state — just formatting.

/** Last path segment of a long entity id / mark type, for compact display. */
export function shortId(value: string): string {
  return value.split('/').pop() ?? value;
}

/** Turn a display name into a url-safe agent ref, e.g. "Invoice Reconciler" -> "invoice-reconciler". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Split a comma-separated input into a clean list, dropping blanks. */
export function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
