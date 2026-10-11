/**
 * Nested-tag path helpers and the count-ordered sidebar tree.
 *
 * Tag keys are normalized paths such as `work/meeting`. Parents are implicit:
 * a note tagged `#work/meeting` belongs to the `work` group without a `work` join.
 * See docs/nested-tags/SPEC.md.
 */
import { TAG_SEPARATOR } from './markdown/tags.ts';

export function tagSegments(key: string): string[] {
  return key.split(TAG_SEPARATOR);
}
export function tagDepth(key: string): number {
  return tagSegments(key).length;
}
/** Proper ancestors, shortest first: `a/b/c` → `a`, `a/b`. */
export function tagAncestors(key: string): string[] {
  const parts = tagSegments(key);
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}
/** True when `key` is `parent` or one of its descendants. */
export function isWithinTag(key: string, parent: string): boolean {
  return key === parent || key.startsWith(parent + TAG_SEPARATOR);
}
/**
 * Exclusive upper bound of `parent`'s descendants in BINARY order: every key
 * starting with `parent/` lies in [`parent/`, `parent0`), since `0` follows `/`.
 */
export function tagSubtreeUpper(parent: string): string {
  return parent + '0';
}
/** Replace a leading `from` path of `key` with `to` (both whole segments). */
export function replaceTagPrefix(
  key: string,
  from: string,
  to: string,
): string {
  if (!isWithinTag(key, from))
    throw new Error('The tag is not inside the source path.');
  return to + key.slice(from.length);
}
/** Join a new prefix with the trailing source segments of `spelling`. */
export function joinTagSuffix(
  prefix: string,
  spelling: string,
  suffixStart: number,
): string {
  const rest = tagSegments(spelling).slice(suffixStart);
  return rest.length ? [prefix, ...rest].join(TAG_SEPARATOR) : prefix;
}
/** Deterministic Unicode code-point order (matches SQLite BINARY for UTF-8). */
export function compareTagKeys(a: string, b: string): number {
  const x = [...a],
    y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (d) return d;
  }
  return x.length - y.length;
}

export interface TagNode {
  /** Normalized full path, used for filters. */
  key: string;
  /** Source spelling of the full path. */
  display: string;
  /** Source spelling of the last segment. */
  label: string;
  /** Distinct published notes tagged with this node or any descendant. */
  count: number;
  children: TagNode[];
}
export interface ExplicitTagCount {
  key: string;
  display: string;
  /** Published notes with exactly this tag. */
  count: number;
}

/** Display of `key` derived from an explicit descendant's display, if shapes agree. */
function prefixDisplay(key: string, descendantDisplay: string): string {
  const depth = tagDepth(key);
  const parts = tagSegments(descendantDisplay);
  return parts.length >= depth
    ? parts.slice(0, depth).join(TAG_SEPARATOR)
    : key;
}

/**
 * Build the count-ordered tree. `subtreeCounts` must hold the distinct published
 * count of every node that has descendants (explicit or implicit); leaves use their
 * direct count. Children at every level sort by count descending, then key.
 */
export function buildTagTree(
  explicit: readonly ExplicitTagCount[],
  subtreeCounts: ReadonlyMap<string, number>,
): TagNode[] {
  const ordered = [...explicit].sort((a, b) => compareTagKeys(a.key, b.key));
  const nodes = new Map<string, TagNode>();
  const ensure = (key: string, display: string): TagNode => {
    let node = nodes.get(key);
    if (!node) {
      node = { key, display, label: '', count: 0, children: [] };
      nodes.set(key, node);
    }
    return node;
  };
  // Explicit displays win; implicit parents take the lowest-key descendant's prefix.
  for (const tag of ordered) ensure(tag.key, tag.display).count = tag.count;
  for (const tag of ordered)
    for (const ancestor of tagAncestors(tag.key))
      ensure(ancestor, prefixDisplay(ancestor, tag.display));
  const roots: TagNode[] = [];
  for (const node of nodes.values()) {
    const segments = tagSegments(node.display);
    node.label =
      segments.length === tagDepth(node.key)
        ? segments.at(-1)!
        : tagSegments(node.key).at(-1)!;
    const parent = tagAncestors(node.key).at(-1);
    if (parent === undefined) roots.push(node);
    else nodes.get(parent)!.children.push(node);
  }
  for (const node of nodes.values())
    if (node.children.length)
      node.count = subtreeCounts.get(node.key) ?? node.count;
  const sort = (list: TagNode[]) => {
    list.sort((a, b) => b.count - a.count || compareTagKeys(a.key, b.key));
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}

/** Every node in depth-first display order. */
export function flattenTagTree(nodes: readonly TagNode[]): TagNode[] {
  return nodes.flatMap((node) => [node, ...flattenTagTree(node.children)]);
}
/** Keys of all nodes with descendants (the ones needing a distinct subtree count). */
export function tagParentKeys(keys: readonly string[]): string[] {
  return [...new Set(keys.flatMap(tagAncestors))];
}
/**
 * Keep nodes whose full display path or any segment contains `query`
 * (case-insensitive), plus their ancestors. Returns the pruned tree and the keys
 * that must be expanded to reveal matches.
 */
export function filterTagTree(
  nodes: readonly TagNode[],
  query: string,
): { nodes: TagNode[]; expanded: Set<string> } {
  const needle = query.normalize('NFKC').toLowerCase().trim();
  const expanded = new Set<string>();
  if (!needle) return { nodes: [...nodes], expanded };
  const visit = (list: readonly TagNode[]): TagNode[] =>
    list.flatMap((node) => {
      const children = visit(node.children);
      const own =
        node.key.includes(needle) ||
        node.display.normalize('NFKC').toLowerCase().includes(needle);
      if (children.length) expanded.add(node.key);
      if (!own) return children.length ? [{ ...node, children }] : [];
      // A matching group keeps all of its children; matching ones stay revealed.
      const kept = new Map(children.map((child) => [child.key, child]));
      return [
        {
          ...node,
          children: node.children.map((child) => kept.get(child.key) ?? child),
        },
      ];
    });
  return { nodes: visit(nodes), expanded };
}
/**
 * Displays for every registry path and its implicit parents. Explicit rows win;
 * a parent takes the matching prefix of its lowest-key descendant's display.
 */
export function tagPathDisplays(
  rows: readonly { key: string; display: string }[],
): Map<string, string> {
  const ordered = [...rows].sort((a, b) => compareTagKeys(a.key, b.key));
  const all = new Map<string, string>();
  for (const row of ordered) all.set(row.key, row.display);
  for (const row of ordered)
    for (const ancestor of tagAncestors(row.key))
      if (!all.has(ancestor))
        all.set(ancestor, prefixDisplay(ancestor, row.display));
  return all;
}
/** Tree (depth-first) order: compare segment by segment, parents before children. */
export function compareTagPaths(a: string, b: string): number {
  const x = tagSegments(a),
    y = tagSegments(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = compareTagKeys(x[i], y[i]);
    if (d) return d;
  }
  return x.length - y.length;
}
