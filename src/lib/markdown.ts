import { marked } from 'marked';

// Render a single line of inline markdown (bold/italic/code/links) to HTML.
// parseInline avoids block-level <p> wrapping so it drops into inline spans.
export function inlineMarkdown(text: string): string {
  return marked.parseInline(text) as string;
}
