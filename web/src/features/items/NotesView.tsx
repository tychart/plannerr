import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

/** Render markdown notes safely (react-markdown does not emit raw HTML;
 *  rehype-sanitize is belt-and-suspenders). GFM also turns plain URLs into
 *  clickable links, so pasted study resources work without extra formatting. */
export function NotesView({ notes }: { notes: string }) {
  if (!notes.trim()) {
    return <p className="text-sm text-muted">No notes yet.</p>;
  }
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={markdownComponents}
      >
        {notes}
      </ReactMarkdown>
    </div>
  );
}
