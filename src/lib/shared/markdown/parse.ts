import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root } from 'mdast';

const parser = unified().use(remarkParse).use(remarkGfm);
export const MAX_MARKDOWN_LENGTH = 1_048_576;
export function parseMarkdown(source: string): Root {
  if (
    source.length > MAX_MARKDOWN_LENGTH ||
    new TextEncoder().encode(source).byteLength > MAX_MARKDOWN_LENGTH
  )
    throw new Error('Markdown exceeds the 1 MiB text limit.');
  return parser.parse(source) as Root;
}
