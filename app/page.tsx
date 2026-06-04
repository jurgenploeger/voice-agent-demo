"use client";

import { useEffect, useRef, useState } from "react";
import { Sun, Moon, X, DeviceMobile, Monitor } from "@phosphor-icons/react";
import styles from "./page.module.css";
import Phone from "./components/Phone";
import Controls from "./components/Controls";
import { AgentState } from "./components/visualizations/states";
import {
  type Color,
  DEFAULT_COLOR,
  nextColor,
  shuffleColors,
} from "./components/color";

export type Viz = "orb" | "glow" | "ring" | "aura" | "wave";

type Theme = "light" | "dark";

export default function Page() {
  const [viz, setViz] = useState<Viz>("orb");
  const [state, setState] = useState<AgentState>("speaking");
  const [colors, setColors] = useState<Color[]>([DEFAULT_COLOR]); // 1-3 full colours
  // Stable per-colour ids so colour rows can animate in/out by identity.
  const [colorIds, setColorIds] = useState<number[]>([0]);
  const colorIdSeq = useRef(1);
  const [theme, setTheme] = useState<Theme>("light");
  const [sheetOpen, setSheetOpen] = useState(false);
  // Mobile: when the colour picker's stacked sheet is open, the settings sheet
  // behind it recedes (iOS stacked-sheet look).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Desktop only: preview the demo as a phone or a landscape desktop window.
  // Switching smoothly morphs the frame's size/radius (see the transitions on
  // .phone / .screen / .dock in Phone.module.css).
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  // Visualization size multiplier (orb / glow / ring / wave). Bounded so it
  // can't shrink to nothing or overflow the screen. See SIZE_MIN/MAX in Controls.
  const [vizSize, setVizSize] = useState(1);
  const hostRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  // Once the user flips the toggle, stop following the OS so their choice sticks.
  const userOverrodeTheme = useRef(false);

  // Track viewport so controls sit below the phone on desktop, in a bottom
  // sheet on mobile. (Starts false so server + first client render match.)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 600px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Follow the OS colour scheme on load AND keep in sync when it changes live
  // (e.g. iOS auto day/night), until the user manually overrides via the toggle.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setTheme(mq.matches ? "dark" : "light");
    const onChange = (e: MediaQueryListEvent) => {
      if (!userOverrodeTheme.current) setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Mobile: the settings sheet is driven by a real scroll gesture — touch-based
  // swipe detection is unreliable on mobile web. The page scrolls inside an
  // invisible host with two snap stops: closed (top) and open (bottom). Scroll
  // progress 0..1 lifts the sheet while the app behind it scales down and dims.
  const applyProgress = () => {
    const host = hostRef.current;
    if (!host) return;
    const range = host.scrollHeight - host.clientHeight;
    const p = range > 0 ? Math.min(1, Math.max(0, host.scrollTop / range)) : 0;
    host.style.setProperty("--p", p.toFixed(4));
    const open = p > 0.5;
    setSheetOpen((prev) => (prev === open ? prev : open));
  };
  const onHostScroll = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      applyProgress();
    });
  };
  // Custom tween for tap-to-open/close — snappier than the browser's built-in
  // smooth scroll (whose duration we can't control). Snap is disabled during
  // the tween so mandatory snapping doesn't fight it, then always restored.
  const tweenRef = useRef<number | null>(null);
  const tweenScroll = (to: number) => {
    const host = hostRef.current;
    if (!host) return;
    if (tweenRef.current != null) cancelAnimationFrame(tweenRef.current);
    const from = host.scrollTop;
    const dist = to - from;
    if (Math.abs(dist) < 1) return;
    const dur = 230; // ms
    const ease = (x: number) => 1 - Math.pow(1 - x, 3); // ease-out cubic
    host.style.scrollSnapType = "none";
    let start: number | null = null;
    const step = (ts: number) => {
      if (start == null) start = ts;
      const k = Math.min(1, (ts - start) / dur);
      host.scrollTop = from + dist * ease(k);
      if (k < 1) {
        tweenRef.current = requestAnimationFrame(step);
      } else {
        tweenRef.current = null;
        host.style.scrollSnapType = ""; // back to CSS (mandatory)
      }
    };
    tweenRef.current = requestAnimationFrame(step);
  };
  const openSheet = () => tweenScroll(hostRef.current?.clientHeight ?? 0);
  const closeSheet = () => tweenScroll(0);

  const toggleTheme = () => {
    userOverrodeTheme.current = true;
    setTheme((t) => (t === "light" ? "dark" : "light"));
  };
  const setColorAt = (i: number, color: Color) =>
    setColors((c) => c.map((col, idx) => (idx === i ? color : col)));
  const addColor = () => {
    setColors((c) => (c.length >= 3 ? c : [...c, nextColor(c[c.length - 1])]));
    setColorIds((ids) =>
      ids.length >= 3 ? ids : [...ids, colorIdSeq.current++]
    );
  };
  const removeColor = (i: number) => {
    setColors((c) => (c.length <= 1 ? c : c.filter((_, idx) => idx !== i)));
    setColorIds((ids) => (ids.length <= 1 ? ids : ids.filter((_, idx) => idx !== i)));
  };
  // Shuffle picks a random base hue + a classic harmony scheme (analogous,
  // complementary, triadic, split-complementary) so the result always reads as
  // an intentional, harmonized palette rather than a random clash. (Generates
  // tuned S/V so shuffles keep their confident look — see color.ts.)
  const shuffle = () => setColors((c) => shuffleColors(c.length));

  const controlsProps = {
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
    size: vizSize,
    setSize: setVizSize,
    isMobile,
    onPickerOpenChange: setPickerOpen,
  };

  return (
    <main className={styles.stage}>
      {/* Desktop: theme toggle top-right, phone centered, controls below. */}
      {!isMobile && (
        <>
          <button
            className={styles.themeToggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div
            className={styles.deviceToggle}
            role="radiogroup"
            aria-label="Demo device"
          >
            <button
              role="radio"
              aria-checked={device === "mobile"}
              aria-label="Mobile"
              className={`${styles.deviceToggleItem} ${device === "mobile" ? styles.deviceToggleItemActive : ""}`}
              onClick={() => setDevice("mobile")}
            >
              <DeviceMobile size={18} />
            </button>
            <button
              role="radio"
              aria-checked={device === "desktop"}
              aria-label="Desktop"
              className={`${styles.deviceToggleItem} ${device === "desktop" ? styles.deviceToggleItemActive : ""}`}
              onClick={() => setDevice("desktop")}
            >
              <Monitor size={18} />
            </button>
          </div>

          <Phone
            viz={viz}
            colors={colors}
            state={state}
            dark={theme === "dark"}
            vizScale={vizSize}
            showMenu={false}
            onMenu={() => {}}
            onToggleTheme={toggleTheme}
            variant={device}
          />

          <div className={styles.controls}>
            <Controls {...controlsProps} />
          </div>
        </>
      )}

      {/* Mobile: scroll down to reveal the settings sheet (app scales + dims
          behind it); scroll up to dismiss. Snap stops settle open/closed. */}
      {isMobile && (
        <div className={styles.scrollHost} ref={hostRef} onScroll={onHostScroll}>
          <div className={styles.phoneLayer}>
            <Phone
              viz={viz}
              colors={colors}
              state={state}
              dark={theme === "dark"}
              vizScale={vizSize}
              showMenu
              onMenu={openSheet}
              onToggleTheme={toggleTheme}
            />
          </div>

          <button
            className={`${styles.phoneDim} ${sheetOpen ? styles.phoneDimActive : ""}`}
            aria-label="Close settings"
            tabIndex={sheetOpen ? 0 : -1}
            onClick={closeSheet}
          />

          <div
            className={`${styles.sheet2} ${sheetOpen ? styles.sheet2Open : ""}`}
            role="dialog"
            aria-label="Settings"
            aria-hidden={!sheetOpen}
          >
            <div
              className={`${styles.sheet2Surface} ${pickerOpen ? styles.sheet2Receded : ""}`}
            >
              <div className={styles.sheetHead}>
                <span className={styles.sheetTitle}>Settings</span>
                <button
                  className={styles.sheetClose}
                  aria-label="Close"
                  tabIndex={sheetOpen ? 0 : -1}
                  onClick={closeSheet}
                >
                  <X size={18} weight="bold" />
                </button>
              </div>
              <div className={styles.sheetBody}>
                <Controls {...controlsProps} />
              </div>
            </div>
          </div>

          {/* Invisible scroll length: two snap stops (closed / open). */}
          <div className={styles.snap} />
          <div className={styles.snap} />
        </div>
      )}
    </main>
  );
}
