import { converter, formatHex } from "culori";
import type { CSSProperties } from "react";

type OklchColor = {
  mode: "oklch";
  l: number;
  c: number;
  h?: number;
};

const toOklch = converter("oklch") as (color: string) => OklchColor | undefined;
const toRgb = converter("rgb") as (color: string) => { r: number; g: number; b: number } | undefined;

export const getGameBackgroundStyle = (color: string): CSSProperties => {
  const base = toOklch(color) ?? { mode: "oklch", l: 0.72, c: 0.12, h: 30 };
  const soft = formatHex({
    mode: "oklch",
    l: Math.min(0.95, base.l + 0.16),
    c: Math.max(0.03, base.c * 0.42),
    h: base.h,
  });
  const vivid = formatHex({
    mode: "oklch",
    l: Math.max(0.54, base.l - 0.04),
    c: Math.min(0.22, base.c * 1.2),
    h: base.h,
  });
  const deep = formatHex({
    mode: "oklch",
    l: 0.24,
    c: Math.max(0.04, base.c * 0.5),
    h: base.h,
  });

  return {
    backgroundColor: soft,
    backgroundImage: `
      radial-gradient(circle at 18% 16%, ${vivid}66 0, transparent 34%),
      radial-gradient(circle at 88% 12%, ${deep}33 0, transparent 28%),
      linear-gradient(135deg, ${soft} 0%, #fffdfa 48%, ${vivid}28 100%)
    `,
  };
};

export const getDitherWaveColor = (color: string): [number, number, number] => {
  const rgb = toRgb(color);
  if (!rgb) return [0.32, 0.15, 1];

  const maxChannel = Math.max(rgb.r, rgb.g, rgb.b, 0.001);
  return [
    Math.min(1, Math.max(0.08, (rgb.r / maxChannel) * 0.92)),
    Math.min(1, Math.max(0.08, (rgb.g / maxChannel) * 0.92)),
    Math.min(1, Math.max(0.08, (rgb.b / maxChannel) * 0.92)),
  ];
};

export const getLineWaveTheme = (color: string) => {
  const base = toOklch(color) ?? { mode: "oklch", l: 0.68, c: 0.12, h: 250 };
  const hue = base.h ?? 250;
  const accent = formatHex({
    mode: "oklch",
    l: Math.min(0.78, Math.max(0.62, base.l + 0.04)),
    c: Math.min(0.13, Math.max(0.055, base.c * 0.58)),
    h: hue,
  });
  const companion = formatHex({
    mode: "oklch",
    l: Math.min(0.82, Math.max(0.64, base.l + 0.08)),
    c: Math.min(0.11, Math.max(0.045, base.c * 0.48)),
    h: (hue + 38) % 360,
  });
  const highlight = formatHex({
    mode: "oklch",
    l: 0.88,
    c: Math.min(0.07, Math.max(0.025, base.c * 0.28)),
    h: (hue + 350) % 360,
  });
  const background = formatHex({
    mode: "oklch",
    l: 0.17,
    c: Math.min(0.045, Math.max(0.018, base.c * 0.22)),
    h: hue,
  });

  return {
    backgroundColor: background,
    colors: [accent, companion, highlight],
  };
};
