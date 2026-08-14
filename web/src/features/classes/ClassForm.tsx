import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
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

/** Shared name + color form, used inline (create) and in a modal (edit). */
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit({ name: name.trim(), color });
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <Field label="Class name" htmlFor="class-name">
        <Input
          id="class-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Calculus"
          required
          maxLength={64}
        />
      </Field>
      <Field label="Color">
        <ColorPicker value={color} onChange={setColor} />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
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
