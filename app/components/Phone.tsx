"use client";

import { List, Sun, Moon, Microphone } from "@phosphor-icons/react";
import styles from "./Phone.module.css";
import type { Viz } from "../page";
import Orb from "./visualizations/Orb";
import Wave from "./visualizations/Wave";
import Pulse from "./visualizations/Pulse";
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
  return (
    <div className={styles.phone}>
      <div className={styles.screen}>
        {/* App header */}
        <header className={styles.header}>
          {showMenu ? (
            <button className={styles.iconBtn} aria-label="Open settings" onClick={onMenu}>
              <List size={20} />
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
        <div className={styles.hairline} />

        {/* Center visualization (crossfading WebGL shaders) */}
        <div className={styles.viz}>
          <div className={`${styles.vizLayer} ${viz === "orb" ? styles.vizOn : ""}`}>
            <Orb hues={hues} running={viz === "orb"} state={state} dark={dark} />
          </div>
          <div className={`${styles.vizLayer} ${viz === "wave" ? styles.vizOn : ""}`}>
            <Wave hues={hues} running={viz === "wave"} state={state} dark={dark} />
          </div>
          <div className={`${styles.vizLayer} ${viz === "pulse" ? styles.vizOn : ""}`}>
            <Pulse hues={hues} running={viz === "pulse"} state={state} dark={dark} />
          </div>
        </div>

        {/* Bottom input bar */}
        <div className={styles.dock}>
          <div className={styles.field}>
            <span className={styles.fieldHint}>Tap to speak</span>
          </div>
          <button className={styles.mic} aria-label="Microphone">
            <Microphone size={22} weight="fill" />
          </button>
        </div>

        <div className={styles.homeBar} aria-hidden />
      </div>
    </div>
  );
}
