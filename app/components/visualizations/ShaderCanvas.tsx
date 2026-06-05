"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Renderer, Triangle, Program, Mesh, Vec2, Vec3 } from "ogl";
import { VERTEX } from "./shaders";
import { AgentState, STATE_PARAMS, StateParams } from "./states";
import type { Color } from "../color";

// Public props shared by every visualization (Orb/Wave/Aura). The component is
// fully driven from the outside — host an agent's lifecycle by setting `state`,
// and its palette by setting `colors`. No global CSS, fonts, or framework APIs
// are required.
export type VisualizationProps = {
  colors: Color[]; // 1-3 full HSV colours; lerped internally for smoothness
  running: boolean; // only the active visualization animates
  state: AgentState; // conversational state; drives motion/appearance
  dark: boolean; // theme — tunes the halo (clean on white vs glow on dark)
  // A tap/click inside the visual; `id` increments per tap so a repeat tap on the
  // same spot still re-triggers the ripple. Position is in the shader's coords()
  // space (centre = 0,0; normalized to the shorter edge; y up).
  tap?: { x: number; y: number; id: number } | null;
  // Live cursor hover, as a ref (updated on mousemove without re-rendering). The
  // shader smooths `active` into uHoverAmt and follows the position with uHover.
  hover?: { current: { x: number; y: number; active: boolean } } | null;
  // Live microphone level, as a ref (updated each frame while recording). Drives
  // uMic/uVoice so the visual reacts to real audio input in voice mode.
  mic?: { current: { level: number; active: boolean } } | null;
  // Drag/swipe over the visual, as a ref. `dx`/`dy` accumulate pointer movement
  // (in coords() space) between frames; the loop consumes them, spins the visual
  // by that delta while `active`, and lets it glide on with momentum after release.
  // Currently only the Sphere reads the resulting uDrag uniform.
  drag?: { current: { dx: number; dy: number; active: boolean } } | null;
  className?: string; // forwarded to the wrapper, for sizing/positioning
  style?: CSSProperties; // forwarded to the wrapper (overrides the fill default)
  fallback?: ReactNode; // shown if WebGL is unavailable (defaults to a message)
};

// HSV in the shader's expected form: hue as a 0-1 fraction, sat/val 0-1.
type HSV = [number, number, number];
const toHSV = (c: Color): HSV => [((((c.h % 360) + 360) % 360) / 360), c.s, c.v];

type Props = VisualizationProps & {
  fragment: string;
};

// The wrapper fills its parent by default; the canvas fills the wrapper. The
// component carries NO intrinsic size, so give the parent explicit dimensions
// (or pass `style`/`className`) — otherwise it renders at 0x0.
const WRAP_STYLE: CSSProperties = { width: "100%", height: "100%" };
const FALLBACK_STYLE: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: "100%",
  height: "100%",
  padding: 24,
  fontSize: 13,
  letterSpacing: "0.02em",
  color: "#a0a0a6",
  textAlign: "center",
};

export default function ShaderCanvas({
  fragment,
  colors,
  running,
  state,
  dark,
  tap,
  hover,
  mic,
  drag,
  className,
  style,
  fallback,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Target palette: three HSV colours + active count. Missing slots fall back
  // to colour 0 so a 1- or 2-colour palette still has valid uniforms.
  const buildTarget = (): { cols: [HSV, HSV, HSV]; count: number } => ({
    cols: [
      toHSV(colors[0]),
      toHSV(colors[1] ?? colors[0]),
      toHSV(colors[2] ?? colors[0]),
    ],
    count: colors.length,
  });
  const colorTarget = useRef(buildTarget());
  const stateTarget = useRef<StateParams>(STATE_PARAMS[state]);
  const darkRef = useRef(dark);
  const tapRef = useRef(tap);
  const hoverPropRef = useRef(hover);
  const micPropRef = useRef(mic);
  const dragPropRef = useRef(drag);
  const controls = useRef<{ start: () => void; stop: () => void } | null>(null);
  const [failed, setFailed] = useState(false);

  // Keep the latest targets without re-running the heavy GL effect.
  useEffect(() => {
    colorTarget.current = buildTarget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors]);
  useEffect(() => {
    stateTarget.current = STATE_PARAMS[state];
  }, [state]);
  useEffect(() => {
    darkRef.current = dark;
  }, [dark]);
  useEffect(() => {
    tapRef.current = tap;
  }, [tap]);
  useEffect(() => {
    hoverPropRef.current = hover;
  }, [hover]);
  useEffect(() => {
    micPropRef.current = mic;
  }, [mic]);
  useEffect(() => {
    dragPropRef.current = drag;
  }, [drag]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        alpha: true,
        premultipliedAlpha: true, // shader outputs premultiplied colour
        antialias: true,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch {
      setFailed(true);
      return;
    }

    const gl = renderer.gl;
    if (!gl) {
      setFailed(true);
      return;
    }
    gl.clearColor(0, 0, 0, 0);

    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.appendChild(canvas);

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const program = new Program(gl, {
      vertex: VERTEX,
      fragment,
      transparent: true,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uSpin: { value: 0 },
        uCol0: { value: new Vec3(...colorTarget.current.cols[0]) },
        uCol1: { value: new Vec3(...colorTarget.current.cols[1]) },
        uCol2: { value: new Vec3(...colorTarget.current.cols[2]) },
        uCount: { value: colorTarget.current.count },
        uTap: { value: new Vec2(0, 0) },
        uTapTime: { value: 100 }, // large => no ripple until the first tap
        uHover: { value: new Vec2(0, 0) },
        uHoverAmt: { value: 0 },
        uMic: { value: 0 },
        uVoice: { value: 0 },
        uDrag: { value: new Vec2(0, 0) },
        uResolution: { value: new Vec2(1, 1) },
        uLevel: { value: stateTarget.current.level },
        uBright: { value: stateTarget.current.bright },
        uSat: { value: stateTarget.current.sat },
        uOrbit: { value: stateTarget.current.orbit },
        uLoad: { value: stateTarget.current.load },
        uFlow: { value: stateTarget.current.flow },
        uReact: { value: stateTarget.current.react },
        uDark: { value: darkRef.current ? 1 : 0 },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h);
      // setSize writes explicit px dimensions onto the canvas; force it back to
      // fill its (absolutely-sized) wrapper so it can never overflow the slot.
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      program.uniforms.uResolution.value.set(
        gl.drawingBufferWidth,
        gl.drawingBufferHeight
      );
      // Keep the still-frame correct (colours + theme) when rAF is paused.
      const ct = colorTarget.current;
      program.uniforms.uCol0.value.set(...ct.cols[0]);
      program.uniforms.uCol1.value.set(...ct.cols[1]);
      program.uniforms.uCol2.value.set(...ct.cols[2]);
      program.uniforms.uCount.value = ct.count;
      program.uniforms.uDark.value = darkRef.current ? 1 : 0;
      renderer.render({ scene: mesh });
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let cur0: HSV = [...colorTarget.current.cols[0]];
    let cur1: HSV = [...colorTarget.current.cols[1]];
    let cur2: HSV = [...colorTarget.current.cols[2]];
    let curCount = colorTarget.current.count;
    // Lerp an HSV toward its target in place: hue (0-1) takes the shortest path
    // around the wheel; saturation and value lerp linearly.
    const lerpHSV = (cur: HSV, target: HSV) => {
      const dh = (((target[0] - cur[0] + 1.5) % 1.0) - 0.5) * 0.12;
      cur[0] = (cur[0] + dh + 1.0) % 1.0;
      cur[1] += (target[1] - cur[1]) * 0.12;
      cur[2] += (target[2] - cur[2]) * 0.12;
    };
    // Live state drivers, lerped toward their targets each frame.
    let curSpeed = stateTarget.current.speed;
    let curLevel = stateTarget.current.level;
    let curBright = stateTarget.current.bright;
    let curSat = stateTarget.current.sat;
    let curOrbit = stateTarget.current.orbit;
    let curLoad = stateTarget.current.load;
    let curFlow = stateTarget.current.flow;
    let curReact = stateTarget.current.react;
    // Separate, continuously-integrated angle for the orb's comet spin. Its speed
    // is STRONGLY state-dependent (much slower when idle/listening, fast when
    // thinking/speaking) — integrating it rather than multiplying uTime keeps the
    // phase continuous, so changing state never makes the comets jump.
    let tSpin = 0;
    // Tap ripple: when a new tap id arrives, snapshot its position and restart the
    // elapsed timer; the shader uses uTapTime to expand + fade the ripple.
    let lastTapId = tapRef.current ? tapRef.current.id : -1;
    let tapElapsed = 100; // seconds since last tap (large => no ripple)
    // Hover presence, smoothed toward 1 while the cursor is over the visual.
    let hoverAmt = 0;
    // Mic level + voice-mode presence, both smoothed for a fluid reaction.
    let micLevel = 0;
    let voiceAmt = 0;
    // Drag/swipe spin: a 2-axis offset (spinX/spinY) integrated from pointer
    // movement. While dragging it tracks the pointer 1:1; on release the captured
    // velocity (flingVelX/Y) carries it on and decays — a flick-to-spin feel.
    let spinX = 0;
    let spinY = 0;
    let flingVelX = 0;
    let flingVelY = 0;

    const frame = () => {
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // clamp tab-away jumps

      // Lerp state drivers (~0.08 / frame) so transitions ease in.
      const st = stateTarget.current;
      curSpeed += (st.speed - curSpeed) * 0.08;
      curLevel += (st.level - curLevel) * 0.08;
      curBright += (st.bright - curBright) * 0.08;
      curSat += (st.sat - curSat) * 0.08;
      curOrbit += (st.orbit - curOrbit) * 0.08;
      curLoad += (st.load - curLoad) * 0.08;
      curFlow += (st.flow - curFlow) * 0.08;
      curReact += (st.react - curReact) * 0.08;

      // Reduced motion: keep it barely alive instead of buzzing.
      t += dt * (reduced ? 0.07 : 1.0) * curSpeed;
      // Comet spin speed: low base (idle ~0.33) lifted mostly by react (listening
      // ~0.7, speaking ~1.3) and flow (thinking ~1.2), plus load (connecting ~0.8)
      // — so the comets clearly rotate slower in listening/ready than speaking.
      const spinSpeed = 0.2 + 1.1 * curReact + 1.0 * curFlow + 0.55 * curLoad;
      tSpin += dt * (reduced ? 0.07 : 1.0) * spinSpeed;

      // Tap ripple: detect a new tap, snap its position, and reset the timer.
      const tp = tapRef.current;
      if (tp && tp.id !== lastTapId) {
        lastTapId = tp.id;
        tapElapsed = 0;
        program.uniforms.uTap.value.set(tp.x, tp.y);
      }
      tapElapsed += dt;
      program.uniforms.uTapTime.value = tapElapsed;

      // Hover: follow the cursor and ease presence in/out (no React re-render —
      // the position lives in a ref updated on mousemove).
      const hv = hoverPropRef.current?.current;
      const hTarget = hv && hv.active ? 1 : 0;
      hoverAmt += (hTarget - hoverAmt) * 0.12;
      if (hv && hv.active) program.uniforms.uHover.value.set(hv.x, hv.y);
      program.uniforms.uHoverAmt.value = hoverAmt;

      // Voice mode: ease presence in/out and smooth the live mic level so the
      // visual reacts fluidly to real audio rather than jumping on every sample.
      const mc = micPropRef.current?.current;
      const vTarget = mc && mc.active ? 1 : 0;
      voiceAmt += (vTarget - voiceAmt) * 0.1;
      micLevel += ((mc ? mc.level : 0) - micLevel) * 0.35;
      program.uniforms.uVoice.value = voiceAmt;
      program.uniforms.uMic.value = micLevel;

      // Drag/swipe spin: consume the movement accumulated since last frame. While
      // dragging, rotate by that delta directly (the surface tracks the pointer)
      // and keep a smoothed velocity estimate; on release, integrate that velocity
      // and decay it so the sphere glides on and eases to a stop (momentum).
      const dg = dragPropRef.current?.current;
      const ddx = dg ? dg.dx : 0;
      const ddy = dg ? dg.dy : 0;
      if (dg) {
        dg.dx = 0;
        dg.dy = 0;
      }
      const DRAG_MAP = 6.0; // coords-space delta -> spin angle
      if (dg && dg.active) {
        spinX += ddx * DRAG_MAP;
        spinY += ddy * DRAG_MAP;
        const invDt = 1 / Math.max(dt, 1e-3);
        flingVelX += (ddx * DRAG_MAP * invDt - flingVelX) * 0.3;
        flingVelY += (ddy * DRAG_MAP * invDt - flingVelY) * 0.3;
      } else {
        spinX += flingVelX * dt;
        spinY += flingVelY * dt;
        flingVelX *= 0.94; // inertia: ~per-frame friction
        flingVelY *= 0.94;
      }
      program.uniforms.uDrag.value.set(spinX, spinY);

      // Lerp each colour toward its target; count eases (crossfade).
      const ct = colorTarget.current;
      lerpHSV(cur0, ct.cols[0]);
      lerpHSV(cur1, ct.cols[1]);
      lerpHSV(cur2, ct.cols[2]);
      curCount += (ct.count - curCount) * 0.12;

      program.uniforms.uTime.value = t;
      program.uniforms.uSpin.value = tSpin;
      program.uniforms.uCol0.value.set(...cur0);
      program.uniforms.uCol1.value.set(...cur1);
      program.uniforms.uCol2.value.set(...cur2);
      program.uniforms.uCount.value = curCount;
      program.uniforms.uLevel.value = curLevel;
      program.uniforms.uBright.value = curBright;
      program.uniforms.uSat.value = curSat;
      program.uniforms.uOrbit.value = curOrbit;
      program.uniforms.uLoad.value = curLoad;
      program.uniforms.uFlow.value = curFlow;
      program.uniforms.uReact.value = curReact;
      program.uniforms.uDark.value = darkRef.current ? 1 : 0;
      renderer.render({ scene: mesh });
      raf = requestAnimationFrame(frame);
    };

    controls.current = {
      start: () => {
        if (raf) return;
        // Begin at the current colours so a tab switch after a colour change
        // doesn't sweep from a stale value.
        const ct = colorTarget.current;
        cur0 = [...ct.cols[0]];
        cur1 = [...ct.cols[1]];
        cur2 = [...ct.cols[2]];
        curCount = ct.count;
        program.uniforms.uCol0.value.set(...cur0);
        program.uniforms.uCol1.value.set(...cur1);
        program.uniforms.uCol2.value.set(...cur2);
        program.uniforms.uCount.value = curCount;
        // Don't replay the most recent tap when this viz becomes active again.
        lastTapId = tapRef.current ? tapRef.current.id : -1;
        tapElapsed = 100;
        program.uniforms.uTapTime.value = tapElapsed;
        hoverAmt = 0;
        program.uniforms.uHoverAmt.value = 0;
        micLevel = 0;
        voiceAmt = 0;
        // Reset drag spin so re-activating a viz doesn't inherit stale momentum.
        spinX = 0;
        spinY = 0;
        flingVelX = 0;
        flingVelY = 0;
        program.uniforms.uDrag.value.set(0, 0);
        // Drop any movement accumulated while this viz was inactive.
        const dg = dragPropRef.current?.current;
        if (dg) {
          dg.dx = 0;
          dg.dy = 0;
          dg.active = false;
        }
        last = performance.now();
        frame();
      },
      stop: () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      },
    };

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      controls.current = null;
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    };
  }, [fragment]);

  // Start/stop the RAF loop with active state (keeps last frame when paused).
  useEffect(() => {
    if (failed) return;
    const c = controls.current;
    if (!c) return;
    if (running) c.start();
    else c.stop();
  }, [running, failed]);

  if (failed) {
    return fallback !== undefined ? (
      <>{fallback}</>
    ) : (
      <div style={FALLBACK_STYLE}>Visualization unavailable</div>
    );
  }
  return (
    <div
      ref={containerRef}
      className={className}
      style={{ ...WRAP_STYLE, ...style }}
      aria-hidden
    />
  );
}
