import { useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { cn } from "../../lib/cn";
import { ColorPicker } from "./ColorPicker";

interface ClassFormValues {
  name: string;
  color: string;
}

interface ClassFormProps {
  initialName?: string;
  initialColor?: string;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: ClassFormValues) => Promise<void>;
  onCancel?: () => void;
}

/** Shared name + color form, used inline (create) and in a modal (edit).
 *  Client-side validation covers what the UI can know — a non-blank name —
 *  with instant inline feedback; the server stays the final authority for
 *  normalization and duplicate detection. */
export function ClassForm({
  initialName = "",
  initialColor = "#6366f1",
  submitLabel,
  busy = false,
  error = null,
  onSubmit,
  onCancel,
}: ClassFormProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const nameRef = useRef<HTMLInputElement>(null);

  // Errors appear only after a submit attempt and are derived from the value,
  // so the message clears the moment the field becomes valid.
  const [attempted, setAttempted] = useState(false);
  const nameError = attempted && !name.trim() ? "Class name is required." : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    await onSubmit({ name: name.trim(), color });
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <Field label="Class name" htmlFor="class-name" required error={nameError}>
        <Input
          id="class-name"
          ref={nameRef}
          value={name}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "class-name-error" : undefined}
          className={cn(nameError && "border-danger focus-visible:ring-danger/60")}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Calculus"
          maxLength={64}
        />
      </Field>
      <Field label="Color">
        <ColorPicker value={color} onChange={setColor} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">Fields marked with * are required.</p>
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
