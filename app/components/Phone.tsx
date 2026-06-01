"use client";

import { useRef, useState } from "react";
import { SlidersHorizontal, Sun, Moon, Microphone, ArrowUp } from "@phosphor-icons/react";
import styles from "./Phone.module.css";
import type { Viz } from "../page";
import Orb from "./visualizations/Orb";
import Aura from "./visualizations/Aura";
import Wave from "./visualizations/Wave";
import { AgentState, STATE_LABEL } from "./visualizations/states";

export default function Phone({
  viz,
  hues,
  state,
  dark,
  showMenu,
  onMenu,
  onToggleTheme,
}: {
  viz: Viz;
  hues: number[];
  state: AgentState;
  dark: boolean;
  showMenu: boolean; // mobile: header carries the hamburger + theme toggle
  onMenu: () => void;
  onToggleTheme: () => void;
}) {
  const [message, setMessage] = useState("");
  const canSend = message.trim().length >= 1;
  const send = () => setMessage("");

  // Tapping the orb gives it a gentle springy bounce — a small bit of delight.
  const bouncerRef = useRef<HTMLDivElement>(null);
  const onVizClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viz !== "orb") return; // only the orb reacts to touch
    const el = bouncerRef.current;
    if (!el) return;
    // Only react to taps on the orb's disc, not the empty screen around it.
    // Mirror the shader's coords(): centre, normalised by the min dimension;
    // the orb radius is ~0.24, so allow a small margin for its soft rim.
    const rect = el.getBoundingClientRect();
    const m = Math.min(rect.width, rect.height);
    const dx = (e.clientX - (rect.left + rect.width / 2)) / m;
    const dy = (e.clientY - (rect.top + rect.height / 2)) / m;
    if (Math.hypot(dx, dy) > 0.27) return; // outside the orb shape
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { transform: "scale(1)", offset: 0 },
        { transform: "scale(0.93)", offset: 0.3 },
        { transform: "scale(1.03)", offset: 0.62 },
        { transform: "scale(1)", offset: 1 },
      ],
      // ease-out -> reacts instantly on tap (no slow ramp-in), settles quickly.
      { duration: 340, easing: "ease-out" }
    );
  };

  return (
    <div className={styles.phone}>
      <div className={styles.screen}>
        {/* Aura: aurora glow that hangs from the top of the screen, behind the
            header (spans the top third). Hidden unless the Aura style is on. */}
        <div
          className={`${styles.auraLayer} ${viz === "aura" ? styles.vizOn : ""}`}
          aria-hidden
        >
          <Aura hues={hues} running={viz === "aura"} state={state} dark={dark} />
        </div>

        {/* App header */}
        <header className={styles.header}>
          {showMenu ? (
            <button className={styles.iconBtn} aria-label="Open settings" onClick={onMenu}>
              <SlidersHorizontal size={20} />
            </button>
          ) : (
            <span className={styles.iconBtn} aria-hidden />
          )}
          <div className={styles.title}>
            <span className={styles.agentName}>Voice Agents</span>
            <span className={styles.status}>
              <span className={styles.statusDot} data-state={state} aria-hidden />
              {STATE_LABEL[state]}
            </span>
          </div>
          {showMenu ? (
            <button
              className={styles.iconBtn}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={onToggleTheme}
            >
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          ) : (
            <span className={styles.iconBtn} aria-hidden />
          )}
        </header>

        {/* Center visualization (crossfading WebGL shaders) */}
        <div className={styles.viz} onClick={onVizClick}>
          <div ref={bouncerRef} className={styles.bouncer}>
            <div className={`${styles.vizLayer} ${viz === "orb" ? styles.vizOn : ""}`}>
              <Orb hues={hues} running={viz === "orb"} state={state} dark={dark} />
            </div>
            <div className={`${styles.vizLayer} ${viz === "wave" ? styles.vizOn : ""}`}>
              <Wave hues={hues} running={viz === "wave"} state={state} dark={dark} />
            </div>
          </div>
        </div>

        {/* Bottom input bar — the audio button lives inside the composer and
            swaps to a send button once there's text. */}
        <div className={styles.dock}>
          <div className={styles.field}>
            <input
              className={styles.input}
              type="text"
              placeholder="Send a message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSend) send();
              }}
              aria-label="Message"
            />
            {canSend ? (
              <button className={styles.send} aria-label="Send message" onClick={send}>
                <ArrowUp size={18} weight="bold" />
              </button>
            ) : (
              <button className={styles.micInline} aria-label="Microphone">
                <Microphone size={20} weight="regular" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
