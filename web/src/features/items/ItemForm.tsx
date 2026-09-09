import { useRef, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import type { ItemFormValues, LinkDraft } from "../../lib/items";
import { KIND_DUE_LABELS, KIND_TITLE_LABELS, partsFromDueAt } from "../../lib/items";
import { cn } from "../../lib/cn";
import type { Item, ItemKind } from "../../lib/types";
import { useClasses } from "../classes/useClasses";
import { LinksEditor } from "./ItemLinks";
import { NotesEditor } from "./NotesEditor";
import { NotesView } from "./NotesView";
import { ProgressSlider } from "./ProgressSlider";

export type SubmitAction =
  "close" | "open" | "another-class" | "another-date" | "another-date-time";

/** Required form fields, in the order they appear — extend this list (and
 *  validateFields below) when a new required field is introduced. */
type RequiredField = "title" | "class" | "due";

/** Inline validation errors keyed by field; missing = the field is valid. */
type FieldErrors = Partial<Record<RequiredField, string>>;

const REQUIRED_FIELDS: readonly RequiredField[] = ["title", "class", "due"];

interface ItemFormProps {
  kind: ItemKind;
  mode: "create" | "edit";
  initial?: Item | null;
  defaultClassId?: string;
  defaultDueDate?: string;
  defaultDueTime?: string;
  busy?: boolean;
  error?: string | null;
  /** Show a live rendered preview under the notes editor. */
  showNotesPreview?: boolean;
  onSubmit: (values: ItemFormValues, action: SubmitAction) => Promise<void>;
  onCancel?: () => void;
}

/** The single item form shared by the quick-add dialog and the detail page.
 *  Kind is fixed by the entry point: assignments get a progress slider and a
 *  "Title" field; quizzes/exams get a "Name" field and no progress. */
export function ItemForm({
  kind,
  mode,
  initial,
  defaultClassId,
  defaultDueDate,
  defaultDueTime,
  busy = false,
  error = null,
  showNotesPreview = false,
  onSubmit,
  onCancel,
}: ItemFormProps) {
  const { data: classes } = useClasses();
  const isAssignment = kind === "assignment";

  const [title, setTitle] = useState(initial?.title ?? "");
  const [classId, setClassId] = useState(
    initial?.class.id ?? defaultClassId ?? classes?.[0]?.id ?? "",
  );
  const parts = initial ? partsFromDueAt(initial.due_at) : null;
  const [dueDate, setDueDate] = useState(
    parts?.date ?? defaultDueDate ?? format(new Date(), "yyyy-MM-dd"),
  );
  const [dueTime, setDueTime] = useState(parts?.time ?? defaultDueTime ?? "");
  const [dueTouched, setDueTouched] = useState(false);

  // In create mode the date/time shown is a default — today's date, or a
  // date carried over by an "add another" action — until the user edits it.
  // While untouched it renders greyed out so an item can't silently save with
  // a date the user never chose for it.
  const dueIsDefault = mode === "create" && !dueTouched;
  const [progress, setProgress] = useState(initial?.progress ?? 0);
  const [isPriority, setIsPriority] = useState(initial?.is_priority ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [links, setLinks] = useState<LinkDraft[]>(
    initial?.links.map((l) => ({ url: l.url, label: l.label ?? "" })) ?? [],
  );
  // Field errors only appear after the first submit attempt, so a fresh form
  // doesn't nag while the user is still typing.
  const [attempted, setAttempted] = useState(false);

  const values = (): ItemFormValues => ({
    kind,
    title,
    class_id: classId,
    due_date: dueDate,
    due_time: dueTime,
    progress,
    is_priority: isPriority,
    notes,
    links,
  });

  const titleRef = useRef<HTMLInputElement>(null);
  const classRef = useRef<HTMLSelectElement>(null);
  const dueRef = useRef<HTMLInputElement>(null);

  function validateFields(): FieldErrors {
    const errors: FieldErrors = {};
    if (!title.trim()) errors.title = `${KIND_TITLE_LABELS[kind]} is required.`;
    if (!classId) errors.class = "Pick a class.";
    if (!dueDate) errors.due = "Pick a date.";
    return errors;
  }

  // Errors are derived from the current values on every render, so after the
  // first submit attempt every missing field is reported at once — and each
  // message disappears the moment its field becomes valid, with no stale text.
  const fieldErrors: FieldErrors = attempted ? validateFields() : {};
  const hasErrors = REQUIRED_FIELDS.some((field) => fieldErrors[field] !== undefined);

  // The date input may carry either its error or the greyed "default date"
  // note; combine the ids so assistive tech hears whichever is current.
  const dueDescribedBy =
    [fieldErrors.due ? "item-date-error" : null, dueIsDefault ? "due-default-hint" : null]
      .filter((id): id is string => id !== null)
      .join(" ") || undefined;

  function focusFirstInvalid() {
    const first = REQUIRED_FIELDS.find((field) => fieldErrors[field]);
    if (!first) return;
    if (first === "title") titleRef.current?.focus();
    else if (first === "class") classRef.current?.focus();
    else dueRef.current?.focus();
  }

  function submit(action: SubmitAction) {
    setAttempted(true);
    if (hasErrors) {
      focusFirstInvalid();
      return;
    }
    return onSubmit(values(), action);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit("close");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field
        label={KIND_TITLE_LABELS[kind]}
        htmlFor="item-title"
        required
        error={fieldErrors.title}
      >
        <Input
          id="item-title"
          ref={titleRef}
          value={title}
          aria-invalid={fieldErrors.title ? true : undefined}
          aria-describedby={fieldErrors.title ? "item-title-error" : undefined}
          className={cn(fieldErrors.title && "border-danger focus-visible:ring-danger/60")}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isAssignment ? "e.g. Problem set 3" : "e.g. Chapter 4 quiz"}
          maxLength={200}
        />
      </Field>

      <Field label="Class" htmlFor="item-class" required error={fieldErrors.class}>
        <Select
          id="item-class"
          ref={classRef}
          value={classId}
          aria-invalid={fieldErrors.class ? true : undefined}
          aria-describedby={fieldErrors.class ? "item-class-error" : undefined}
          className={cn(fieldErrors.class && "border-danger focus-visible:ring-danger/60")}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="" disabled>
            Select a class…
          </option>
          {(classes ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={KIND_DUE_LABELS[kind]} htmlFor="item-date" required error={fieldErrors.due}>
          <Input
            id="item-date"
            ref={dueRef}
            type="date"
            value={dueDate}
            aria-invalid={fieldErrors.due ? true : undefined}
            aria-describedby={dueDescribedBy}
            className={cn(
              dueIsDefault && "opacity-60",
              fieldErrors.due && "border-danger focus-visible:ring-danger/60",
            )}
            onChange={(e) => {
              setDueDate(e.target.value);
              setDueTouched(true);
            }}
          />
        </Field>
        <Field label={`${KIND_DUE_LABELS[kind]} time (optional)`} htmlFor="item-time">
          <Input
            id="item-time"
            type="time"
            value={dueTime}
            aria-describedby={dueIsDefault ? "due-default-hint" : undefined}
            className={cn(dueIsDefault && "opacity-60")}
            onChange={(e) => {
              setDueTime(e.target.value);
              setDueTouched(true);
            }}
          />
        </Field>
      </div>
      {dueIsDefault && (
        <p id="due-default-hint" className="text-xs text-muted">
          This {KIND_DUE_LABELS[kind].toLowerCase()} is just the default — it hasn't been set for
          this item yet. Change it before saving if it isn't right.
        </p>
      )}

      {isAssignment && (
        <Field label={`Progress — ${progress}%`}>
          <ProgressSlider value={progress} onCommit={setProgress} />
        </Field>
      )}

      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
        <span className="text-sm font-medium text-foreground">Priority</span>
        <Switch checked={isPriority} onCheckedChange={setIsPriority} aria-label="Priority" />
      </div>

      <Field label="Notes">
        <NotesEditor value={notes} onChange={setNotes} />
      </Field>
      {showNotesPreview && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Preview</p>
          <div className="rounded-lg border border-border bg-surface p-3">
            <NotesView notes={notes} />
          </div>
        </div>
      )}

      <Field label="Links">
        <LinksEditor links={links} onChange={setLinks} />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">Fields marked with * are required.</p>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        {mode === "edit" && onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : mode === "edit" ? "Save changes" : "Create"}
        </Button>
      </div>

      {mode === "create" && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={busy}
            onClick={() => void submit("another-class")}
          >
            Create & add another (same class)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={busy}
            onClick={() => void submit("another-date")}
          >
            Create & add another (same date)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={busy}
            onClick={() => void submit("another-date-time")}
          >
            Create & add another (same class & date/time)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={busy}
            onClick={() => void submit("open")}
          >
            Create & open
          </Button>
        </div>
      )}
    </form>
  );
}
