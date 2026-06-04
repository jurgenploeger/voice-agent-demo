"use client";

import { useState } from "react";
import { X, Plus, Shuffle } from "@phosphor-icons/react";
import styles from "../page.module.css";
import type { Viz } from "../page";
import { AgentState } from "./visualizations/states";
import { STATE_ORDER, STATE_TAB_LABEL } from "./stateLabels";
import { type Color, hsvToHex } from "./color";
import ColorPickerOverlay from "./ColorPicker";

const TABS: { id: Viz; label: string }[] = [
  { id: "orb", label: "Orb" },
  { id: "glow", label: "Glow" },
  { id: "ring", label: "Ring" },
  { id: "aura", label: "Aura" },
  { id: "wave", label: "Wave" },
];

type Props = {
  viz: Viz;
  setViz: (v: Viz) => void;
  state: AgentState;
  setState: (s: AgentState) => void;
  colors: Color[];
  colorIds: number[]; // stable per-colour ids (for enter/exit animation)
  setColorAt: (i: number, color: Color) => void;
  addColor: () => void;
  removeColor: (i: number) => void;
  shuffle: () => void;
  size: number; // visualization size multiplier
  setSize: (s: number) => void;
  isMobile: boolean; // picker shows as a stacked sheet on mobile, popover on desktop
  onPickerOpenChange?: (open: boolean) => void; // lets the page recede the sheet behind
};

// Bounds for the Size slider — symmetric around the default (1) so the handle
// starts dead-centre on load.
const SIZE_MIN = 0.7;
const SIZE_MAX = 1.3;

// Matches the swatch enter/exit animation duration in page.module.css.
const SWATCH_ANIM_MS = 300;

export default function Controls({
  viz,
  setViz,
  state,
  setState,
  colors,
  colorIds,
  setColorAt,
  addColor,
  removeColor,
  shuffle,
  size,
  setSize,
  isMobile,
  onPickerOpenChange,
}: Props) {
  // Which swatch's picker is open (and where its trigger sits, for the popover).
  const [editing, setEditing] = useState<number | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const openPicker = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorRect(e.currentTarget.getBoundingClientRect());
    setEditing(i);
    onPickerOpenChange?.(true);
  };
  const closePicker = () => {
    setEditing(null);
    onPickerOpenChange?.(false);
  };

  // Swatches mid-removal collapse (same easing as adding) and only drop from
  // state once the animation has played.
  const [exitingIds, setExitingIds] = useState<number[]>([]);
  const handleRemove = (i: number) => {
    const id = colorIds[i];
    if (id === undefined || exitingIds.includes(id)) return;
    if (editing === i) closePicker();
    setExitingIds((x) => [...x, id]);
    window.setTimeout(() => {
      removeColor(i);
      setExitingIds((x) => x.filter((e) => e !== id));
    }, SWATCH_ANIM_MS);
  };

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
              width: `calc((100% - 8px - ${TABS.length - 1} * 2px) / ${TABS.length})`,
              transform: `translateX(calc(${TABS.findIndex((t) => t.id === viz)} * (100% + 2px)))`,
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
              width: `calc((100% - 8px - ${STATE_ORDER.length - 1} * 2px) / ${STATE_ORDER.length})`,
              transform: `translateX(calc(${STATE_ORDER.indexOf(state)} * (100% + 2px)))`,
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

      {/* Size — scales the orb / glow / ring / wave (the aura fills the screen). */}
      <div className={styles.control}>
        <span className={styles.controlLabel}>Size</span>
        <input
          className={styles.slider}
          type="range"
          min={SIZE_MIN}
          max={SIZE_MAX}
          step={0.01}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          aria-label="Visualization size"
        />
      </div>

      {/* Colors: up to three side-by-side swatches. Each opens the full-colour
          picker (popover on desktop, stacked sheet on mobile). */}
      <div className={styles.control}>
        <span className={styles.controlLabel}>Color</span>
        <div className={styles.swatchRow}>
          {colors.map((c, i) => {
            const id = colorIds[i] ?? i;
            const exiting = exitingIds.includes(id);
            const hex = hsvToHex(c);
            return (
              <div
                key={id}
                className={`${styles.swatch} ${exiting ? styles.swatchExiting : ""}`}
              >
                <button
                  className={`${styles.swatchBtn} ${editing === i ? styles.swatchBtnActive : ""}`}
                  style={{ background: hex }}
                  aria-haspopup="dialog"
                  aria-label={`Color ${i + 1}, ${hex} — edit`}
                  onClick={(e) => openPicker(i, e)}
                />
                {colors.length > 1 && !exiting && (
                  <button
                    className={styles.swatchRemove}
                    aria-label={`Remove color ${i + 1}`}
                    onClick={() => handleRemove(i)}
                  >
                    <X size={12} weight="bold" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add-colour chip; collapses away at the 3-colour max. */}
          <button
            className={`${styles.addSwatch} ${colors.length < 3 ? "" : styles.addSwatchHidden}`}
            aria-label="Add color"
            aria-hidden={colors.length >= 3}
            tabIndex={colors.length < 3 ? 0 : -1}
            onClick={addColor}
          >
            <Plus size={16} weight="bold" />
          </button>

          {/* Shuffle sits inline after the swatches. */}
          <button className={styles.addColor} onClick={shuffle}>
            <Shuffle size={14} weight="bold" />
            Shuffle
          </button>
        </div>
      </div>

      {editing !== null && editing < colors.length && (
        <ColorPickerOverlay
          color={colors[editing]}
          onChange={(c) => setColorAt(editing, c)}
          onClose={closePicker}
          isMobile={isMobile}
          anchorRect={anchorRect}
          label={`Color ${editing + 1}`}
        />
      )}
    </>
  );
}
