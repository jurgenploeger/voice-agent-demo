"use client";

import { useEffect, useState } from "react";
import { X, Plus, Shuffle } from "@phosphor-icons/react";
import styles from "../page.module.css";
import type { Viz } from "../page";
import {
  AgentState,
  STATE_ORDER,
  STATE_TAB_LABEL,
} from "./visualizations/states";

const TABS: { id: Viz; label: string }[] = [
  { id: "orb", label: "Orb" },
  { id: "wave", label: "Wave" },
  { id: "pulse", label: "Pulse" },
];

/* --- hue <-> hex (mirrors the shader's vivid(): tuned S/V, yellow-green tamed) --- */
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
function smoothstep(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i % 6];
  return [r, g, b];
}
function hex2(n: number) {
  return Math.round(n * 255)
    .toString(16)
    .padStart(2, "0");
}
export function vividHex(hueDeg: number): string {
  const h = ((hueDeg % 360) + 360) % 360;
  const yg = smoothstep(45, 80, h) * (1 - smoothstep(150, 185, h));
  const s = 0.88 + (0.68 - 0.88) * yg;
  const v = 1.0 + (0.92 - 1.0) * yg;
  const [r, g, b] = hsvToRgb(h / 360, s, v);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}
function hexToHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null; // greyscale has no hue
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

type Props = {
  viz: Viz;
  setViz: (v: Viz) => void;
  state: AgentState;
  setState: (s: AgentState) => void;
  colors: number[]; // hues
  setColorAt: (i: number, hue: number) => void;
  addColor: () => void;
  removeColor: (i: number) => void;
  shuffle: () => void;
};

export default function Controls({
  viz,
  setViz,
  state,
  setState,
  colors,
  setColorAt,
  addColor,
  removeColor,
  shuffle,
}: Props) {
  // Local hex text so the field can be typed freely without snapping back.
  const [hexText, setHexText] = useState<string[]>(colors.map(vividHex));
  useEffect(() => {
    setHexText(colors.map(vividHex));
  }, [colors]);

  return (
    <>
      {/* Style */}
      <div className={styles.control}>
        <span className={styles.controlLabel}>Style</span>
        <div className={styles.segFull} role="tablist" aria-label="Visualization style">
          <span
            className={styles.segThumb}
            aria-hidden
            style={{
              width: `calc((100% - 8px - ${TABS.length - 1} * 4px) / ${TABS.length})`,
              transform: `translateX(calc(${TABS.findIndex((t) => t.id === viz)} * (100% + 4px)))`,
            }}
          />
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={viz === tab.id}
              className={`${styles.segFullItem} ${viz === tab.id ? styles.segFullItemActive : ""}`}
              onClick={() => setViz(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* State (demo control; the real agent would set this programmatically) */}
      <div className={styles.control}>
        <span className={styles.controlLabel}>State</span>
        <div className={styles.segFull} role="radiogroup" aria-label="Agent state">
          <span
            className={styles.segThumb}
            aria-hidden
            style={{
              width: `calc((100% - 8px - ${STATE_ORDER.length - 1} * 4px) / ${STATE_ORDER.length})`,
              transform: `translateX(calc(${STATE_ORDER.indexOf(state)} * (100% + 4px)))`,
            }}
          />
          {STATE_ORDER.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={state === s}
              className={`${styles.segFullItem} ${state === s ? styles.segFullItemActive : ""}`}
              onClick={() => setState(s)}
            >
              {STATE_TAB_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Colors: up to three, each a hue slider + hex field. */}
      <div className={styles.control}>
        <span className={styles.controlLabel}>Color</span>
        {colors.map((h, i) => (
          <div key={i} className={styles.colorRow}>
            <input
              className={`${styles.slider} ${styles.hueTrack}`}
              type="range"
              min={0}
              max={360}
              value={h}
              onChange={(e) => setColorAt(i, Number(e.target.value))}
              aria-label={`Color ${i + 1} hue`}
            />
            <input
              className={styles.hexInput}
              type="text"
              spellCheck={false}
              value={hexText[i] ?? ""}
              aria-label={`Color ${i + 1} hex`}
              onChange={(e) => {
                const v = e.target.value;
                setHexText((t) => t.map((x, idx) => (idx === i ? v : x)));
                const hue = hexToHue(v);
                if (hue !== null) setColorAt(i, Math.round(hue));
              }}
            />
            {colors.length > 1 && (
              <button
                className={styles.colorRemove}
                aria-label={`Remove color ${i + 1}`}
                onClick={() => removeColor(i)}
              >
                <X size={14} weight="bold" />
              </button>
            )}
          </div>
        ))}

        <div className={styles.colorActions}>
          {colors.length < 3 && (
            <button className={styles.addColor} onClick={addColor}>
              <Plus size={14} weight="bold" />
              Add color
            </button>
          )}
          {colors.length >= 2 && (
            <button className={styles.addColor} onClick={shuffle}>
              <Shuffle size={14} weight="bold" />
              Shuffle
            </button>
          )}
        </div>
      </div>
    </>
  );
}
