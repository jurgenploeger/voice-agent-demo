"use client";

import { useEffect, useRef, useState } from "react";
import { Renderer, Triangle, Program, Mesh, Vec2 } from "ogl";
import { VERTEX } from "./shaders";
import { AgentState, STATE_PARAMS, StateParams } from "./states";
import styles from "./ShaderCanvas.module.css";

type Props = {
  fragment: string;
  hues: number[]; // 1-3 colour hues (0-360); lerped internally for smoothness
  running: boolean; // only the active visualization animates
  state: AgentState; // conversational state; drives motion/appearance
  dark: boolean; // theme — tunes the halo (clean on white vs glow on dark)
};

export default function ShaderCanvas({
  fragment,
  hues,
  running,
  state,
  dark,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // [hue0, hue1, hue2, count] targets; missing colours fall back to hue0.
  const colorTarget = useRef<[number, number, number, number]>([
    hues[0],
    hues[1] ?? hues[0],
    hues[2] ?? hues[0],
    hues.length,
  ]);
  const stateTarget = useRef<StateParams>(STATE_PARAMS[state]);
  const darkRef = useRef(dark);
  const controls = useRef<{ start: () => void; stop: () => void } | null>(null);
  const [failed, setFailed] = useState(false);

  // Keep the latest targets without re-running the heavy GL effect.
  useEffect(() => {
    colorTarget.current = [
      hues[0],
      hues[1] ?? hues[0],
      hues[2] ?? hues[0],
      hues.length,
    ];
  }, [hues]);
  useEffect(() => {
    stateTarget.current = STATE_PARAMS[state];
  }, [state]);
  useEffect(() => {
    darkRef.current = dark;
  }, [dark]);

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
        uHue: { value: colorTarget.current[0] },
        uHue1: { value: colorTarget.current[1] },
        uHue2: { value: colorTarget.current[2] },
        uCount: { value: colorTarget.current[3] },
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
      program.uniforms.uResolution.value.set(
        gl.drawingBufferWidth,
        gl.drawingBufferHeight
      );
      // Keep the still-frame correct (colours + theme) when rAF is paused.
      const ct = colorTarget.current;
      program.uniforms.uHue.value = ct[0];
      program.uniforms.uHue1.value = ct[1];
      program.uniforms.uHue2.value = ct[2];
      program.uniforms.uCount.value = ct[3];
      program.uniforms.uDark.value = darkRef.current ? 1 : 0;
      renderer.render({ scene: mesh });
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let curHue0 = colorTarget.current[0];
    let curHue1 = colorTarget.current[1];
    let curHue2 = colorTarget.current[2];
    let curCount = colorTarget.current[3];
    const lerpHue = (cur: number, target: number) =>
      cur + ((((target - cur + 540) % 360) - 180) * 0.12);
    // Live state drivers, lerped toward their targets each frame.
    let curSpeed = stateTarget.current.speed;
    let curLevel = stateTarget.current.level;
    let curBright = stateTarget.current.bright;
    let curSat = stateTarget.current.sat;
    let curOrbit = stateTarget.current.orbit;
    let curLoad = stateTarget.current.load;
    let curFlow = stateTarget.current.flow;
    let curReact = stateTarget.current.react;

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

      // Lerp each colour hue along the shortest path; count eases (crossfade).
      const ct = colorTarget.current;
      curHue0 = lerpHue(curHue0, ct[0]);
      curHue1 = lerpHue(curHue1, ct[1]);
      curHue2 = lerpHue(curHue2, ct[2]);
      curCount += (ct[3] - curCount) * 0.12;

      program.uniforms.uTime.value = t;
      program.uniforms.uHue.value = curHue0;
      program.uniforms.uHue1.value = curHue1;
      program.uniforms.uHue2.value = curHue2;
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
        curHue0 = ct[0];
        curHue1 = ct[1];
        curHue2 = ct[2];
        curCount = ct[3];
        program.uniforms.uHue.value = curHue0;
        program.uniforms.uHue1.value = curHue1;
        program.uniforms.uHue2.value = curHue2;
        program.uniforms.uCount.value = curCount;
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
    return <div className={styles.fallback}>Visualization unavailable</div>;
  }
  return <div ref={containerRef} className={styles.wrap} aria-hidden />;
}
