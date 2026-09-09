import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface FieldProps {
  label: string;
  htmlFor?: string;
  /** Marks the label with a red * plus a visually hidden "(required)" for
   *  screen readers. Pair it with a visible legend elsewhere in the form. */
  required?: boolean;
  /** Inline validation error rendered beneath the field. */
  error?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, required, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="text-danger">
              {" "}
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </label>
      {children}
      {error && (
        <p
          id={htmlFor ? `${htmlFor}-error` : undefined}
          className="text-xs text-danger"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
