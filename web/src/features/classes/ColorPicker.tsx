import { cn } from "../../lib/cn";

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#22c55e", // green
  "#f59e0b", // amber
  "#f97316", // orange
  "#ef4444", // red
  "#ec4899", // pink
  "#a855f7", // purple
  "#78716c", // stone
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

/** Predefined swatches plus a native color wheel; both write a hex value. */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Preset colors">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Select color ${color}`}
            onClick={() => onChange(color)}
            className={cn(
              "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value.toLowerCase() === color ? "border-foreground" : "border-transparent",
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm text-muted">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
          aria-label="Custom color"
        />
        Custom color
      </label>
    </div>
  );
}
