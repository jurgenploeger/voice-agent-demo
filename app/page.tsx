"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, X } from "@phosphor-icons/react";
import styles from "./page.module.css";
import Phone from "./components/Phone";
import Controls from "./components/Controls";
import { AgentState } from "./components/visualizations/states";

export type Viz = "orb" | "wave" | "pulse";

// Deep electric blue-violet so the first render looks intentional (Siri-like).
const DEFAULT_HUE = 252;

type Theme = "light" | "dark";

export default function Page() {
  const [viz, setViz] = useState<Viz>("orb");
  const [state, setState] = useState<AgentState>("listening");
  const [colors, setColors] = useState<number[]>([DEFAULT_HUE]); // 1-3 hues
  const [theme, setTheme] = useState<Theme>("light");
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Track viewport so controls sit below the phone on desktop, in a bottom
  // sheet on mobile. (Starts false so server + first client render match.)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 600px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((t) => (t === "light" ? "dark" : "light"));
  const setColorAt = (i: number, hue: number) =>
    setColors((c) => c.map((h, idx) => (idx === i ? hue : h)));
  const addColor = () =>
    setColors((c) => (c.length >= 3 ? c : [...c, (c[c.length - 1] + 80) % 360]));
  const removeColor = (i: number) =>
    setColors((c) => (c.length <= 1 ? c : c.filter((_, idx) => idx !== i)));
  // Shuffle picks a random base hue + a classic harmony scheme (analogous,
  // complementary, triadic, split-complementary) so the result always reads as
  // an intentional, harmonized palette rather than a random clash.
  const shuffle = () =>
    setColors((c) => {
      const n = c.length;
      const base = Math.random() * 360;
      if (n === 1) return [Math.round(base) % 360];
      const schemes: Record<number, number[][]> = {
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
      const set = schemes[n] ?? c.map((_, i) => i * 40);
      const offsets = set[Math.floor(Math.random() * set.length)];
      const jitter = () => Math.random() * 16 - 8; // ±8° keeps it organic
      return offsets.map(
        (o, i) => Math.round(((base + o + (i ? jitter() : 0)) % 360 + 360) % 360),
      );
    });

  const controlsProps = {
    viz,
    setViz,
    state,
    setState,
    colors,
    setColorAt,
    addColor,
    removeColor,
    shuffle,
  };

  return (
    <main className={styles.stage}>
      {/* Desktop: theme toggle lives at the top-right of the page. */}
      {!isMobile && (
        <button
          className={styles.themeToggle}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      )}

      <Phone
        viz={viz}
        hues={colors}
        state={state}
        dark={theme === "dark"}
        showMenu={isMobile}
        onMenu={() => setMenuOpen(true)}
        onToggleTheme={toggleTheme}
      />

      {/* Desktop: controls sit below the phone. */}
      {!isMobile && (
        <div className={styles.controls}>
          <Controls {...controlsProps} />
        </div>
      )}

      {/* Mobile: controls live in an iOS-style bottom sheet. */}
      {isMobile && (
        <div
          className={`${styles.sheet} ${menuOpen ? styles.sheetOpen : ""}`}
          role="dialog"
          aria-label="Settings"
          aria-hidden={!menuOpen}
        >
          <button
            className={styles.sheetScrim}
            aria-label="Close settings"
            tabIndex={menuOpen ? 0 : -1}
            onClick={() => setMenuOpen(false)}
          />
          <div className={styles.sheetPanel}>
            <span className={styles.sheetGrabber} aria-hidden />
            <div className={styles.sheetHead}>
              <span className={styles.sheetTitle}>Settings</span>
              <button
                className={styles.sheetClose}
                aria-label="Close"
                tabIndex={menuOpen ? 0 : -1}
                onClick={() => setMenuOpen(false)}
              >
                <X size={18} weight="bold" />
              </button>
            </div>
            <div className={styles.sheetBody}>
              <Controls {...controlsProps} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
