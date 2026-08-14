import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

/** Render markdown notes safely (react-markdown does not emit raw HTML;
 *  rehype-sanitize is belt-and-suspenders). */
export function NotesView({ notes }: { notes: string }) {
  if (!notes.trim()) {
    return <p className="text-sm text-muted">No notes yet.</p>;
  }
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {notes}
      </ReactMarkdown>
    </div>
  );
}
