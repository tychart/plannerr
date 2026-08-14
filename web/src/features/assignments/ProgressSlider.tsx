import { useEffect, useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { PROGRESS_STEP, snapProgress } from "../../lib/progress";

interface ProgressSliderProps {
  value: number;
  /** Committed value (fires once per drag, on release). */
  onCommit: (value: number) => void;
  disabled?: boolean;
}

/** 0–100 slider that snaps to increments of 5; 100 marks the assignment complete. */
export function ProgressSlider({ value, onCommit, disabled }: ProgressSliderProps) {
  // Local state tracks the thumb live during a drag; the server value
  // (which arrives async) resyncs it via the effect below.
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div className="flex items-center gap-3">
      <SliderPrimitive.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        min={0}
        max={100}
        step={PROGRESS_STEP}
        value={[snapProgress(localValue)]}
        onValueChange={(v) => setLocalValue(v[0])}
        onValueCommit={(v) => onCommit(v[0])}
        disabled={disabled}
        aria-label="Progress"
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-surface-2">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-primary bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </SliderPrimitive.Root>
      <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted">
        {snapProgress(localValue)}%
      </span>
    </div>
  );
}
