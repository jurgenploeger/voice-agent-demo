"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import styles from "./ColorPicker.module.css";
import {
  type Color,
  PRESET_HEXES,
  colorsEqual,
  hexToHsv,
  hsvToHex,
} from "./color";

/* ---- Wheel geometry (px) ---- */
const SIZE = 200;
const C = SIZE / 2; // centre
const OUTER = SIZE / 2; // outer radius
const INNER = 73; // ring inner radius (matches the CSS mask)
const MID = (OUTER + INNER) / 2; // hue-thumb track radius
const SQ = Math.round(INNER * 1.38); // inscribed SV square side
const SQ_OFF = C - SQ / 2; // square top-left offset

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/* A hue ring with an inner saturation/value square, driven by pointer events. */
function ColorWheel({
  color,
  onChange,
}: {
  color: Color;
  onChange: (c: Color) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mode = useRef<"hue" | "sv" | null>(null);

  const apply = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el || !mode.current) return;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    if (mode.current === "hue") {
      const ang = (Math.atan2(y - C, x - C) * 180) / Math.PI;
      onChange({ ...color, h: (ang + 360) % 360 });
    } else {
      const s = clamp01((x - SQ_OFF) / SQ);
      const v = 1 - clamp01((y - SQ_OFF) / SQ);
      onChange({ h: color.h, s, v });
    }
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const dist = Math.hypot(x - C, y - C);
    if (dist >= INNER - 3 && dist <= OUTER + 3) mode.current = "hue";
    else if (
      x >= SQ_OFF &&
      x <= SQ_OFF + SQ &&
      y >= SQ_OFF &&
      y <= SQ_OFF + SQ
    )
      mode.current = "sv";
    else return;
    el.setPointerCapture(e.pointerId);
    apply(e.clientX, e.clientY);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (mode.current) apply(e.clientX, e.clientY);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    mode.current = null;
    try {
      ref.current?.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const hueRad = (color.h * Math.PI) / 180;
  const hueThumb = {
    left: C + MID * Math.cos(hueRad),
    top: C + MID * Math.sin(hueRad),
    background: `hsl(${color.h}, 100%, 50%)`,
  };
  const svThumb = {
    left: SQ_OFF + color.s * SQ,
    top: SQ_OFF + (1 - color.v) * SQ,
    background: hsvToHex(color),
  };

  return (
    <div
      ref={ref}
      className={styles.wheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="group"
      aria-label="Colour wheel"
    >
      <div className={styles.ring} />
      <div
        className={styles.square}
        style={{
          left: SQ_OFF,
          top: SQ_OFF,
          width: SQ,
          height: SQ,
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${color.h}, 100%, 50%)`,
        }}
      />
      <span className={styles.thumb} style={hueThumb} />
      <span className={styles.thumb} style={svThumb} />
    </div>
  );
}

/* The picker body: wheel + hex field + preset swatches. */
function PickerPanel({
  color,
  onChange,
}: {
  color: Color;
  onChange: (c: Color) => void;
}) {
  const [text, setText] = useState(() => hsvToHex(color).slice(1));
  const focused = useRef(false);

  // Reflect external changes (wheel/presets) into the field, unless the user is
  // mid-edit in the field itself.
  useEffect(() => {
    if (!focused.current) setText(hsvToHex(color).slice(1));
  }, [color]);

  return (
    <>
      <ColorWheel color={color} onChange={onChange} />

      <div className={styles.hexRow}>
        <span className={styles.hexPreview} style={{ background: hsvToHex(color) }} />
        <label className={styles.hexField}>
          <span className={styles.hexHash}>#</span>
          <input
            className={styles.hexInput}
            type="text"
            inputMode="text"
            spellCheck={false}
            maxLength={6}
            value={text}
            aria-label="Hex colour"
            onFocus={() => (focused.current = true)}
            onBlur={() => {
              focused.current = false;
              setText(hsvToHex(color).slice(1));
            }}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9a-fA-F]/g, "");
              setText(v);
              const parsed = hexToHsv(v);
              if (parsed) onChange(parsed);
            }}
          />
        </label>
      </div>

      <p className={styles.presetsLabel}>Presets</p>
      <div className={styles.presets}>
        {PRESET_HEXES.map((hex) => {
          const c = hexToHsv(hex)!;
          const active = colorsEqual(c, color);
          return (
            <button
              key={hex}
              type="button"
              className={`${styles.preset} ${active ? styles.presetActive : ""}`}
              style={{ background: hex }}
              aria-label={hex}
              aria-pressed={active}
              onClick={() => onChange(c)}
            />
          );
        })}
      </div>
    </>
  );
}

/* Overlay shell: a popover anchored to the swatch on desktop, an iOS-style
   stacked bottom sheet on mobile. Portaled to <body> so it escapes the
   transformed / clipped sheet + controls containers. */
export default function ColorPickerOverlay({
  color,
  onChange,
  onClose,
  isMobile,
  anchorRect,
  label,
}: {
  color: Color;
  onChange: (c: Color) => void;
  onClose: () => void;
  isMobile: boolean;
  anchorRect: DOMRect | null;
  label: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Desktop popover position, clamped to the viewport (placed above the swatch
  // if there isn't room below).
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (isMobile || !anchorRect) return;
    const el = popRef.current;
    const w = el?.offsetWidth ?? 248;
    const h = el?.offsetHeight ?? 360;
    const pad = 8;
    const left = Math.max(
      pad,
      Math.min(anchorRect.left, window.innerWidth - w - pad)
    );
    let top = anchorRect.bottom + pad;
    if (top + h > window.innerHeight - pad)
      top = Math.max(pad, anchorRect.top - h - pad);
    setPos({ left, top });
  }, [isMobile, anchorRect]);

  // Mobile: scroll-to-dismiss, mirroring the Settings sheet. The sheet sits at
  // the bottom of a scroll host with two snap stops (dismissed / open); the
  // entrance and tap/close are tweened so they glide instead of snapping.
  const scrollRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const tweenRef = useRef<number | null>(null);
  const tweenTo = (to: number, done?: () => void) => {
    const el = scrollRef.current;
    if (!el) return;
    if (tweenRef.current != null) cancelAnimationFrame(tweenRef.current);
    const from = el.scrollTop;
    const dist = to - from;
    const dur = 300;
    const ease = (x: number) => 1 - Math.pow(1 - x, 3); // ease-out cubic
    el.style.scrollSnapType = "none"; // don't let mandatory snap fight the tween
    let start: number | null = null;
    const step = (ts: number) => {
      if (start == null) start = ts;
      const k = Math.min(1, (ts - start) / dur);
      el.scrollTop = from + dist * ease(k);
      if (k < 1) {
        tweenRef.current = requestAnimationFrame(step);
      } else {
        tweenRef.current = null;
        el.style.scrollSnapType = "";
        done?.();
      }
    };
    tweenRef.current = requestAnimationFrame(step);
  };
  // Entrance: start dismissed (sheet below the fold) then glide it up.
  useEffect(() => {
    if (!isMobile || !mounted) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    const id = requestAnimationFrame(() =>
      tweenTo(el.scrollHeight - el.clientHeight)
    );
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, mounted]);
  const onSheetScroll = () => {
    const el = scrollRef.current;
    if (!el || closingRef.current || tweenRef.current != null) return;
    const range = el.scrollHeight - el.clientHeight;
    const p = range > 0 ? el.scrollTop / range : 1; // 1 = open, 0 = dismissed
    if (p < 0.15) {
      closingRef.current = true;
      onClose();
    }
  };
  const closeWithScroll = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    tweenTo(0, onClose); // glide the sheet down, then unmount
  };

  if (!mounted) return null;

  if (isMobile) {
    return createPortal(
      <>
        <div className={styles.sheetScrim} aria-hidden />
        <div
          className={styles.sheetScroll}
          ref={scrollRef}
          onScroll={onSheetScroll}
        >
          {/* Transparent area above the sheet: tap or scroll to it to dismiss. */}
          <button
            className={styles.sheetDismissArea}
            aria-label="Close"
            onClick={closeWithScroll}
          />
          <div className={styles.sheet} role="dialog" aria-label={label}>
            <div className={styles.sheetHead}>
              <span className={styles.sheetTitle}>{label}</span>
              <button
                className={styles.sheetClose}
                aria-label="Done"
                onClick={closeWithScroll}
              >
                <X size={18} weight="bold" />
              </button>
            </div>
            <div className={styles.sheetBody}>
              <PickerPanel color={color} onChange={onChange} />
            </div>
          </div>
        </div>
      </>,
      document.body
    );
  }

  return createPortal(
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div
        ref={popRef}
        className={styles.popover}
        role="dialog"
        aria-label={label}
        style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
      >
        <PickerPanel color={color} onChange={onChange} />
      </div>
    </>,
    document.body
  );
}
