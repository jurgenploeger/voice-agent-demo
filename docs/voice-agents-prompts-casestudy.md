# Voice Agents demo: prompt case study

How the [voice-agent demo](https://stream-voice-agent-demo.vercel.app/) was built with Claude Code: the load-bearing briefs, the iteration clusters around them, and a one-shot prompt distilled from everything the build learned.

Companion documents:

- [voice-agents-prompts.md](voice-agents-prompts.md): the raw prompt log, verbatim and chronological.
- [voice-agent-handoff.md](voice-agent-handoff.md): the technical spec the build converged on (parameter API, state model, animation catalog, native runtime paths).

> **Revision note.** This version supersedes the first case study, which covered the build up to the portability audit. The demo iterated well past that point: full-HSV color with a five-swatch picker, four new styles (and one killed), an expressivity control, chat and voice modes, the cross-SDK handoff spec, and the final contract decisions (error state, clamped expressivity, dead uniforms removed). The briefs, clusters, and the one-shot prompt below reflect the demo as it stands on June 12, 2026. (One later reversal: the error state decided on June 11 was removed on June 12; `AgentState` carries only the five conversational states, and the narrative below describes the error-state decision as it happened.)

---

## The shape of the build

About 150 prompts over nine working days, 39 merged PRs, from empty directory to a deployed demo with seven WebGL visualizations and a portable engine.

Two tools, two altitudes. The load-bearing briefs were drafted and pressure-tested in Claude chat first (two of them still carry the pasted planning conversation in the raw log), then executed in Claude Code. Between briefs, iteration ran as short, observational prompts: one to four sentences describing what looked wrong on screen, in plain design language. The briefs set architecture; the one-liners steered taste. Neither worked without the other.

---

## The four load-bearing briefs

### Brief 1: the scaffold (May 29)

> "Build a single-page React demo (Next.js, client component) showcasing a voice-agent UI inside a simulated iPhone frame. [...] Strictly monochrome inside the phone. [...] All three loop autonomously (driven by time, not audio). [...] Distinctive, non-generic typography, avoid Inter/Roboto/Arial."

What it did: established the frame everything else lives in, and two constraints that survived to the end. Visuals are driven by time and state, never by audio plumbing (the mic became an optional input much later, on top of the same contract). And the chrome stays monochrome so the visualization is the only colored thing on screen.

### Brief 2: the shader quality bar (May 29, second pass June 1)

> "The target is Dribbble-tier motion-design polish [...]. Achieve that through the specific techniques below, not generic 'make it nicer.' [...] Motion driven by 3 to 4 layered sine waves at different frequencies and phases. Nothing symmetric or mechanically regular. A slow 'breath' cycle of 3 to 4 seconds modulating scale/intensity beneath any faster motion. No linear easing. Lerp values toward targets at roughly 0.08 to 0.15 per frame. [...] Soft anti-aliased edges via smoothstep. [...] The noise function must be inline GLSL pasted into the fragment shader (use the standard Ashima/Stefan Gustavson snoise snippet). Do NOT import a noise npm package."

The second pass added the single most consequential correction of the build:

> "The current orb is wrong because noise is displacing the outer silhouette, making it a wobbling blob. Fix: the outer shape is a perfect, fixed circle, and all motion happens inside it. [...] warp the sample coordinates with domain-warped simplex noise (noise feeding into noise) before computing blob distance, so the blobs fold into each other like flowing liquid rather than separate dots. This coordinate warping is the 'Siri flow' trick. [...] Watch for two misses when it runs: if the orb edge still wobbles, it ignored the fixed-circle instruction, and if the interior looks like two blurry sliding dots rather than flowing liquid, it skipped the coordinate-warping step."

What it did: every number in the final engine traces back to this brief. The 0.08 per-frame lerp became the universal smoothing constant. The inline-snoise rule is why the engine has zero shader build tooling and ports cleanly to Metal, AGSL, and SkSL. And the "watch for two misses" paragraph is the failure-mode principle in its purest form: both misses happened, and both were caught on the first screenshot because they had names.

### Brief 3: the state model (May 29)

> "Add a second control for the agent's conversational STATE, separate from the Orb/Wave/Pulse style toggle. State and style are independent axes: style is how the visual looks, state is what the agent is doing. They combine, so don't merge them into one control. [...] Drive this from a single `state` value (enum or prop) so it can later be set programmatically by the real agent, not just the manual control. [...] Decide with me: should 'idle/ready' (pre-connect, post-call) and an 'error/disconnected' state be part of this enum now, or out of scope? Flag the tradeoff before adding them."

What it did: style times state as orthogonal axes is the architecture of the whole engine. Every later style (Sphere, Ring, Bars, Aura, Wave, Glow) plugged into the same five driver weights without new wiring. The "decide with me" close is worth stealing: it parked the error state explicitly instead of letting it be invented or forgotten, and the parked decision was picked up and resolved twelve days later with full context.

One follow-up a few hours later turned out to define the system's feel: "The states are also not that different, the animation should be different. Use Livekit as an example." That one sentence is why states crossfade between distinct motion patterns (loader sweep, rigid rotation, reactive amplitude) instead of just changing speed or tint.

### Brief 4: the read-only portability audit (June 2)

> "This is an audit task. Do not change any code. Read the project and report back. I need to know whether the voice visualizations are structured to be extracted as standalone, reusable React components that a Stream SDK customer could drop into their own React app, independent of this Next.js demo. [...] For each of the three: could it be copied into a separate React app with only OGL installed and work? If not, list exactly what's blocking it. Summarize what refactoring would be needed [...]. Don't do the refactor, just list it as a prioritized checklist."

What it did: separated diagnosis from treatment. The audit ran with nothing at stake, so the report was honest; the refactor ran the same morning as a separate prompt ("Make the improvements you suggested") against a clean checklist. The result is the `visualizations/` folder that needs only `react` and `ogl`, which is what made the cross-SDK handoff possible at all.

---

## The fifth brief, added in this revision: the handoff spec (June 11)

> "Read the codebase [...] and produce a knowledge-transfer document at docs/voice-agent-handoff.md. This is a cross-SDK handoff so engineers on iOS, Android, Flutter, React Native, and Web can reimplement these visualizations natively. Accuracy matters more than completeness: when you can't determine something from the code, write 'UNKNOWN, needs author input' rather than guessing. [...] Animation catalog, split into two groups (this split matters): Group A, discrete interaction animations [...] give the real timing from code [...] and the closest native equivalent on iOS (SwiftUI spring), Android (Compose spring/tween), and Flutter (Curves). Group B, continuous shader-driven motion [...] state plainly that these do not map to a tween curve."

What it did: the "UNKNOWN over guessing" rule surfaced five real open questions (dead uniforms, unclamped ranges, an undesigned error state) that were then decided deliberately, in one sitting, before any SDK team could inherit them as accidents. The Group A / Group B split is the document's load-bearing idea: it tells a native engineer which 20 percent of the motion maps to their platform's animation APIs and which 80 percent must be ported as a shader, before they burn a sprint trying to tween the orb.

---

## Iteration clusters

What the short prompts between briefs actually did, grouped by theme. Quotes are verbatim from the raw log.

**1. The orb interior: four corrections to one surface.** "Far too detailed and busy. It looks like marble or turbulent smoke. [...] Like colored fog behind frosted glass, not liquid or marble. [...] Drastically reduce noise frequency. One octave, no fbm, no octave stacking." Then: too neon for light mode, muddy halo, "kill the dark veining." Then the liquid pass (domain warping plus slow advection, "if the interior shows filaments [...] the frequency is too high"). Then physicality: "Make sure the blobs inside the orb bounce against the edges." Each correction named the mechanism, not just the dislike, so each landed in one round.

**2. Speaking that sounds like speaking.** The longest-running cluster: "In the speaking state, make the animation REALLY fast" → "a bit less fast" → "like a normal speaking speed" → "more random, now it loops the same thing" → "there can be pauses as well, like someone is actually speaking" → "it flatlines vs waves." The endpoint is the shared `speechEnv` function (a slow noise-driven phrase gate times a faster syllable wobble) that every style now uses, which is why speaking ebbs and pauses instead of buzzing. Lesson: feel is found by oscillation; the prompt log records overshooting in both directions before converging.

**3. The spin-jump bug, twice.** "When moving between the states of the orb, the gradients inside suddenly start to spin/rotate really quickly" (June 2), and again "When I add messages, the orb style suddenly starts to spin a lot" (June 9). Same root cause both times: rotation computed as elapsed-time times state-weight, which jumps by the whole accumulated angle when the weight flips. The fix (integrate the weighted time step per frame instead) became the engine's `uFlowSpin`/`uOrbSpin` accumulators and a named warning in the handoff spec, so no native port reintroduces it a third time.

**4. The color system: six generations.** Hue slider → harmonic offsets derived from one hue → "Add color" with a max of three → hex inputs → the full-HSV swatch-and-wheel picker (PR #26, so muted and dark brand colors render true instead of being forced vivid) → five colors with harmony-scheme shuffle and the Stream-blue default. The constant across all six: generated palettes are tuned (s 0.88, v 1.0, acidic yellow-green band tamed), user-picked colors are honored exactly.

**5. Growing the style set, including one kill.** Aura went through its own mini-saga (aurora at the top → U-shaped bottom glow → "reversed shape [...] like Google's new neural expressive UI" → finally the woven strands). Bars arrived with a precise behavioral spec ("become more like dots when it's not speaking [...] the gaps between the bars disappear. This shouldn't happen"). Contour got three rounds of correction and then "Remove Contour. It's not working." Killing a style after real investment kept the set's quality bar; the prompt was one sentence.

**6. The delight layer.** "When tapping/clicking the orb, make it bounce so it reacts to the touch, this is adding some delightness to it." Then hover ("the bulges that come out of it should follow my mouse pointer"), drag-to-spin with momentum on the Sphere, and mic-reactive voice mode ("the speaking animation of the voice agent should match the audio waves"). These interaction details are the demo's differentiator over competitor presence layers, and each began as a one-sentence wish.

**7. Closing the contract.** The June 11 session turned the demo into a spec: the handoff doc, then five explicit decisions (host-supplied audio level, expressivity clamped 0 to 2, two dead uniforms deleted rather than ported, and the parked error state resolved as monochrome-stalled, no red, reusing saturation and brightness paths every shader already had). The error state needed zero shader changes because brief 3's architecture had reserved the seams twelve days earlier.

---

## The three principles

The three principles that made the prompts work, worth lifting for any AI-assisted design build:

1. **Specify technique, not vibe.** "Make it beautiful" produces generic output. Naming the mechanism (domain warping, low-frequency noise, harmonic hue offsets) is what moved quality.
2. **Name the likely failure mode in the prompt**, so the wrong output is caught fast.
3. **Audit before refactor.** The SDK portability check was deliberately read-only so the diagnosis was clean before any code changed.

One more, visible only now that the full log exists:

4. **Brief the architecture, converse the taste.** Every structural decision arrived as a long, technique-dense brief; every aesthetic decision arrived as a short observation about the running build, often oscillating before it converged. Trying to do either job with the other tool's prompt style is what failed: vibe-level briefs produced marble, and architecture decided through one-liners produced the spin-jump bug twice.

---

## The one-shot prompt

Everything above compressed into a single prompt that rebuilds the current demo from an empty directory. It is the build's full learning applied in advance: every technique named, every tuned constant carried, every failure mode pre-empted. What it cannot capture is the oscillation that found those constants; treat any deviation from feel as a tuning pass away, not a restart.

````text
Build a voice-agent visualization demo: a Next.js (App Router) single page showing a simulated iPhone (and a resizable desktop window variant) whose centerpiece is one of seven WebGL fragment-shader visualizations of a voice agent. TypeScript, React, `ogl` for WebGL, Geist font (the `geist` npm package), Phosphor icons. No other runtime dependencies, no env vars, no backend.

ARCHITECTURE (this split is the product)
Two layers. (1) A portable engine in `app/components/visualizations/`: seven thin wrapper components around one shared `ShaderCanvas`, each injecting a different fragment shader string. The engine may import only React, `ogl`, and a sibling `color.ts`. No Next.js APIs, no global CSS, no fonts, no shader file loaders: every shader is an inline template string, including the Ashima/Stefan Gustavson simplex noise pasted verbatim. (2) The demo shell: phone frame, controls, chat, voice mode. The shell may depend on the engine, never the reverse.

ShaderCanvas: one OGL Renderer per mounted visualization (alpha: true, premultipliedAlpha: true, antialias, devicePixelRatio capped at 2), a single fullscreen triangle, fragment shaders output PREMULTIPLIED alpha so halos tint the background instead of sitting on it like a sticker. requestAnimationFrame runs only while a `running` prop is true; pausing holds the last frame. ResizeObserver re-renders one still frame on resize. If WebGL context creation fails, render a `fallback` node. On unmount, release the context via WEBGL_lose_context. Respect prefers-reduced-motion by multiplying the time step by 0.07 (barely alive, not frozen).

PROPS (identical for all seven components; components have NO intrinsic size and fill their parent)
colors: Color[] where Color is full HSV {h: 0-360, s: 0-1, v: 0-1}, 1 to 5 entries. running: boolean. state: "idle" | "connecting" | "listening" | "thinking" | "speaking". dark: boolean. expressivity?: number, default 1, CLAMPED by the engine to 0..2. tap?: {x, y, id} (id increments per tap). hover?, mic?, drag?: mutable refs read per frame ({x, y, active}, {level 0..1, active}, {dx, dy, active}) so pointer and audio never re-render React. className, style, fallback. Size is deliberately NOT a prop: it is the host container's layout. Pointer coordinates are in shader space: origin at canvas center, normalized to the SHORTER edge, y up.

PER-FRAME DRIVER LOOP (in JS, not the shader)
All smoothing is exponential: current += (target - current) * k per frame. k = 0.08 for the state drivers and expressivity, 0.12 for colors (hue takes the shortest path around the wheel) and hover presence, 0.10 for voice-mode presence, 0.35 for mic level. Clamp frame delta to 50 ms. Three accumulators are INTEGRATED per frame, never computed as elapsed-time times weight: t += dt * speed (speed is the lerped state speed); flowTime += tStep * flow; orbSpin += tStep * (1.0 + 0.5 * flow + 0.1 * react). Failure mode if you skip the integration: switching states multiplies the whole accumulated time by the new weight and the visual visibly snaps or spins wildly. Upload colors as uCol0..uCol4 (HSV) plus a lerped uCount so palette edits crossfade.

STATE MODEL
States differ purely by ANIMATION, never by tint: bright and sat stay 1.0 for the five conversational states. Exactly one motion-pattern weight is ~1 per state; lerping the weights crossfades the patterns. Use these exact rows {level, speed, bright, sat, load, flow, react}:
idle {0.2, 0.4, 1, 1, 0, 0, 0.12} calm shimmer; connecting {0.6, 1.0, 1, 1, 1, 0, 0} loader sweep plus an opacity breath; listening {0.6, 0.9, 1, 1, 0, 0, 0.45} gentle expand-contract; thinking {0.6, 1.25, 1, 1, 0, 1, 0} slow rigid rotation or traveling wave, busy via motion not via a dull tint; speaking {1.25, 1.25, 1, 1, 0, 0, 1}.
Shared GLSL speechEnv(t): a slow phrase gate smoothstep(-0.25, 0.35, snoise(t*0.6)) times a syllable wobble 0.55 + 0.45*snoise(t*3.0). Every style computes speech = react * mix(steady breath 0.55 + 0.25*sin(t*1.6), speechEnv(t), smoothstep(0.6, 1.0, react)) so SPEAKING ebbs and pauses like real talking while LISTENING reads as a steady attentive breath. Failure mode: a looping or constant-drone speaking state; if speaking never pauses, speechEnv is missing.

EXPRESSIVITY
Scales motion only, never presence or color: amplitude scale 0.15 + 0.85*ex on the level/load/flow/react drivers, speed scale 0.6 + 0.4*ex on speed. Both keep a floor so 0 still breathes. Also upload raw uExpressivity: the Sphere lowers its fold frequency with it (fexp = 1.15 - 0.15*ex) so high expressivity reads as fewer, BIGGER bulges rather than many tiny ones, and the Orb lifts its internal drift speed by 0.8 + 0.2*ex.

COLOR
Full HSV end to end so muted, pastel, and dark brand colors render true; hex is only picker I/O. Default Stream blue #005FFF. In-shader: vivid(hsv) renders the pick as-is with +0.06 saturation in dark mode. With 1 or 2 colors, each shader derives light (value x ~1.2-1.3) and deep (value x ~0.74-0.94, lighter in light mode so no dark mass crosses white) shades of color 0 so a mono setup still flows; slots crossfade to real colors as uCount passes 2 and 3, and colors 4/5 ride extra gated noise fields so 1-to-3-color setups are pixel-identical with or without them. Generated palettes (shuffle, add-color, presets) use s 0.88 v 1.0 with the acidic yellow-green band (~45-185 deg) tamed toward s 0.68 v 0.92; shuffle picks a random base hue plus a classic harmony scheme by count (analogous, complementary, split-complementary, triadic, tetradic, pentadic) with +-8 deg jitter. User-picked colors are never altered.

THE SEVEN STYLES (one fragment shader each; shared header with the uniforms, hsv2rgb, desat, saturate3, snoise, speechEnv, coords())
1. Glow (default): soft airy globe, radius 0.24 with a size pulse of +20% on a LOW-PASSED speech signal (blend half the phrase rhythm back in so it breathes with phrases instead of juddering per syllable). Interior: domain-warped noise (freq 0.7, amp 0.20 + 0.28*energy) plus a concentric tangential ripple sin(r*5 - t*2) faded at the center; two to four color masses orbiting on integrated orbSpin at factors +0.42/-0.34/+0.30/-0.26. Airy wave-driven body alpha so background shows through; soft diffuse shading, no specular hotspot.
2. Orb: FLAT disc of flowing liquid color, Siri-style. The silhouette is a perfect fixed circle (radius 0.24, +14% with speech); ALL motion is interior. Two-stage domain warp (simplex at spatial freq 0.65 amp 0.36 + 0.24*energy, second gentle warp freq 0.85 amp 0.14), color blended by 3 to 5 overlapping low-frequency noise fields with wide smoothsteps, one broad white sheen sweep. Thinking rotates the warped field rigidly by flowTime * 0.30; only thinking rotates. Failure modes, in order of likelihood: silhouette wobble (noise displacing the edge), and marble (noise frequency too high; if you see filaments or veins, halve the frequency, one octave, no fbm).
3. Sphere: glossy 3D liquid globe, radius 0.245, constant spin rot = t*0.5 plus the drag offset. Meridian fold waves sin(x*7*fexp - rot) and sin(x*13*fexp - rot*1.8) drive an analytic normal perturbation (strength 0.060 + 0.105*energy); the same folds sampled at the rim, weighted cos^2(angle) so only left/right edges bulge, and while speaking rectified crests swell outward over the silhouette. Blinn specular power 46 for silky streaks, sheen power 9, fresnel 2.6. Color: large drifting noise masses sweeping with the spin.
4. Ring: thin circle radius 0.205 with 72 radial bar cells (bar fills 34% of its cell). Per-bar amplitude = three rotating periodic von Mises group envelopes exp(3.2*(cos(angle - t*0.55) - 1)) times per-bar noise, power 1.25, so energy concentrates in drifting CLUSTERS of tall bars with low gaps between, never one smooth wave. Connecting pulses all bars together; palette blends up to 5 hues at evenly spaced angles with seam-free periodic weights, set rotating at t*0.16.
5. Bars: classic linear EQ, 8 capsules, total span 0.60, capsule radius 0.030 CONSTANT so short bars read as dots and the gaps never close (failure mode: scaling the row so gaps merge during transitions). Tall bars ONLY while speaking (gate smoothstep(0.45, 0.85, react) times speechEnv); idle is a faint dot breath; thinking a traveling wave sin(u*6 - t*3); connecting a gaussian bump sweeping at fract(t*0.4). One smooth gradient flows through the row (sample mixes bar position, pixel height, and slow sine drift).
6. Aura: six woven glowing strands, two per color slot (inactive slots collapse onto active colors so lines recolor, never vanish). Strand y = packet envelope times amp times (0.72*sin(x*fr - t*sp + ph) + 0.28*sin(x*fr*1.6 - t*sp*1.3 + ph*1.7)), frequencies 12 to 17, speeds 0.92 to 1.30, distinct phases. A per-strand depth z = sin(x*fr*0.6 - t*sp) drives draw order, width (0.015 near to 0.052 far: depth-of-field), and brightness so strands roll over and under. amp = 0.04 + 0.05*react + 0.05*flow + 0.04*load + 0.15*speech, CAPPED at 0.27 so crests never clip the canvas at max expressivity.
7. Wave: a single traveling waveform line under a gaussian packet (sigma 0.18), phase x*freq - t*5 with freq = 24 + 26*react + 10*flow so crests pack closer while speaking. Flat-lines in silence, erupts smoothly with speechEnv (no hard gate). Connecting sweeps the packet side to side. Crisp constant-perpendicular-width stroke with fixed ~1.5px screen-space anti-aliasing; NO glow (failure mode: the soft edge magnifying on steep slopes and reading as blur). Ends fade out left and right.

INTERACTIONS (the delight layer; every style)
Tap: forwarded into the shader as uTap/uTapTime; a concentric ripple sin(d*34 - age*24) under a gaussian shell expanding at 0.75 units/s, decaying exp(-2.6*age), gone by 1.5 s. Plus a springy bounce of the visual stack via Web Animations API keyframes on scale: 1.00, 0.93 at 30%, 1.03 at 62%, 1.00, 340 ms ease-out. Hit-test the tap to the visible visual's region, not the whole screen. Hover (mouse only; never touch, or the ripple sticks on): position in a ref, presence eased at 0.12/frame, continuous ripple sin(d*30 - t*7) in a gaussian envelope sigma 0.22; the Sphere amplifies it 2.4x into its normal map and bulges toward the cursor's angle. Drag-to-spin, Sphere only: pointer deltas times 6.0 add to the spin while dragging with a smoothed velocity estimate (0.3/frame); on release the velocity integrates and decays 0.94/frame for a flick-with-momentum glide. Voice mode: mic level (RMS of time-domain samples x 4.2, analyser fftSize 1024, falling back to a synthetic phrase/syllable envelope on insecure origins) overrides reactivity so every style speaks in sync with real audio.

DEMO SHELL
Phone: white rounded-corner frame, no notch, monochrome chrome (the visualization is the only color on screen), header with agent name plus a status line (ready/connecting/listening/thinking/speaking) and a 5px dot breathing scale 0.85-1.15 at per-state tempo (3.8s/1.3s/2.6s/1.6s/0.85s), composer at the bottom ("Send a message", mic button swaps to send-arrow when text exists). Desktop: collapsible left side panel with controls and live per-style thumbnails, theme toggle top right, phone/desktop device toggle (the desktop variant is a user-resizable window); morphs transition at 0.5s cubic-bezier(0.4, 0, 0.2, 1). Mobile: app fills the viewport; settings as an iOS-style bottom sheet driven by real scroll with two snap stops, app scaling and dimming behind it. Controls: Style grid, State segmented control (sliding thumb 0.36s cubic-bezier(0.22, 1, 0.36, 1)), Expressivity slider 0-2, Size slider 0.7-1.3 (sets a CSS variable scaling the visual's container: a real layout resize so the shader re-renders crisply, not a transform), up to five color swatches each opening a picker (hue wheel, SV square, hex input, ten preset hues plus black and white), Shuffle, and a reset button visible only when something differs from defaults. Chat mode: sending a message docks the visual to a small top presence (transform 0.32s cubic-bezier(0.4, 0, 0.2, 1), scale 0.4), agent replies type in character by character (16-38 ms/char) after a randomized 650-2000 ms "Thinking..." shimmer, states driven thinking → speaking → idle; messages scroll under frosted gradient bands. Voice mode: composer becomes a live scrolling voice-memo waveform (fixed 6px bar pitch, ~22 samples/s, silence flat). Light and dark themes follow the OS with a manual override; theme crossfades at 0.2s except messages and screen background, which snap so nothing lags. Honor prefers-reduced-motion throughout.

VERIFY before finishing: run the dev server; click through all seven styles times all six states; confirm speaking pauses naturally, thinking rotates without snapping when you flip states mid-spin, connecting breathes opacity, error desaturates and stalls; tap, hover, and drag the Sphere; check one mono-color and one five-color palette in both themes; confirm zero console errors and a clean WebGL fallback message when the context is blocked.
````

### Why this prompt looks the way it does

It is the three principles applied at maximum density. Every style carries its mechanism and its named failure mode inline, because those are the two things that made the original iteration loops converge in one round instead of five. The exact constants (state rows, lerp factors, frequencies, the 0.27 aura cap) are the residue of roughly 150 prompts of taste-finding; carrying them forward is what makes "one shot" plausible. And the verification block exists because the original build caught most regressions by looking at the running app, not the diff. A one-shot output will still land within tuning distance rather than exactly on target: expect to spend a handful of follow-up prompts on feel, and treat that as the design work it is.
