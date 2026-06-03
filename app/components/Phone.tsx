"use client";

import { useRef, useState } from "react";
import { SlidersHorizontal, Sun, Moon, Microphone, ArrowUp } from "@phosphor-icons/react";
import styles from "./Phone.module.css";
import type { Viz } from "../page";
import Orb from "./visualizations/Orb";
import Sphere from "./visualizations/Sphere";
import Ring from "./visualizations/Ring";
import Aura from "./visualizations/Aura";
import Wave from "./visualizations/Wave";
import { AgentState } from "./visualizations/states";
import { STATE_LABEL } from "./stateLabels";

export default function Phone({
  viz,
  hues,
  state,
  dark,
  showMenu,
  onMenu,
  onToggleTheme,
  variant = "mobile",
}: {
  viz: Viz;
  hues: number[];
  state: AgentState;
  dark: boolean;
  showMenu: boolean; // mobile: header carries the hamburger + theme toggle
  onMenu: () => void;
  onToggleTheme: () => void;
  variant?: "mobile" | "desktop"; // desktop: landscape window framing
}) {
  const [message, setMessage] = useState("");
  const canSend = message.trim().length >= 1;
  const send = () => setMessage("");

  // Desktop variant: user-resizable window. `size` is null until the first
  // drag, so the CSS default (min(1040px, 92vw)) applies until then; once set,
  // an explicit px size takes over and persists across mobile<->desktop toggles.
  const isDesktop = variant === "desktop";
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  // dirX/dirY: which edges this handle drives (1 = active, 0 = unchanged).
  const drag = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
    dirX: number;
    dirY: number;
  } | null>(null);

  const startResize =
    (dirX: number, dirY: number) => (e: React.PointerEvent<HTMLElement>) => {
      const el = frameRef.current;
      if (!el) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      drag.current = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, dirX, dirY };
      setResizing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    };
  const onResizeMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const maxW = window.innerWidth * 0.96;
    const maxH = window.innerHeight * 0.94;
    // The window is centered, so an edge moves at half the rate the box grows;
    // apply 2x the pointer delta so the handle tracks the cursor.
    const w = Math.max(480, Math.min(maxW, d.w + d.dirX * (e.clientX - d.x) * 2));
    const h = Math.max(360, Math.min(maxH, d.h + d.dirY * (e.clientY - d.y) * 2));
    setSize((prev) => ({
      w: d.dirX ? w : prev?.w ?? d.w,
      h: d.dirY ? h : prev?.h ?? d.h,
    }));
  };
  const endResize = (e: React.PointerEvent<HTMLElement>) => {
    drag.current = null;
    setResizing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Tapping the visualization gives it a gentle springy bounce — a small bit of
  // delight, shared by every style (orb/sphere/ring/wave live in the bouncer;
  // the aura fills its own full-screen layer). Only the active one is visible,
  // so bouncing both is harmless.
  const bouncerRef = useRef<HTMLDivElement>(null);
  const auraRef = useRef<HTMLDivElement>(null);
  const bounce = (el: HTMLElement | null) => {
    if (!el) return;
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
  const onScreenTap = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't bounce when tapping a control (header buttons, composer + its buttons).
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Only bounce when the tap actually lands on the active visual, not the
    // empty background around it. Each style has its own hit region.
    let hit = false;
    if (viz === "aura") {
      // The aura glow pools toward the bottom of the screen.
      const a = auraRef.current;
      if (a) {
        const rect = a.getBoundingClientRect();
        hit = (e.clientY - rect.top) / rect.height > 0.6;
      }
    } else {
      const b = bouncerRef.current;
      if (b) {
        const rect = b.getBoundingClientRect();
        const m = Math.min(rect.width, rect.height);
        const dx = (e.clientX - (rect.left + rect.width / 2)) / m;
        const dy = (e.clientY - (rect.top + rect.height / 2)) / m;
        const dist = Math.hypot(dx, dy);
        if (viz === "orb" || viz === "sphere") hit = dist < 0.32;
        else if (viz === "ring") hit = dist < 0.46;
        else hit = Math.abs(dy) < 0.14 && Math.abs(dx) < 0.5; // wave: the line band
      }
    }
    if (!hit) return;
    bounce(bouncerRef.current);
    bounce(auraRef.current);
  };

  return (
    <div
      ref={frameRef}
      className={`${styles.phone} ${isDesktop ? styles.desktop : ""} ${resizing ? styles.resizing : ""}`}
      style={isDesktop && size ? { width: size.w, height: size.h } : undefined}
    >
      <div
        className={`${styles.screen} ${isDesktop ? styles.screenDesktop : ""}`}
        onClick={onScreenTap}
      >
        {/* Aura: aurora glow that hangs from the top of the screen, behind the
            header (spans the top third). Hidden unless the Aura style is on. */}
        <div
          ref={auraRef}
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
        <div className={styles.viz}>
          <div ref={bouncerRef} className={styles.bouncer}>
            <div className={`${styles.vizLayer} ${viz === "orb" ? styles.vizOn : ""}`}>
              <Orb hues={hues} running={viz === "orb"} state={state} dark={dark} />
            </div>
            <div className={`${styles.vizLayer} ${viz === "sphere" ? styles.vizOn : ""}`}>
              <Sphere hues={hues} running={viz === "sphere"} state={state} dark={dark} />
            </div>
            <div className={`${styles.vizLayer} ${viz === "ring" ? styles.vizOn : ""}`}>
              <Ring hues={hues} running={viz === "ring"} state={state} dark={dark} />
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

      {/* Resize handles — desktop variant only (right edge, bottom edge, corner). */}
      {isDesktop && (
        <>
          <span
            className={`${styles.resizeHandle} ${styles.resizeE}`}
            onPointerDown={startResize(1, 0)}
            onPointerMove={onResizeMove}
            onPointerUp={endResize}
            aria-hidden
          />
          <span
            className={`${styles.resizeHandle} ${styles.resizeS}`}
            onPointerDown={startResize(0, 1)}
            onPointerMove={onResizeMove}
            onPointerUp={endResize}
            aria-hidden
          />
          <span
            className={`${styles.resizeHandle} ${styles.resizeSE}`}
            onPointerDown={startResize(1, 1)}
            onPointerMove={onResizeMove}
            onPointerUp={endResize}
            aria-hidden
          />
        </>
      )}
    </div>
  );
}
