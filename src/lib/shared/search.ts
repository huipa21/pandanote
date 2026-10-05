import { DomainError } from './domain.ts';

export const MAX_QUERY_CODEPOINTS = 256;
export const MAX_SEARCH_UNITS = 20;
export const normalizeSearch = (value: string): string =>
  value.normalize('NFKC').toLowerCase();

/** Grammar: whitespace-separated units or double-quoted phrases. Only \" and
 * \\ are escapes; unknown escapes retain the backslash as literal data.
 * Quotes must delimit a whole unit, not silently concatenate adjacent terms. */
export function parseSearch(query: string): string[] {
  if (query.includes('\0'))
    throw new DomainError(
      'validation',
      'Search cannot contain a NUL character.',
    );
  // Grammar escaping/canonical quotes may expand transport but not content.
  if ([...query].length > 1024)
    throw new DomainError(
      'validation',
      'Search input is too long (1024 characters including escapes).',
    );
  const units: string[] = [];
  let i = 0;
  while (i < query.length) {
    while (/\s/u.test(query[i] ?? '') && i < query.length) i++;
    if (i === query.length) break;
    const quoted = query[i] === '"';
    if (quoted) i++;
    let unit = '',
      closed = !quoted;
    while (i < query.length) {
      const ch = query[i++];
      if (ch === '\\' && ['"', '\\'].includes(query[i])) {
        unit += query[i++];
      } else if (ch === '"') {
        if (!quoted)
          throw new DomainError(
            'validation',
            'Put a phrase in separate double quotes.',
          );
        closed = true;
        break;
      } else if (!quoted && /\s/u.test(ch)) break;
      else unit += ch;
    }
    if (!closed)
      throw new DomainError(
        'validation',
        'Close the double quote to search an exact phrase.',
      );
    if (quoted && i < query.length && !/\s/u.test(query[i]))
      throw new DomainError('validation', 'Separate search terms with spaces.');
    if (!unit.length)
      throw new DomainError('validation', 'An exact phrase cannot be empty.');
    units.push(normalizeSearch(unit));
    if (
      units.reduce((n, value) => n + [...value].length, 0) >
      MAX_QUERY_CODEPOINTS
    )
      throw new DomainError(
        'validation',
        'Normalized search is limited to 256 characters.',
      );
    if (units.length > MAX_SEARCH_UNITS)
      throw new DomainError('validation', 'Use at most 20 search terms.');
  }
  return [...new Set(units)].sort();
}
export function canonicalSearch(query: string): string {
  // Round-trippable literal grammar, canonical AND identity independent of order.
  return parseSearch(query)
    .map((unit) => `"${unit.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(' ');
}
export function matchesSearch(
  fields: readonly string[],
  units: readonly string[],
): boolean {
  const normalized = fields.map(normalizeSearch);
  return units.every((unit) =>
    normalized.some((field) => field.includes(unit)),
  );
}
export interface SearchSegment {
  text: string;
  highlighted: boolean;
}
export interface SearchSnippet {
  field: 'body' | 'tag' | 'filename';
  segments: SearchSegment[];
}
/** Safe, explicitly normalized text; never offsets into the original source.
 * UTF-16 indices are used only within the same normalized string. */
export function searchSnippet(
  field: SearchSnippet['field'],
  normalized: string,
  units: readonly string[],
): SearchSnippet | undefined {
  // SQLite byte windows may have a boundary replacement character; neither
  // this safe excerpt nor its ranges are ever applied to saved source text.
  normalized = normalized.split('\0').join('␀');
  const points = [...normalized];
  const first = units
    .map((u) => normalized.indexOf(u))
    .filter((n) => n >= 0)
    .sort((a, b) => a - b)[0];
  if (first === undefined) return;
  const pointIndex = [...normalized.slice(0, first)].length;
  const start = Math.max(0, pointIndex - 48);
  const text = points.slice(start, start + 320).join('');
  const ranges: [number, number][] = [];
  for (const unit of units) {
    let from = 0,
      at: number;
    while ((at = text.indexOf(unit, from)) >= 0) {
      ranges.push([at, at + unit.length]);
      from = at + 1;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const segments: SearchSegment[] = [];
  if (start) segments.push({ text: '…', highlighted: false });
  let end = 0;
  for (const [a, b] of merged) {
    if (a > end)
      segments.push({ text: text.slice(end, a), highlighted: false });
    segments.push({ text: text.slice(a, b), highlighted: true });
    end = b;
  }
  if (end < text.length)
    segments.push({ text: text.slice(end), highlighted: false });
  if (start + 320 < points.length)
    segments.push({ text: '…', highlighted: false });
  return { field, segments };
}
