import type { Nodes } from 'mdast';
import { DomainError, idSchema } from '../../shared/domain.ts';
import { parseMarkdown } from '../../shared/markdown/parse.ts';
import { extractTags } from '../../shared/markdown/tags.ts';

/** Validate actual Markdown image nodes/definitions, not code examples or an
 * arbitrary substring scan. Remote/unresolved images cannot silently publish as
 * broken content (the renderer supports descriptor-backed internal images only). */
export function inspectContent(body: string, imageIds: Set<string>) {
  try {
    const tree = parseMarkdown(body);
    const definitions = new Map<string, string>();
    const collect = (node: Nodes): void => {
      if (node.type === 'definition' && !definitions.has(node.identifier))
        definitions.set(node.identifier, node.url);
      if ('children' in node) node.children.forEach(collect);
    };
    collect(tree);
    const visit = (node: Nodes): void => {
      if (node.type === 'image' || node.type === 'imageReference') {
        const url =
          node.type === 'image' ? node.url : definitions.get(node.identifier);
        const id = url?.startsWith('attachment:')
          ? url.slice('attachment:'.length)
          : '';
        if (!idSchema.safeParse(id).success || !imageIds.has(id))
          throw new DomainError(
            'validation',
            'err.everyMarkdownImageMustReference',
          );
      }
      if ('children' in node) node.children.forEach(visit);
    };
    visit(tree);
    const extracted = extractTags(body);
    // NFKC may expand a valid source spelling beyond the registry's 64-codepoint
    // bound (e.g. ligatures). Reject at the domain boundary, not via raw SQL error.
    if (extracted.some((tag) => [...tag.key].length > 64))
      throw new DomainError('validation', 'err.aNormalizedTagExceeds64');
    return extracted;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('validation', 'err.checkTheMarkdownSizeAnd');
  }
}
