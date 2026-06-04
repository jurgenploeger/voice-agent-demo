// Shared colour model + conversions.
//
// Colours are stored as full HSV — hue (0-360), saturation and value (0-1) —
// so a customer's brand colour (including muted, pastel, or dark tones) is
// preserved end to end, instead of only its hue. The shaders consume the same
// HSV; hex is just the human-facing I/O format for the picker.

export type Color = { h: number; s: number; v: number };

export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
function smoothstep(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const seq: [number, number, number][] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ];
  return seq[i % 6];
}

export function rgbToHsv(r: number, g: number, b: number): Color {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hex2(n: number) {
  return Math.round(clamp01(n) * 255)
    .toString(16)
    .padStart(2, "0");
}

export function hsvToHex({ h, s, v }: Color): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

// Accepts "#rgb", "#rrggbb", with or without the leading hash. Returns null on
// anything unparseable so the input field can keep partial typing.
export function hexToHsv(hex: string): Color | null {
  let m = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(m)) {
    m = m
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-f]{6}$/i.test(m)) return null;
  const n = parseInt(m, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return rgbToHsv(r, g, b);
}

export function colorsEqual(a: Color, b: Color) {
  return (
    Math.abs(a.h - b.h) < 0.5 &&
    Math.abs(a.s - b.s) < 0.004 &&
    Math.abs(a.v - b.v) < 0.004
  );
}

// Tuned, white-background-friendly S/V for a generated hue. Mirrors the look the
// shaders used to bake in: vivid and confident, with the acidic yellow-green
// band (~45-180) gently tamed. Used for defaults / Add color / Shuffle so
// auto-generated palettes look intentional — user-picked colours bypass this
// and are honoured exactly.
export function vividColor(hueDeg: number): Color {
  const h = ((hueDeg % 360) + 360) % 360;
  const yg = smoothstep(45, 80, h) * (1 - smoothstep(150, 185, h));
  const s = 0.88 + (0.68 - 0.88) * yg;
  const v = 1.0 + (0.92 - 1.0) * yg;
  return { h, s, v };
}

// Deep electric blue-violet so the first render looks intentional (Siri-like).
export const DEFAULT_COLOR: Color = vividColor(252);

// Picker swatches: ten vivid hues spaced evenly around the wheel (36° steps) so
// every preset is clearly distinct, plus black + white as the only neutrals.
// (The old list had two purples and a navy that read like grey.)
const PRESET_HUES = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
export const PRESET_HEXES: string[] = [
  ...PRESET_HUES.map((h) => hsvToHex(vividColor(h))),
  "#111111", // near-black
  "#FFFFFF", // white
];

// Classic harmony schemes keyed by colour count, used by Shuffle so the result
// always reads as an intentional, harmonized palette rather than a clash.
const SCHEMES: Record<number, number[][]> = {
  2: [
    [0, 40], // analogous
    [0, 180], // complementary
    [0, 150], // split-complementary
    [0, 120], // partial triad
  ],
  3: [
    [0, 35, 70], // analogous
    [0, 120, 240], // triadic
    [0, 150, 210], // split-complementary
    [0, 30, 320], // analogous + accent
  ],
};

// Random base hue + a harmony scheme; S/V from vividColor so shuffles keep the
// same confident look they had before the full-colour change.
export function shuffleColors(n: number): Color[] {
  const base = Math.random() * 360;
  if (n <= 1) return [vividColor(base)];
  const variants = SCHEMES[n] ?? [Array.from({ length: n }, (_, i) => i * 40)];
  const offsets = variants[Math.floor(Math.random() * variants.length)];
  const jitter = () => Math.random() * 16 - 8; // ±8° keeps it organic
  return offsets.map((o, i) => vividColor((base + o + (i ? jitter() : 0)) % 360));
}

// Next colour when the user taps "Add color": shift hue, keep the vivid look.
export function nextColor(last: Color): Color {
  return vividColor(last.h + 80);
}
