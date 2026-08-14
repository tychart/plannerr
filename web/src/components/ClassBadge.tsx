import { cn } from "../lib/cn";
import { contrastTextColor } from "../lib/color";

interface ClassBadgeProps {
  name: string;
  color: string;
  className?: string;
}

/** Small pill showing a class name on its color; text is auto-contrasted. */
export function ClassBadge({ name, color, className }: ClassBadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)}
      style={{ backgroundColor: color, color: contrastTextColor(color) }}
    >
      {name}
    </span>
  );
}
