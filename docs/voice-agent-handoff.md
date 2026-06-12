# Voice Agent Visualizations: Cross-SDK Handoff

Knowledge-transfer document for reimplementing the voice-agent visualizations natively on iOS, Android, Flutter, React Native, and Web. Everything in this document is derived from the code in this repository. Where something could not be determined from the code it is marked **UNKNOWN, needs author input**.

File references are relative to the repository root.

---

## 1. Overview

### Stack and dependencies

| Dependency | Version (package.json / lockfile) | Role |
| --- | --- | --- |
| next | 15.5.18 | App framework (App Router), demo shell only |
| react / react-dom | 19.0.0 | UI |
| ogl | ^1.0.11 (resolved 1.0.11) | Minimal WebGL library; renders the fragment shaders |
| geist | ^1.7.1 | Geist Sans font (demo chrome only) |
| @phosphor-icons/react | ^2.1.10 | Icons (demo chrome only) |
| typescript | ^5 | Dev only |

There are no audio SDK dependencies. The voice mode uses the browser-native Web Audio API (`getUserMedia`, `AudioContext`, `AnalyserNode`) directly in [Phone.tsx](../app/components/Phone.tsx).

### Architecture

The repo splits into two layers:

1. **The reusable visualization engine** in `app/components/visualizations/`. Self-contained: only React and `ogl` are required. No Next.js, global CSS, fonts, or build-time shader loaders. All seven visualizations are thin wrappers around one shared component, `ShaderCanvas`, each injecting a different fragment shader string.
2. **The demo shell** (everything else under `app/`): a simulated iPhone or resizable desktop window, a chat and voice flow, and a settings panel. This layer is not meant to be ported as-is; it exists to exercise the engine.

### Entry points

| Concern | File |
| --- | --- |
| Page root, demo state (style, agent state, palette, theme, size, expressivity) | [app/page.tsx](../app/page.tsx) |
| Phone/desktop frame, chat flow, voice mode, tap/hover/drag forwarding | [app/components/Phone.tsx](../app/components/Phone.tsx) |
| Control panel (style grid, state segmented control, sliders, swatches) | [app/components/Controls.tsx](../app/components/Controls.tsx) |
| Color picker (hue wheel, SV square, hex, presets) | [app/components/ColorPicker.tsx](../app/components/ColorPicker.tsx) |
| Shared rendering engine (OGL setup, render loop, all uniform smoothing) | [app/components/visualizations/ShaderCanvas.tsx](../app/components/visualizations/ShaderCanvas.tsx) |
| All GLSL (vertex + 7 fragment shaders + shared helpers) | [app/components/visualizations/shaders.ts](../app/components/visualizations/shaders.ts) |
| Conversational state enum + per-state driver values | [app/components/visualizations/states.ts](../app/components/visualizations/states.ts) |
| Color model (full HSV), conversions, harmony/shuffle logic | [app/components/color.ts](../app/components/color.ts) |
| Public exports of the engine | [app/components/visualizations/index.ts](../app/components/visualizations/index.ts) |
| Demo-only state labels (display strings, ordering) | [app/components/stateLabels.ts](../app/components/stateLabels.ts) |

> Note: [app/components/visualizations/README.md](../app/components/visualizations/README.md) is the engine's quick-start (install, usage, prop table). This document is the full spec; where they differ, `ShaderCanvas.tsx` is the source of truth.

### Rendering model (applies to all seven visualizations)

- One OGL `Renderer` per mounted visualization, with `alpha: true`, `premultipliedAlpha: true`, `antialias: true`, and device pixel ratio capped at 2.
- Geometry is a single fullscreen triangle; all visuals are pure fragment shaders.
- All shaders output **premultiplied alpha** so halos blend into the background instead of sitting on top of it.
- A `requestAnimationFrame` loop runs only while `running` is true; when paused, the last frame is held (the canvas is not cleared). A `ResizeObserver` re-renders one still frame on resize so the paused frame stays correct.
- If WebGL context creation fails, the component renders a `fallback` node (default: a "Visualization unavailable" message).
- `prefers-reduced-motion: reduce` multiplies the shader time step by 0.07 so the visuals stay barely alive instead of animating fully.
- On unmount the WebGL context is explicitly released via the `WEBGL_lose_context` extension.

---

## 2. Component inventory

All seven visualization styles render through fragment shaders on a fullscreen triangle (WebGL via OGL). There is no CSS or SVG visualization.

| Component | File | Fragment shader | Rendering | Description |
| --- | --- | --- | --- | --- |
| `Glow` | `app/components/visualizations/Glow.tsx` | `GLOW_FRAGMENT` | Fragment shader | Soft, airy globe with orbiting color masses and concentric interior waves; the background shows through. Default style on load. |
| `Orb` | `app/components/visualizations/Orb.tsx` | `ORB_FRAGMENT` | Fragment shader | Flat disc of flowing, domain-warped liquid color (Siri-style) with a soft sheen and tight halo. |
| `Sphere` | `app/components/visualizations/Sphere.tsx` | `SPHERE_FRAGMENT` | Fragment shader | Glossy 3D liquid sphere; bump-mapped meridian folds, sharp specular streaks, edge bulges while speaking. The only style that supports drag-to-spin. |
| `Ring` | `app/components/visualizations/Ring.tsx` | `RING_FRAGMENT` | Fragment shader | Thin circle with 72 radial bars fanning outward, like a circular spectrum analyzer; bars erupt in clusters on speech. |
| `Bars` | `app/components/visualizations/Bars.tsx` | `BARS_FRAGMENT` | Fragment shader | Classic linear EQ: 8 vertical rounded capsules that rest as dots and grow tall only while speaking. |
| `Aura` | `app/components/visualizations/Aura.tsx` | `AURA_FRAGMENT` | Fragment shader | Six woven glowing strands with depth-of-field blur; they swell and entangle in the center, flatten at the edges. |
| `Wave` | `app/components/visualizations/Wave.tsx` | `WAVE_FRAGMENT` | Fragment shader | Single traveling waveform line under a Gaussian packet; flat-lines when idle, erupts with natural pauses when speaking. |

Demo-only visuals (not part of the engine, not shader-based):

| Element | File | Rendering | Description |
| --- | --- | --- | --- |
| Voice-memo waveform | `Phone.tsx` (`drawWaveform`) | Canvas 2D | WhatsApp-style scrolling amplitude history while recording; fixed 6 px bar pitch, ~22 samples/s, driven by mic RMS (or a procedural fallback). |
| Status dot | `Phone.module.css` (`.statusDot`) | CSS keyframes | 5 px dot next to the status label; breathes (scale 0.85 to 1.15, opacity 0.35 to 1) at a per-state tempo. |
| "Thinking..." shimmer | `Phone.module.css` (`.thinking`) | CSS gradient text | Sliding gradient highlight across the text, 1.5 s linear, infinite. |

---

## 3. Parameter / prop API

### 3.1 `VisualizationProps` (identical for all seven components)

Defined in [ShaderCanvas.tsx](../app/components/visualizations/ShaderCanvas.tsx). The wrappers add nothing; every style takes exactly these props.

| Prop | Type | Default | Range / options | Controls | Owner |
| --- | --- | --- | --- | --- | --- |
| `colors` | `Color[]` (`{h: 0-360, s: 0-1, v: 0-1}`) | required | 1 to 5 entries | Palette. Maps to uniforms `uCol0`..`uCol4` + `uCount`. | Design |
| `running` | `boolean` | required | true/false | Whether the rAF loop runs. False holds the last frame. Only the visible style should run. | Developer |
| `state` | `AgentState` | required | `"idle" \| "connecting" \| "listening" \| "thinking" \| "speaking"` | Conversational state; selects a row of `STATE_PARAMS` (see section 4). | Developer (agent lifecycle) |
| `dark` | `boolean` | required | true/false | Theme flag. Maps to uniform `uDark` (0/1). Tunes halo brightness, deep-shade depth, overlap treatment. | Developer (theme) |
| `expressivity` | `number` | `1` | 0 to 2, clamped by the engine | Motion liveliness multiplier. See 3.3. Maps to `uExpressivity` plus JS-side scaling. | Design |
| `tap` | `{x, y, id} \| null` | `undefined` | position in shader coords (see below); `id` increments per tap | One-shot tap ripple. Maps to `uTap` (position) and `uTapTime` (seconds since tap). | Developer (input wiring) |
| `hover` | ref: `{current: {x, y, active}}` | `undefined` | shader coords + active flag | Continuous hover ripple. Maps to `uHover` + smoothed `uHoverAmt`. Mutable ref, read per frame, never re-renders React. | Developer (input wiring) |
| `mic` | ref: `{current: {level, active}}` | `undefined` | level 0 to 1 | Live microphone level. Maps to smoothed `uMic` and presence `uVoice`. | Developer (audio wiring) |
| `drag` | ref: `{current: {dx, dy, active}}` | `undefined` | accumulated pointer deltas in shader coords | Drag/swipe spin with momentum. Maps to `uDrag`. Only the Sphere shader reads it. | Developer (input wiring) |
| `className` | `string` | `undefined` | any | Forwarded to the wrapper div for sizing/positioning. | Developer |
| `style` | `CSSProperties` | `undefined` | any | Forwarded to the wrapper; overrides the default 100 percent fill. | Developer |
| `fallback` | `ReactNode` | "Visualization unavailable" message | any | Shown when WebGL is unavailable. | Developer |

**Coordinate space** for `tap`/`hover`/`drag`: center is (0, 0), normalized to the **shorter** canvas edge, y points **up** (DOM y is flipped before forwarding). See `pointerInViz` in `Phone.tsx` and `coords()` in `shaders.ts`.

### 3.2 Color: storage, uniforms, and the harmonic palette

**Model.** Colors are full HSV (`{h: 0-360, s: 0-1, v: 0-1}`), defined in [color.ts](../app/components/color.ts). Hue, saturation, and value are all preserved end to end so muted, pastel, or dark brand colors render true. Hex is only the picker's I/O format. The default color is Stream brand blue `#005FFF`.

**Uniform wiring.** `ShaderCanvas` converts each color to `(h/360, s, v)` and uploads up to five as `vec3` uniforms `uCol0`..`uCol4`, plus `uCount` (number of active colors, 1 to 5). Missing slots fall back to color 0 so uniforms are always valid. On the JS side, every color is lerped toward its target each frame (factor 0.12 per frame; hue takes the shortest path around the wheel), and `uCount` itself is lerped, so adding/removing/changing a color crossfades rather than snaps.

**Single-color (mono) behavior.** Each shader synthesizes a gradient when fewer than 3 colors are active by deriving shades of color 0 in GLSL:
- a light shade (value times 1.30 in the Orb, times 1.18 in Glow/Sphere), and
- a deep shade (value times roughly 0.74 to 0.94, theme-dependent; light mode lifts it so no dark mass crosses a white background).

Slots 2 and 3 crossfade from these derived shades to the real colors 2/3 as `uCount` passes 2 and 3. Colors 4/5 ride extra noise fields/masses/strands gated by `uCount` so a 1-to-3-color setup is pixel-identical to before they existed.

**In-shader tone mapping** (shared helpers in `shaders.ts`):
- `vivid(hsv)`: renders the user's HSV as-is, except dark mode nudges saturation up by +0.06.
- `saturate3(c, s)` and `desat(c, s)`: saturation push/pull around luminance. `saturate3` keeps multi-hue blends from going muddy; `desat` is driven by `uSat`, which every conversational state pins at 1.0, so it is a no-op unless a custom state lowers it.

**Harmonic palette generation** (`shuffleColors` in `color.ts`, demo "Shuffle" button):
1. Pick a random base hue (0 to 360).
2. Pick a random scheme from a table keyed by color count:
   - 2 colors: analogous [0, 40], complementary [0, 180], split-complementary [0, 150], partial triad [0, 120]
   - 3 colors: analogous [0, 35, 70], triadic [0, 120, 240], split-complementary [0, 150, 210], analogous + accent [0, 30, 320]
   - 4 colors: analogous [0, 30, 60, 90], tetradic [0, 90, 180, 270], double complementary [0, 60, 180, 240], triad + accent [0, 120, 240, 30]
   - 5 colors: analogous sweep [0, 30, 60, 90, 120], pentadic [0, 72, 144, 216, 288], split-complement + accents [0, 150, 210, 30, 330], triad + bridges [0, 120, 240, 60, 300]
3. Add plus/minus 8 degrees of jitter to every offset except the first.
4. Derive S/V via `vividColor(hue)`: s = 0.88, v = 1.0, except the acidic yellow-green band (hue roughly 45 to 185) is smoothly tamed toward s = 0.68, v = 0.92.

`vividColor` is used only for generated colors (defaults, "Add color" which shifts hue +80 degrees, Shuffle, picker presets). User-picked colors are honored exactly. Picker presets are ten vivid hues at 36-degree steps plus near-black `#111111` and white `#FFFFFF`.

### 3.3 Expressivity

A single scalar, default 1, **clamped to 0..2 by the engine** (the shaders are only tuned for that range; values outside it would push the amplitude/speed scales into untested territory or invert motion). It scales **motion only**; presence (`bright`) and saturation (`sat`) are deliberately untouched. Wiring (in `ShaderCanvas`'s frame loop):

- Amplitude scale: `ampScale = 0.15 + 0.85 * expressivity` (0.15 at min, 1 at default, 1.85 at max). Multiplies the state drivers `level`, `load`, `flow`, `react` before they are lerped into uniforms.
- Speed scale: `speedScale = 0.6 + 0.4 * expressivity` (0.6 at min, 1 at default, 1.4 at max). Multiplies the state's `speed` (the global time multiplier).
- Both keep a floor so even at 0 the visual gently breathes rather than freezing.
- The raw value is also uploaded as `uExpressivity` (itself lerped at 0.08 per frame), used by two shaders directly:
  - Sphere: fold frequency multiplier `fexp = 1.15 - 0.15 * uExpressivity`, so higher expressivity means fewer, wider, bigger bulges.
  - Orb: liquid drift speed factor `0.8 + 0.2 * uExpressivity` on its internal flow time.

### 3.4 Size

Size is **not** a prop of the visualization components. They have no intrinsic dimensions and fill their parent (default wrapper style is `width/height: 100%`). The demo's Size slider (range 0.7 to 1.3, defined as `SIZE_MIN`/`SIZE_MAX` in `Controls.tsx`) sets a CSS variable `--viz-scale` on the container in `Phone.tsx`; the container is sized as `min(100cqmin, 360px) * var(--viz-scale)` in `Phone.module.css` (`.bouncer`). Resizing the box re-renders the shader crisply at the new resolution (it is a real layout resize, not a transform). On native, implement size as the host view's layout dimensions.

### 3.5 Design-customizable vs developer-controlled

- **Design-customizable** (intended to be exposed to end customers/designers): `colors` (1 to 5 full-HSV colors), `expressivity`.
- **Developer-controlled** (app integration concerns): `state` (wired to the agent lifecycle), `running`, `dark` (theme), size/layout (host container), `tap`/`hover`/`mic`/`drag` (input and audio plumbing), `className`/`style`/`fallback`.

### 3.6 Full uniform reference

Every shader shares this uniform set (declared once in the shared GLSL header):

| Uniform | Type | Source | Meaning |
| --- | --- | --- | --- |
| `uTime` | float | integrated `dt * speed` per frame | Shader time. Already carries per-state speed, expressivity speed lift, and the reduced-motion factor. |
| `uCol0`..`uCol4` | vec3 | `colors`, lerped | HSV colors (h as 0-1 fraction). |
| `uCount` | float | `colors.length`, lerped | Active color count, 1 to 5, fractional during crossfade. |
| `uResolution` | vec2 | drawing buffer | Pixels, for coords and anti-aliasing widths. |
| `uLevel`, `uBright`, `uSat` | float | `STATE_PARAMS`, lerped, amp-scaled | Intensity scalars (see section 4). `uBright` multiplies alpha everywhere; `uSat` drives `desat` (pinned at 1.0 in every state, so currently a no-op). `uLevel` is uploaded but currently unread by any shader body (see Resolved decisions, item 6). |
| `uLoad`, `uFlow`, `uReact` | float | `STATE_PARAMS`, lerped, amp-scaled | Motion-pattern weights (see section 4). |
| `uFlowSpin` | float | integrated `tStep * flow` | Flow-gated spin time; advances only while thinking so the thinking rotation eases in/out instead of jumping. |
| `uOrbSpin` | float | integrated `tStep * (1.0 + 0.5*flow + 0.1*react)` | Orbit phase for Glow's color masses; integration prevents angle jumps on state changes. |
| `uExpressivity` | float | prop, lerped | See 3.3. |
| `uDark` | float | `dark` prop | 1 dark, 0 light. |
| `uTap` / `uTapTime` | vec2 / float | `tap` prop | Tap position and seconds since tap (initialized to 100 = no ripple). |
| `uHover` / `uHoverAmt` | vec2 / float | `hover` ref | Cursor position and smoothed hover presence 0 to 1. |
| `uMic` / `uVoice` | float / float | `mic` ref | Smoothed mic level 0 to 1 and smoothed voice-mode presence 0 to 1. The level is supplied by the host (see Resolved decisions, item 1): RMS-like, normal speech peaking near 1, fed at 15 Hz or more; the engine does its own smoothing. |
| `uDrag` | vec2 | `drag` ref | Accumulated spin angle (x horizontal, y vertical) with momentum. Sphere only. |

While voice mode is active, the JS loop overrides reactivity: `uReact = curReact + (max(curReact, micLevel) - curReact) * voiceAmt`, so the visual speaks in sync with real audio regardless of the selected state.

---

## 4. State model

`AgentState` (in [states.ts](../app/components/visualizations/states.ts)):

```
"idle" | "connecting" | "listening" | "thinking" | "speaking"
```

The five states differ **purely by animation**: their `bright` and `sat` are pinned at 1.0, so the palette never dims or desaturates between them. Each state is a row of scalar drivers (`STATE_PARAMS`), uploaded as uniforms after JS-side smoothing:

| State | level | speed | bright | sat | load | flow | react | Reads as |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| idle | 0.2 | 0.4 | 1.0 | 1.0 | 0.0 | 0.0 | 0.12 | Calm, slow, barely-there shimmer |
| connecting | 0.6 | 1.0 | 1.0 | 1.0 | **1.0** | 0.0 | 0.0 | Loader sweep + pulsing opacity breath ("not ready yet") |
| listening | 0.6 | 0.9 | 1.0 | 1.0 | 0.0 | 0.0 | 0.45 | Gentle responsive expand-contract |
| thinking | 0.6 | 1.25 | 1.0 | 1.0 | 0.0 | **1.0** | 0.0 | Slow rigid rotation / traveling wave ("busy" via motion) |
| speaking | 1.25 | 1.25 | 1.0 | 1.0 | 0.0 | 0.0 | **1.0** | Strong reactive amplitude with natural pauses |

The three motion-pattern weights work LiveKit-style: exactly one is ~1 per state, and because each driver is lerped at 0.08 per frame, switching states **crossfades between motion patterns** rather than cutting.

How each shader interprets the states, briefly:

- **Speaking**: every shader computes `speech = uReact * mix(steady breath, speechEnv(t), smoothstep(0.6, 1.0, uReact))`. `speechEnv` is a shared GLSL function: a slow phrase gate (simplex noise at t times 0.6, ~0 during pauses) times a faster syllable wobble (noise at t times 3.0). So speaking ebbs and pauses like real talking. Listening, with react = 0.45, falls below the smoothstep and uses the steady sine breath instead, reading as attentive rather than quietly talking.
- **Thinking**: driven by `uFlowSpin` (Orb/Glow: slow rigid rotation of the color field at 0.30 radians per flow-gated time unit; Bars: traveling wave; Wave: higher frequency; Ring: nothing special beyond speed).
- **Connecting**: `uLoad` drives an opacity breath everywhere (e.g. `mix(1.0, 0.5 + 0.4*sin(t*2.0), uLoad)`) plus a style-specific loader: side-to-side packet sweep (Wave), bump sweeping across the bars (Bars), all-bars-together pulse (Ring), size breath (Glow/Sphere).
- **Idle**: low level and speed; small react floor (0.12) keeps a faint shimmer.

**Demo chat lifecycle** (Phone.tsx, demo-only but a useful reference): sending a message sets the agent to `thinking` for a randomized 650 to 2000 ms, then `speaking` while the reply types out (16 to 38 ms per character), then `idle` 700 ms after typing completes. Outside chat mode the manually selected state always wins. The status dot and label track this `effectiveState`.

---

## 5. Animation catalog

### Group A: discrete interaction animations

These are one-shot or transition animations with explicit curves and durations. They map directly to native animation APIs.

Easing-curve translation table used below:

| CSS curve | iOS (SwiftUI / Core Animation) | Android (Compose) | Flutter |
| --- | --- | --- | --- |
| `cubic-bezier(0.4, 0, 0.2, 1)` (Material standard) | `UnitCurve(startControlPoint: .init(x: 0.4, y: 0), endControlPoint: .init(x: 0.2, y: 1))` or `CAMediaTimingFunction(controlPoints: 0.4, 0, 0.2, 1)` | `FastOutSlowInEasing` (exact) | `Curves.fastOutSlowIn` (exact) |
| CSS `ease-out` = `cubic-bezier(0, 0, 0.58, 1)` | `.easeOut` | `CubicBezierEasing(0f, 0f, 0.58f, 1f)` | `Curves.easeOut` (exact) |
| `cubic-bezier(0.32, 0.72, 0, 1)` (iOS-sheet feel) | custom cubic with the same control points | `CubicBezierEasing(0.32f, 0.72f, 0f, 1f)` | `Cubic(0.32, 0.72, 0, 1)` |
| `cubic-bezier(0.22, 1, 0.36, 1)` | custom cubic | `CubicBezierEasing(0.22f, 1f, 0.36f, 1f)` | `Cubic(0.22, 1, 0.36, 1)` (close to `Curves.easeOutQuint`) |
| `cubic-bezier(0.2, 0.7, 0.2, 1)` | custom cubic | `CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f)` | `Cubic(0.2, 0.7, 0.2, 1)` |
| JS ease-out cubic `1 - (1-x)^3` | custom / `.easeOut` approximation | `CubicBezierEasing(0.33f, 1f, 0.68f, 1f)` | `Curves.easeOutCubic` (exact) |

#### A1. Tap-to-bounce (all styles)

Source: `bounce()` in `Phone.tsx`, applied with the Web Animations API to the visual stack only (the greeting text does not move). Skipped under reduced motion. Triggered only when the tap lands inside the style's hit region (see A6).

Keyframes on `transform: scale`, duration **340 ms**, easing **ease-out** across the whole keyframe set:

| Offset | Scale |
| --- | --- |
| 0 percent | 1.00 |
| 30 percent | 0.93 |
| 62 percent | 1.03 |
| 100 percent | 1.00 |

The same tap is forwarded to the shader as `uTap`/`uTapTime` for the ripple (Group B note below; the ripple itself is shader-side).

Native equivalents: the most faithful port is a keyframe animation, not a spring, because the dip-then-overshoot shape is authored explicitly.
- iOS: SwiftUI `keyframeAnimator` with the same four scale stops over 0.34 s; an approximate spring alternative is `.spring(response: 0.34, dampingFraction: 0.55)` after an initial scale-down.
- Android: Compose `keyframes { durationMillis = 340; 0.93f at 102; 1.03f at 211; 1f at 340 }` on a scale `Animatable`.
- Flutter: `TweenSequence` with weights 30/32/38 over a 340 ms `AnimationController`, curve `Curves.easeOut`.

#### A2. Hover ripple (all styles, mouse only)

The hover position feeds the shader each frame via a ref; there is no CSS or WAAPI animation. Two tunable timings:
- Presence ease-in/out: `hoverAmt += (target - hoverAmt) * 0.12` per frame, an exponential approach. At 60 fps this is a time constant of roughly **0.13 s** (about 0.36 s to 95 percent).
- The ripple itself is continuous shader motion: `sin(distance * 30 - uTime * 7)` under a Gaussian envelope of width 0.22 around the cursor, amplitude 0.6 (the Sphere multiplies the hover ripple by 2.4 and converts it into a normal-map perturbation; the Ring lifts bars near the cursor's angle with a quiver of `sin(t * 9)`; Wave/Aura displace the line locally).

This is therefore a hybrid: the **gating** maps to a native ease (about 130 ms exponential), the **ripple** is Group-B shader motion. Touch never triggers hover (pointer type is checked) because touch emulates mousemove without mouseleave and the ripple would stick on.

#### A3. Drag/spin with momentum (Sphere only)

Source: pointer handlers in `Phone.tsx` plus the integration in `ShaderCanvas`'s frame loop.

- While dragging: pointer deltas (in shader coords) are multiplied by **6.0** (`DRAG_MAP`) and added to the spin angle directly, so the surface tracks the pointer 1:1. A smoothed velocity estimate is kept: `flingVel += (instantVel - flingVel) * 0.3` per frame.
- On release: the spin integrates the captured velocity, which decays by **0.94 per frame**. At 60 fps that is an exponential decay rate of about 3.7 per second, time constant roughly **0.27 s** (the fling visibly settles in around 0.8 to 1 s).
- A drag beyond a small threshold (0.004 in coords space) suppresses the tap ripple on release.
- The resulting angles reach the shader as `uDrag` and are added to the Sphere's base rotation; horizontal drag adds to the spin phase, vertical drag rolls the color field and noise.

Native equivalents:
- iOS: `DragGesture` (SwiftUI) accumulating into the shader angle, then a manual exponential decay or `UIDynamicItemBehavior`-style resistance; there is no built-in SwiftUI decay animation, so decaying the velocity by `exp(-3.7 * dt)` per frame is the direct port.
- Android: Compose `detectDragGestures` + `exponentialDecay()` on a `Animatable`/`AnimationState`; tune the friction so the time constant is about 0.27 s.
- Flutter: `GestureDetector.onPanUpdate` + `FrictionSimulation` (or manual `velocity *= pow(0.94, dt * 60)`).

#### A4. Style crossfade (switching visualizations)

All seven canvases stay mounted in layers; the active one gets `opacity: 1` and `running: true`, the rest fade out and pause. Transition: **opacity 0.3 s ease** (`.vizLayer` in `Phone.module.css`). Native: a 300 ms ease opacity crossfade between two shader views, pausing the hidden one's render loop.

#### A5. Hero-to-chat dock morph

When the first message is sent, the centered visual morphs into a small presence near the top (`.bouncerDocked`): `transform: translateY(calc(138px - 50cqh)) scale(0.4)`, transitioned with **transform 0.32 s cubic-bezier(0.4, 0, 0.2, 1)**; the container's width/height (Size slider changes) transition at **0.18 s ease**. The message list fades in over 0.4 s ease (`messagesIn`), and each bubble enters with **0.28 s cubic-bezier(0.2, 0.7, 0.2, 1)** rising 6 px with a fade (`msgIn`).

Native: a 320 ms `fastOutSlowIn` translate+scale of the shader view toward a top anchor (final scale 0.4, center ending 138 px from the top), with the chat list fading in underneath.

#### A6. Tap/hover/drag hit regions

Interactions only engage when the pointer is inside the active style's hit region, measured from the container center in coords space (`pointerInViz` in `Phone.tsx`): Orb/Glow/Sphere radius < 0.32; Aura radius < 0.42; Ring radius < 0.46; Bars |x| < 0.34 and |y| < 0.48; Wave |y| < 0.14 and |x| < 0.5.

#### A7. Demo chrome transitions (lower priority for SDK ports)

| Animation | Timing | Source |
| --- | --- | --- |
| Phone-to-desktop frame morph (width/height/border-radius/padding) | 0.5 s cubic-bezier(0.4, 0, 0.2, 1) | `Phone.module.css` `.phone` |
| State segmented-control thumb slide | 0.36 s cubic-bezier(0.22, 1, 0.36, 1) | `page.module.css` `.stateSegThumb` |
| Desktop side panel collapse/expand | 0.42 s cubic-bezier(0.32, 0.72, 0, 1) | `page.module.css` `.sidePanel` |
| Mobile settings sheet tap-open/close | JS scroll tween, 230 ms, ease-out cubic `1 - (1-x)^3` | `page.tsx` `tweenScroll` |
| Settings sheet surface recede (stacked-sheet look) | 0.34 s cubic-bezier(0.32, 0.72, 0, 1) | `page.module.css` `.sheet2Surface` |
| Color picker popover pop-in | 0.24 s cubic-bezier(0.32, 0.72, 0, 1), scrim 0.28 s ease | `ColorPicker.module.css` |
| Swatch add/remove (width + margin collapse + fade) | 0.3 s cubic-bezier(0.4, 0, 0.2, 1) | `page.module.css` `swatchIn`/`swatchOut` |
| Voice composer enter | 0.34 s cubic-bezier(0.2, 0.7, 0.2, 1) (`voiceFieldIn`), waveform 0.42 s same curve (`waveIn`) | `Phone.module.css` |
| Recording dot pulse | 1.4 s ease-in-out infinite (`recPulse`) | `Phone.module.css` |
| Status dot breathe | scale 0.85 to 1.15, opacity 0.35 to 1, ease-in-out infinite; duration per state: idle 3.8 s, connecting 1.3 s, listening 2.6 s, thinking 1.6 s, speaking 0.85 s | `Phone.module.css` `breathe` |
| "Thinking..." text shimmer | background-position sweep, 1.5 s linear infinite | `Phone.module.css` `textShimmer` |
| Typing reveal | one character per 16 + random(0..22) ms | `Phone.tsx` `startTyping` |
| Theme crossfade | background/color 0.2 s ease on most chrome (message bubbles and screen background intentionally snap) | `globals.css`, `Phone.module.css` |

Nearly all of these are gated behind `prefers-reduced-motion: reduce`.

#### A8. Per-frame exponential smoothing (a cross-cutting Group A/B bridge)

All "eases" inside the render loop are per-frame lerps of the form `current += (target - current) * k`. **They are not dt-corrected**: the factor is applied once per rAF frame, so on a 120 Hz display they settle twice as fast as on 60 Hz. A native port should either replicate per-frame behavior at a fixed tick or convert to time-based exponential smoothing using the 60 fps equivalents below:

| Quantity | k per frame | 60 fps time constant |
| --- | --- | --- |
| State drivers (speed, level, bright, sat, load, flow, react), expressivity | 0.08 | ~0.20 s |
| Colors (HSV channels), color count, hover presence | 0.12 | ~0.13 s |
| Voice-mode presence | 0.10 | ~0.16 s |
| Mic level | 0.35 | ~0.04 s |
| Fling velocity estimate (while dragging) | 0.30 | ~0.05 s |

Frame delta is clamped to 50 ms so tab-away jumps cannot leap the animation.

### Group B: continuous shader-driven motion

These are procedural, time-driven loops inside the fragment shaders. **They do not map to a tween curve.** Each one is a function of continuous time (plus noise), not an interpolation between two states; porting them means porting the shader math, not approximating with animation APIs.

**Time base, common to all:** the JS loop integrates `t += dt * curSpeed`, where `curSpeed` is the lerped per-state speed times the expressivity speed scale (and times 0.07 under reduced motion). All frequencies below are in this **shader-time** unit; real-time period = shader period / (state speed times speedScale). Example: the Orb's mono breath `sin(t * 0.9)` has a shader period of ~7.0 s, which is ~17.5 s of wall time at idle (speed 0.4) and ~5.6 s while speaking (speed 1.25).

**Noise:** all shaders use the Ashima/Stefan Gustavson 3D simplex noise (`snoise`), pasted inline in `shaders.ts`. The third dimension is used as time so 2D fields evolve smoothly.

**Shared speech envelope:** `speechEnv(t) = clamp(gate * syllable)` where gate = `smoothstep(-0.25, 0.35, snoise(t*0.6, ...))` (slow phrase on/off) and syllable = `0.55 + 0.45 * snoise(t*3.0, ...)`. This is why "speaking" pauses naturally on every style.

**Shared tap ripple (shader-side):** concentric wave `sin(d * 34 - age * 24)` under a Gaussian shell whose front expands at 0.75 units/s, whole ripple decays as `exp(-age * 2.6)` and cuts off at 1.5 s.

Per style:

#### Orb (flat liquid disc)
- Disc radius 0.24, scaling +14 percent with the speech signal.
- Two-stage domain warp of the disc coordinates: first warp simplex at spatial frequency 0.65, amplitude `0.36 + 0.24 * energy`; second gentle warp at frequency 0.85, amplitude 0.14. Internal flow time `ct = (t*0.13 + uFlowSpin*0.05) * (0.8 + 0.2*uExpressivity)`.
- Energy mix: `0.10 + 0.28*react + 0.18*flow + 0.22*load + 0.42*speech`.
- Color blending: 3 to 5 overlapping simplex fields at frequency 0.5, mixed with wide smoothsteps; one broad white sheen sweep.
- Thinking: rigid rotation of the warped field by `uFlowSpin * 0.30` (only thinking rotates).
- Connecting: opacity breath `0.5 + 0.4 * sin(t * 2.0)`.
- Mono extra: interior opens up in calm states and breathes with `sin(t * 0.9)` (~7 s shader period), firming back toward solid while speaking.

#### Glow (soft airy globe)
- Radius 0.24 with size pulse: `+0.20 * speechSmooth` (a half low-passed copy of the speech signal so the globe breathes with phrases instead of juddering per syllable), plus connecting breath `0.05 * sin(t*2.0) * load` and listening wobble `0.04 * sin(t*1.6) * react`.
- Interior: domain-warped noise (frequency 0.7, amplitude `0.20 + 0.28 * energy`), plus a concentric tangential ripple `sin(radius*5 - t*2)` faded near the center.
- Two to four orbiting color masses on circular paths (radii 0.34 to 0.40); angles come from the integrated `uOrbSpin` times factors +0.42, -0.34, +0.30, -0.26 plus slow noise wobbles. Integration on the JS side means state flips ease orbit speed without angle jumps.
- Soft diffuse 3D shading (light upper-left), faint fresnel rim, no specular hotspot. Body alpha is wave-driven so the globe reads as airy wisps.
- Thinking rotation: rigid `uFlowSpin * 0.30`, same as Orb.

#### Sphere (glossy liquid globe)
- Base radius 0.245, constant spin `rot = t * 0.5 + uDrag.x` (left to right).
- Surface relief: two meridian fold waves `sin(x * 7 * fexp - rot)` and `sin(x * 13 * fexp - rot * 1.8)` where `fexp = 1.15 - 0.15 * uExpressivity`; analytic gradient drives a normal perturbation with strength `0.060 + 0.105 * energy`; simplex (frequency 1.4, time `t * 0.22`) adds organic perturbation.
- Silhouette: the same folds sampled at the rim, weighted by `cos(angle)^2` so only the left/right edges bulge; while speaking, rectified crests additionally swell outward by up to `0.06*react + 0.16*speech`.
- Lighting: blinn-ish with specular power 46 (sharp silky streaks), broad sheen power 9, fresnel power 2.6. Light direction (0.42, 0.34, 0.84).
- Color: large drifting simplex masses sweeping with the spin (`drift = rot * 0.5`), one mass per extra color.
- Hover: a rounded crest protrudes toward the cursor's angle (Gaussian in angle, width 0.7 rad) and the hover ripple is amplified 2.4x into the normal map.
- Connecting: opacity breath `0.62 + 0.38 * sin(t * 1.9)`.

#### Ring (circular analyzer)
- Ring radius 0.205, 72 angular bar cells, bar fills 34 percent of its cell.
- Per-bar amplitude = three rotating von Mises group envelopes `exp(3.2 * (cos(angle - t*0.55) - 1))` (two co-rotating at different phase offsets, one counter-rotating at 0.5) times per-bar simplex `snoise(idx * 0.8, t * 1.0)`, sharpened with power 1.25. Idle scales energy to 0.16; speaking to 1.0 with the speech envelope ebbing the whole fringe.
- Connecting: all bars breathe together at `sin(t * 2.2)`, no sweep.
- Palette: up to 5 hues at evenly spaced angles with periodic (seam-free) von Mises weights, the whole set rotating at `t * 0.16`.
- Soft outer glow whose width grows with speech.

#### Bars (linear EQ)
- 8 capsules, total span 0.60, capsule radius 0.030 (constant; short bars naturally read as dots).
- Height program: speaking term `0.235 * centerWindow * perBarNoise * speech * speakGate * talkEnvelope` (speak gate = smoothstep(0.45, 0.85, react), so only speaking grows tall bars); idle dot breath `0.012 * sin(t*1.3 + idx*0.7)`; thinking traveling wave `0.035 * (0.4 + 0.6 * (0.5 + 0.5 * sin(u*6 - t*3)))`; connecting Gaussian bump sweeping at `fract(t * 0.4)` with width 0.14.
- Color: one smooth gradient flowing through the row (sample coordinate mixes bar position, pixel height, and `sin(t * 0.5)` drift), wide bands so multiple colors blend rather than stripe.

#### Wave (single line)
- Gaussian packet, half-width sigma 0.18, centered except connecting sweeps it by `0.30 * sin(t * 1.3)`.
- Traveling wave `sin(x * freq - t * 5)` with `freq = 24 + 26*react + 10*flow` (crests pack closer while speaking).
- Amplitude: base ripple `0.018 + 0.022*react`, plus speaking eruption `0.26 * speechEnv(t)` gated smoothly by smoothstep(0.6, 1.0, react), plus `0.14*flow + 0.10*load`. Voice mode replaces the speaking drive with `0.30 * micLevel`.
- Constant perpendicular stroke width with fixed ~1.5 px screen-space anti-aliasing; ends fade via smoothstep on |x|.
- Color: 1 to 5 Gaussian bands along the line whose centers drift slowly (`sin(t * 0.10..0.17)` per band).

#### Aura (woven strands)
- Always six strands (inactive color slots collapse onto active colors). Each strand: `y = env * amp * (0.72 * sin(x*fr - t*sp + ph) + 0.28 * sin(x*fr*1.6 - t*sp*1.3 + ph*1.7))` plus a drift term `0.6 * amp * sin(t*0.5 + ph*2)`. Frequencies 12.0 to 17.0, speed multipliers 0.92 to 1.30, distinct phases.
- A per-strand depth `z = sin(x*fr*0.6 - t*sp + ph*1.3)` drives draw order, width (0.015 near to 0.052 far, depth-of-field blur), brightness, and coverage weighting, so strands roll over and under each other.
- Packet envelope sigma `0.16 + 0.05 * speech`; amplitude `0.04 + 0.05*react + 0.05*flow + 0.04*load + 0.15*speech`, capped at 0.27 so crests never clip at any expressivity.
- Crossings brighten toward white in light mode and darken in dark mode.

#### Native path for Group B

These shaders must run as fragment shaders on every platform; re-creating them with view animations is not feasible.

| Platform | Runtime | Notes |
| --- | --- | --- |
| iOS | Metal via SwiftUI `Shader` / `colorEffect` / `layerEffect` (iOS 17+), or a plain `MTKView` with a Metal port of the GLSL | Full support. The GLSL is ES 1.0-level (no derivatives, no textures) and ports mechanically to MSL. |
| Android | AGSL `RuntimeShader` (Android 13 / API 33+), or OpenGL ES / `GLSurfaceView` for older APIs | AGSL is SkSL-based; the noise and helpers port directly. Below API 33 use GLES with the shaders nearly verbatim. |
| Flutter | `FragmentShader` (`FragmentProgram`, .frag files compiled by impellerc) | Full support on all Flutter targets including web. Uniform plumbing matches the uniform table in 3.6. |
| React Native | No first-class shader runtime; use `@shopify/react-native-skia` `RuntimeEffect` (SkSL) or `expo-gl`/WebGL | Skia runtime effects are the practical path; the SkSL is essentially the AGSL port. |
| Web | The reference implementation (OGL/WebGL) is already portable React; any WebGL2/WebGPU wrapper works | Copy `visualizations/` wholesale; only `react` and `ogl` are needed. |

Two pieces of the engine live **outside** the shader and must be ported as a per-frame driver loop on every platform: the uniform smoothing table (A8), and the three integrated accumulators (`uTime` from speed, `uFlowSpin` from flow, `uOrbSpin` from flow/react). The integration is essential: computing rotations as `time * weight` instead of integrating causes visible angle jumps when states flip.

---

## 6. Setup and run

No environment variables are used anywhere in the app (verified: no `process.env` references outside defaults, no `.env` files). There is no backend; the agent replies are canned strings in `Phone.tsx`.

```bash
# Install
npm install

# Develop (Next.js dev server, default http://localhost:3000)
npm run dev

# Production build
npm run build

# Serve the production build
npm start
```

Deployment: the repo carries a [vercel.json](../vercel.json) pinning the Next.js framework preset (`buildCommand: next build`, `installCommand: npm install`), so a default Vercel project deploys with zero configuration. Any Node host that can run `next build` + `next start` also works.

Notes for embedding the engine elsewhere:
- Copy the whole `app/components/visualizations/` folder plus `app/components/color.ts` (the folder imports `../color`). Install `ogl`. Nothing else is required; the `"use client"` directive is inert outside Next.js.
- The components have no intrinsic size; give the parent explicit dimensions.

```tsx
import { Orb } from "./components/visualizations";

<div style={{ width: 320, height: 320 }}>
  <Orb colors={[{ h: 252, s: 0.88, v: 1 }]} running state="speaking" dark={false} />
</div>
```

- Microphone capture requires a secure origin (https or localhost); on insecure origins the demo falls back to a simulated voice envelope and logs a console warning.

---

## Resolved decisions (2026-06-11)

These were open questions in the first revision of this document; they are now decided and reflected in the web reference implementation. SDK ports should follow them.

1. **Audio pipeline: the host supplies the level; the engine never measures audio.** The visualization contract takes a normalized 0 to 1 level (`mic.level`). It should be RMS-like, with normal speech peaking near 1, and fed at 15 Hz or more; the engine applies its own smoothing (0.35 per-frame lerp, ~40 ms time constant), so do not pre-smooth aggressively. A Stream call's audio level plugs in directly. The demo's own measurement (Web Audio analyser, RMS of time-domain samples times 4.2, fftSize 1024, smoothing 0.7, in `Phone.tsx`) is a reference implementation each SDK may ship as an optional helper for hosts without a call running; it is not part of the engine.
2. **Expressivity is clamped to 0..2 by the engine.** The shaders are tuned only for that range; the clamp lives in `ShaderCanvas` so the documented contract is true regardless of what the host passes. Ports must clamp identically.
3. **`uOrbit` was dead and has been removed** from `StateParams`, the engine, and the GLSL header. Its job was taken over by the integrated `uOrbSpin` phase. Do not port it.
4. **`deepHue` was dead and has been removed** from the shared GLSL header. Each shader derives its own deep shades inline with per-style tuning. Do not port it.
5. **Error state: not part of the engine.** An `"error"` variant (monochrome stalled treatment) was briefly added and then removed; `AgentState` carries only the five conversational states, and ports should not implement one. Error/disconnected semantics belong to the host UI (label, status dot). If a future revision reinstates it, the `uSat` (`desat`) and `uBright` (alpha) paths already wired into every shader can reproduce the muted treatment without shader changes; color-only alarm signaling (a reserved red) remains rejected for brand-clash and accessibility reasons.

One item remains open:

6. **`uLevel` (UNKNOWN, needs author input).** Like `uOrbit` was, `uLevel` is uploaded and lerped but no shader body currently reads it; per-state amplitude differences flow through `react`/`flow`/`load` and `speed` instead. It was not covered by the decisions above, so it is kept in the contract for now. Decide whether to remove it (same rationale as `uOrbit`) before ports begin.
