"use client";

import { useEffect, useRef, useState } from "react";
import {
  SlidersHorizontal,
  Sun,
  Moon,
  Microphone,
  ArrowUp,
  Plus,
  X,
  NotePencil,
} from "@phosphor-icons/react";
import styles from "./Phone.module.css";
import type { Viz } from "../page";
import Orb from "./visualizations/Orb";
import Glow from "./visualizations/Glow";
import Sphere from "./visualizations/Sphere";
import Ring from "./visualizations/Ring";
import Aura from "./visualizations/Aura";
import Wave from "./visualizations/Wave";
import { AgentState } from "./visualizations/states";
import type { Color } from "./color";
import { STATE_LABEL } from "./stateLabels";

export default function Phone({
  viz,
  colors,
  state,
  dark,
  vizScale = 1,
  showMenu,
  onMenu,
  onToggleTheme,
  variant = "mobile",
}: {
  viz: Viz;
  colors: Color[];
  state: AgentState;
  dark: boolean;
  vizScale?: number; // size multiplier for the centred visual (all styles)
  showMenu: boolean; // mobile: header carries the hamburger + theme toggle
  onMenu: () => void;
  onToggleTheme: () => void;
  variant?: "mobile" | "desktop"; // desktop: landscape window framing
}) {
  const [message, setMessage] = useState("");
  const canSend = message.trim().length >= 1;

  // Conversation. Once the first message is sent we leave the hero view and enter
  // the chat/message view; the big visualization morphs into a small presence at
  // the top (best practice for an assistant chat). The pencil resets it.
  type Msg = { id: number; role: "user" | "agent"; text: string };
  const [messages, setMessages] = useState<Msg[]>([]);
  const chatMode = messages.length > 0;
  const msgSeq = useRef(0);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const replyTimers = useRef<number[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Canned agent replies (demo) — picked at random. No em dashes by request.
  const AGENT_REPLIES = [
    "Got it, let me look into that for you.",
    "Sure! Here's what I can help with.",
    "Happy to help. One moment while I pull that up.",
    "Great question! Here's a quick rundown.",
    "On it. Give me just a second.",
    "Absolutely, here's what I found.",
    "Good one. Let me think that through.",
    "Of course! Here's a quick take.",
  ];

  const send = () => {
    const text = message.trim();
    if (!text) return;
    setMessage("");
    setMessages((m) => [...m, { id: ++msgSeq.current, role: "user", text }]);
    // Agent: think briefly, reply, then settle back to idle.
    const reply = AGENT_REPLIES[Math.floor(Math.random() * AGENT_REPLIES.length)];
    setAgentState("thinking");
    const t1 = window.setTimeout(() => {
      setAgentState("speaking");
      setMessages((m) => [...m, { id: ++msgSeq.current, role: "agent", text: reply }]);
    }, 900);
    const t2 = window.setTimeout(() => setAgentState("idle"), 2800);
    replyTimers.current.push(t1, t2);
  };

  const newChat = () => {
    replyTimers.current.forEach((t) => clearTimeout(t));
    replyTimers.current = [];
    setMessages([]);
    setAgentState(null);
    setMessage("");
    if (voiceMode) stopVoice();
  };

  // Keep the list pinned to the latest message, and track whether it actually
  // overflows — the frosted scroll bands only show when there's something to
  // scroll, so a single message never sits under a blurred gradient.
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [messages]);
  useEffect(() => {
    const onResize = () => {
      const el = messagesRef.current;
      if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
  // delight, shared by every style (all live in the centred bouncer now). The
  // bounce is applied to the viz stack only (vizStackRef), NOT the bouncer, so
  // the greeting — a sibling inside the bouncer — stays put while the visual
  // springs. The bouncer is still the geometry reference for hit-testing.
  const bouncerRef = useRef<HTMLDivElement>(null);
  const vizStackRef = useRef<HTMLDivElement>(null);
  // A tap inside the visual is forwarded to the active shader so it ripples out
  // from the touch point. `id` increments each tap so repeat taps re-trigger.
  const tapSeq = useRef(0);
  const [tap, setTap] = useState<{ x: number; y: number; id: number } | null>(null);
  // Live cursor hover, kept in a ref so mousemove never re-renders — the active
  // shader reads it each frame and ripples around the cursor while hovering.
  const hoverRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });
  // Drag/swipe to spin the Sphere: `dx`/`dy` accumulate pointer movement (in the
  // shader's coords() space) between frames; the shader consumes them and spins
  // the globe that way, gliding on with momentum after release. Mouse and touch
  // both flow through pointer events. The other refs track the in-progress drag.
  const dragRef = useRef<{ dx: number; dy: number; active: boolean }>({
    dx: 0,
    dy: 0,
    active: false,
  });
  const dragLast = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Set true once a drag moves beyond a small threshold, so the click that fires
  // after a drag-release doesn't also trigger a tap ripple.
  const draggedRef = useRef(false);

  // --- Voice / microphone mode ---------------------------------------------
  // Tapping the mic puts the composer into a live recording mode: we capture the
  // microphone, measure its level each frame, and feed that into the active
  // shader (via micRef) so the visual reacts to real audio. micRef is a ref so
  // the per-frame level updates never re-render React.
  const [voiceMode, setVoiceMode] = useState(false);
  const micRef = useRef<{ level: number; active: boolean }>({ level: 0, active: false });
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef<number[]>([]); // rolling history of amplitude samples (voice-memo waveform)
  const wavePushRef = useRef(0); // last time (s) a new amplitude bar was pushed
  const audio = useRef<{
    stream?: MediaStream;
    ctx?: AudioContext;
    analyser?: AnalyserNode;
    mute?: GainNode; // pulls the graph to the destination (silently) so the analyser runs
    // Explicit <ArrayBuffer> (not the default <ArrayBufferLike>) so these satisfy
    // the analyser's getByte*Data signatures under TS 5.7+'s generic typed arrays.
    data?: Uint8Array<ArrayBuffer>;
    freq?: Uint8Array<ArrayBuffer>;
    simulated?: boolean; // fallback when no real mic (e.g. insecure origin)
    raf?: number;
  }>({});

  const stopVoice = () => {
    const a = audio.current;
    if (a.raf) cancelAnimationFrame(a.raf);
    a.stream?.getTracks().forEach((tr) => tr.stop());
    a.ctx?.close().catch(() => {});
    audio.current = {};
    micRef.current.level = 0;
    micRef.current.active = false;
    setVoiceMode(false);
  };

  // Draw a WhatsApp-style voice-memo waveform: a rolling history of amplitude
  // samples that scrolls left as you speak, newest bar on the right. Each bar is
  // one captured moment of loudness, so it reads as a real speaking trace (with
  // pauses dropping to a flat baseline) rather than a centred equaliser.
  const drawWaveform = (now: number) => {
    const cv = waveCanvasRef.current;
    if (!cv) return;
    const g2 = cv.getContext("2d");
    if (!g2) return;
    const cssW = cv.clientWidth || 1;
    const cssH = cv.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);
    if (cv.width !== pw || cv.height !== ph) {
      cv.width = pw;
      cv.height = ph;
    }
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, cssW, cssH);
    g2.fillStyle = getComputedStyle(cv).color || "#888";

    // Fixed bar pitch so the bars keep the SAME width at any composer width: a
    // wider composer (e.g. the desktop window) simply fits MORE bars rather than
    // stretching each one. (Previously a capped bar count was stretched to fill,
    // so toggling the device width changed the bar width.)
    const PITCH = 6; // px per bar slot (bar + gap)
    const bars = Math.max(12, Math.floor(cssW / PITCH));
    if (barsRef.current.length !== bars) {
      // Resize the rolling history in place, preserving the NEWEST samples (kept
      // on the right) so toggling the width doesn't blank the trace.
      const old = barsRef.current;
      barsRef.current =
        bars > old.length
          ? new Array(bars - old.length).fill(0.03).concat(old)
          : old.slice(old.length - bars);
    }

    // Capture a fresh amplitude sample at ~22 fps so the scroll reads at a
    // natural, voice-memo pace (newest pushed on the right, oldest dropped).
    if (now - wavePushRef.current > 0.045) {
      wavePushRef.current = now;
      const lvl = micRef.current.level;
      // A touch of per-sample variation, scaled by loudness, so adjacent bars
      // differ like a real voice trace while silence stays flat.
      const sample = Math.max(0.02, Math.min(1, lvl * (0.78 + 0.44 * Math.random())));
      barsRef.current.push(sample);
      barsRef.current.shift();
    }

    const pitch = PITCH;
    const bw = Math.max(1.5, pitch * 0.6);
    const r = Math.min(bw / 2, 2.5);
    const mid = cssH / 2;
    // Centre the fixed-pitch bar field; bars * pitch rarely equals the exact
    // width, so split the small remainder evenly on both sides.
    const inset = (cssW - bars * pitch) / 2;
    for (let i = 0; i < bars; i++) {
      const v = barsRef.current[i];
      const bh = Math.max(2, v * cssH * 0.9); // mirrored around the centre line
      const x0 = inset + i * pitch + (pitch - bw) / 2;
      const y0 = mid - bh / 2;
      if (g2.roundRect) {
        g2.beginPath();
        g2.roundRect(x0, y0, bw, bh, r);
        g2.fill();
      } else {
        g2.fillRect(x0, y0, bw, bh);
      }
    }
  };

  // Loop: measures the real mic level when available (so the agent reacts to your
  // voice), otherwise synthesizes a speaking envelope. Then draws the waveform.
  const runVoiceLoop = () => {
    const tick = () => {
      const a = audio.current;
      if (!a.simulated && !a.analyser) return; // stopped
      const now = performance.now() / 1000;
      if (a.analyser && a.data) {
        a.analyser.getByteTimeDomainData(a.data);
        let sum = 0;
        for (let i = 0; i < a.data.length; i++) {
          const v = (a.data[i] - 128) / 128;
          sum += v * v;
        }
        micRef.current.level = Math.min(1, Math.sqrt(sum / a.data.length) * 4.2);
      } else {
        // Talk bursts that dip to silence (pauses) modulated by an irregular
        // syllable rate — sampled into the scrolling bars it reads as speech.
        const phrase = Math.max(0, 0.55 * Math.sin(now * 0.85) + 0.5);
        const syl = 0.5 + 0.5 * Math.sin(now * 10.0 + Math.sin(now * 2.3) * 2.0);
        micRef.current.level = Math.max(0.02, Math.min(1, phrase * (0.3 + 0.7 * syl)));
      }
      drawWaveform(now);
      audio.current.raf = requestAnimationFrame(tick);
    };
    audio.current.raf = requestAnimationFrame(tick);
  };

  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      // Often created SUSPENDED; without resuming the analyser returns silence.
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser);
      // Pull the graph all the way to the destination through a MUTED gain.
      // Some browsers (notably Safari) won't actually run a
      // MediaStreamSource -> Analyser unless it reaches the output, so the
      // analyser would just return silence and nothing would "record". Gain 0
      // keeps it inaudible (no echo/feedback).
      const mute = ctx.createGain();
      mute.gain.value = 0;
      analyser.connect(mute);
      mute.connect(ctx.destination);
      const data = new Uint8Array(analyser.fftSize);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      audio.current = { stream, ctx, analyser, mute, data, freq };
      micRef.current.active = true;
      setVoiceMode(true);
      runVoiceLoop();
    } catch (err) {
      // No mic / permission denied / insecure origin: still enter voice mode
      // with a simulated voice so the experience works everywhere. Surface the
      // reason so a real failure on a secure origin is diagnosable.
      console.warn("[voice] live mic unavailable — using simulated waveform:", err);
      audio.current = { simulated: true };
      micRef.current.active = true;
      setVoiceMode(true);
      runVoiceLoop();
    }
  };

  const toggleVoice = () => (voiceMode ? stopVoice() : startVoice());

  // Stop the mic if the component unmounts mid-recording.
  useEffect(() => () => stopVoice(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // In a chat, the conversation drives the agent state (thinking → speaking →
  // idle). Otherwise the demo State control wins — including in voice/audio mode,
  // which now stays in whichever state you've selected (the mic still animates the
  // waveform either way).
  const effectiveState: AgentState = chatMode && agentState ? agentState : state;
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
  // Where the pointer sits relative to the active visual. Returns the position in
  // the shader's coords() space (centre 0,0; normalized to the shorter edge; y up)
  // and whether it's inside that style's hit region. Null if not mounted.
  const pointerInViz = (clientX: number, clientY: number) => {
    const b = bouncerRef.current;
    if (!b) return null;
    const rect = b.getBoundingClientRect();
    const m = Math.min(rect.width, rect.height);
    const dx = (clientX - (rect.left + rect.width / 2)) / m;
    const dy = (clientY - (rect.top + rect.height / 2)) / m;
    const dist = Math.hypot(dx, dy);
    let hit = false;
    if (viz === "orb" || viz === "glow" || viz === "sphere") hit = dist < 0.32;
    else if (viz === "aura") hit = dist < 0.42;
    else if (viz === "ring") hit = dist < 0.46;
    else hit = Math.abs(dy) < 0.14 && Math.abs(dx) < 0.5; // wave: the line band
    return { hit, x: dx, y: -dy }; // shader coords (flip y: DOM is y-down)
  };

  const onScreenTap = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't bounce when tapping a control (header buttons, composer + its buttons).
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // A drag that spun the sphere shouldn't also fire a tap ripple on release.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }

    // Only react when the tap lands on the active visual, not the empty
    // background around it.
    const p = pointerInViz(e.clientX, e.clientY);
    if (!p || !p.hit) return;
    bounce(vizStackRef.current);
    setTap({ x: p.x, y: p.y, id: ++tapSeq.current });
  };

  // Drag/swipe to spin the Sphere. Pointer events cover both mouse drag-and-drop
  // and touch swiping. We only engage over the sphere's hit region; movement is
  // accumulated (in coords space) into dragRef for the shader to consume.
  const onVizPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (viz !== "sphere") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const p = pointerInViz(e.clientX, e.clientY);
    if (!p || !p.hit) return;
    dragRef.current.active = true;
    dragRef.current.dx = 0;
    dragRef.current.dy = 0;
    dragLast.current = { x: p.x, y: p.y };
    draggedRef.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort; the drag still tracks via move events */
    }
  };
  const onVizPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const p = pointerInViz(e.clientX, e.clientY);
    if (!p) return;
    const dx = p.x - dragLast.current.x;
    const dy = p.y - dragLast.current.y;
    dragLast.current = { x: p.x, y: p.y };
    dragRef.current.dx += dx;
    dragRef.current.dy += dy;
    if (Math.hypot(dx, dy) > 0.004) draggedRef.current = true;
  };
  const endVizDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false; // keep last velocity → momentum glide
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  };

  // Hover: while the cursor is over the visual, feed its position to the active
  // shader (via a ref, so it doesn't re-render). Reactions fade out on leave.
  const onScreenMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const p = pointerInViz(e.clientX, e.clientY);
    if (!p || !p.hit) {
      hoverRef.current.active = false;
      return;
    }
    hoverRef.current = { x: p.x, y: p.y, active: true };
  };
  const onScreenLeave = () => {
    hoverRef.current.active = false;
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
        onMouseMove={onScreenMove}
        onMouseLeave={onScreenLeave}
        onPointerDown={onVizPointerDown}
        onPointerMove={onVizPointerMove}
        onPointerUp={endVizDrag}
        onPointerCancel={endVizDrag}
      >
        {/* App header */}
        <header className={styles.header}>
          {showMenu ? (
            <button className={styles.iconBtn} aria-label="Open settings" onClick={onMenu}>
              <SlidersHorizontal size={20} />
            </button>
          ) : (
            <span className={styles.iconSpacer} aria-hidden />
          )}
          <div className={styles.title}>
            <span className={styles.agentName}>Voice Agent</span>
            <span className={styles.status}>
              <span className={styles.statusDot} data-state={effectiveState} aria-hidden />
              {STATE_LABEL[effectiveState]}
            </span>
          </div>
          <div className={styles.headerRight}>
            {/* Theme toggle (mobile only — on desktop it lives outside the phone).
                Sits left of the new-chat pencil so the pencil is the rightmost. */}
            {showMenu ? (
              <button
                className={styles.iconBtn}
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
                onClick={onToggleTheme}
              >
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            ) : (
              !chatMode && <span className={styles.iconSpacer} aria-hidden />
            )}
            {/* New conversation — appears once a chat has started. */}
            {chatMode && (
              <button
                className={styles.iconBtn}
                aria-label="New conversation"
                onClick={newChat}
              >
                <NotePencil size={20} />
              </button>
            )}
          </div>
        </header>

        {/* Center visualization — morphs to a small top presence in chat mode. */}
        <div className={`${styles.viz} ${chatMode ? styles.vizDocked : ""}`}>
          <div
            ref={bouncerRef}
            className={`${styles.bouncer} ${chatMode ? styles.bouncerDocked : ""}`}
            style={{ ["--viz-scale" as string]: vizScale } as React.CSSProperties}
          >
            {/* Only the visual stack springs on tap — the greeting (a sibling
                below) stays still. */}
            <div
              ref={vizStackRef}
              className={styles.vizStack}
              // While the sphere is active, claim touch gestures over it so a
              // swipe spins the globe instead of scrolling the page.
              style={viz === "sphere" ? { touchAction: "none" } : undefined}
            >
              <div className={`${styles.vizLayer} ${viz === "orb" ? styles.vizOn : ""}`}>
                <Orb colors={colors} running={viz === "orb"} state={effectiveState} dark={dark} tap={tap} hover={hoverRef} mic={micRef} />
              </div>
              <div className={`${styles.vizLayer} ${viz === "glow" ? styles.vizOn : ""}`}>
                <Glow colors={colors} running={viz === "glow"} state={effectiveState} dark={dark} tap={tap} hover={hoverRef} mic={micRef} />
              </div>
              <div className={`${styles.vizLayer} ${viz === "sphere" ? styles.vizOn : ""}`}>
                <Sphere colors={colors} running={viz === "sphere"} state={effectiveState} dark={dark} tap={tap} hover={hoverRef} mic={micRef} drag={dragRef} />
              </div>
              <div className={`${styles.vizLayer} ${viz === "ring" ? styles.vizOn : ""}`}>
                <Ring colors={colors} running={viz === "ring"} state={effectiveState} dark={dark} tap={tap} hover={hoverRef} mic={micRef} />
              </div>
              <div className={`${styles.vizLayer} ${viz === "aura" ? styles.vizOn : ""}`}>
                <Aura colors={colors} running={viz === "aura"} state={effectiveState} dark={dark} tap={tap} hover={hoverRef} mic={micRef} />
              </div>
              <div className={`${styles.vizLayer} ${viz === "wave" ? styles.vizOn : ""}`}>
                <Wave colors={colors} running={viz === "wave"} state={effectiveState} dark={dark} tap={tap} hover={hoverRef} mic={micRef} />
              </div>
            </div>
            {/* Greeting — hero only; hidden once a conversation starts. */}
            {!chatMode && <p className={styles.greeting}>How can I help you?</p>}
          </div>
        </div>

        {/* Message thread (chat view) — appears once a conversation has started. */}
        {chatMode && (
          <div className={styles.messages} ref={messagesRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`${styles.msg} ${
                  m.role === "user" ? styles.msgUser : styles.msgAgent
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>
        )}

        {/* Frosted gradient bands — messages blur + fade into the background as
            they scroll up under the docked orb, or down behind the composer. */}
        {chatMode && overflowing && <div className={styles.chatFrost} aria-hidden />}
        {chatMode && overflowing && <div className={styles.chatFrostBottom} aria-hidden />}

        {/* Bottom input bar — the audio button lives inside the composer and
            swaps to a send button once there's text. */}
        <div className={styles.dock}>
          {/* Add button — collapses away while recording so the composer fills
              full width (animated, not unmounted). */}
          <button
            className={`${styles.composerPlus} ${voiceMode ? styles.composerPlusHidden : ""}`}
            aria-label="Add"
            type="button"
            tabIndex={voiceMode ? -1 : 0}
            aria-hidden={voiceMode}
          >
            <Plus size={20} weight="regular" />
          </button>
          {voiceMode ? (
            // Voice mode: the same composer becomes a full-width live recording bar
            // with a mic-driven audio waveform.
            <div className={`${styles.field} ${styles.fieldVoice}`}>
              <span className={styles.recDot} aria-hidden />
              <canvas ref={waveCanvasRef} className={styles.waveCanvas} aria-hidden />
              <button
                className={`${styles.micInline} ${styles.micActive}`}
                aria-label="Stop recording"
                onClick={toggleVoice}
              >
                <X size={18} weight="bold" />
              </button>
            </div>
          ) : (
            <div className={styles.field}>
              <input
                className={styles.input}
                type="text"
                placeholder="Send a message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSend) send();
                  else if (e.key === "Escape") {
                    setMessage("");
                    e.currentTarget.blur();
                  }
                }}
                aria-label="Message"
              />
              {canSend ? (
                <button className={styles.send} aria-label="Send message" onClick={send}>
                  <ArrowUp size={18} weight="bold" />
                </button>
              ) : (
                <button
                  className={styles.micInline}
                  aria-label="Start voice input"
                  onClick={toggleVoice}
                >
                  <Microphone size={20} weight="regular" />
                </button>
              )}
            </div>
          )}
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
