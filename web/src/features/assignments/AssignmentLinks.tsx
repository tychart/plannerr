import { ExternalLink, Plus, X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import type { AssignmentLink } from "../../lib/types";
import type { LinkDraft } from "../../lib/assignment";

interface LinksEditorProps {
  links: LinkDraft[];
  onChange: (links: LinkDraft[]) => void;
}

/** Inline editor for an assignment's links (url + optional label). */
export function LinksEditor({ links, onChange }: LinksEditorProps) {
  function update(index: number, patch: Partial<LinkDraft>) {
    onChange(links.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  return (
    <div className="space-y-2">
      {links.map((link, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input
            type="url"
            placeholder="https://…"
            aria-label={`Link ${index + 1} URL`}
            value={link.url}
            onChange={(e) => update(index, { url: e.target.value })}
            className="min-w-0 flex-1"
          />
          <Input
            placeholder="Label (optional)"
            aria-label={`Link ${index + 1} label`}
            value={link.label}
            onChange={(e) => update(index, { label: e.target.value })}
            className="w-full sm:w-40"
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label="Remove link"
            onClick={() => onChange(links.filter((_, i) => i !== index))}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {links.length < 5 && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange([...links, { url: "", label: "" }])}
        >
          <Plus className="h-4 w-4" /> Add link
        </Button>
      )}
    </div>
  );
}

interface LinksViewProps {
  links: AssignmentLink[];
}

/** Read-only list of an assignment's saved links. */
export function LinksView({ links }: LinksViewProps) {
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {links.map((link) => (
        <li key={link.id}>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-surface-2"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{link.label || link.url}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
