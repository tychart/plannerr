/** Progress slider helpers — the UI snaps to steps of 5, matching the API. */

export const PROGRESS_STEP = 5;

/** Snap an arbitrary value to the nearest multiple of 5 within [0, 100]. */
export function snapProgress(value: number): number {
  const snapped = Math.round(value / PROGRESS_STEP) * PROGRESS_STEP;
  return Math.min(100, Math.max(0, snapped));
}
