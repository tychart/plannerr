/** Color helpers: derive readable text color from a class hex color. */

export function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an sRGB hex color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb;
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * Pick readable text ("#ffffff" or "#000000") on a given background.
 * The strict WCAG crossover sits at luminance ≈ 0.179; for colored badges we
 * bias toward white text slightly higher (0.3) — matches how UI kits render
 * white text on mid-tones like indigo while keeping black on light tones.
 */
const WHITE_TEXT_MAX_LUMINANCE = 0.3;

export function contrastTextColor(hex: string): string {
  return relativeLuminance(hex) < WHITE_TEXT_MAX_LUMINANCE ? "#ffffff" : "#000000";
}
