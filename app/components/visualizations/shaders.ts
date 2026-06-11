// Shared GLSL building blocks + one fragment shader per visualization.
// All shaders are time-driven (uTime) and colour-driven (uCol0..4, full HSV
// so brand colours — including muted/dark tones — render true), and output
// PREMULTIPLIED alpha so the colored halo bleeds into the white phone screen
// instead of sitting on top of it like a sticker.

export const VERTEX = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// Common header: uniforms + HSV->RGB (so the slider only moves hue while
// saturation/lightness stay tuned and never go muddy or blown-out).
const HEADER = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3  uCol0;       // colour 1 as HSV: (hue 0-1, sat 0-1, val 0-1)
uniform vec2  uResolution; // drawing-buffer pixels
// Conversational-state drivers (lerped on the JS side). See states.ts.
uniform float uLevel;      // motion amplitude / energy
uniform float uBright;     // overall opacity / presence
uniform float uSat;        // color saturation
// Motion-pattern weights (one ~1 per state):
uniform float uLoad;       // bouncing loader sweep  -> connecting
uniform float uFlow;       // traveling / spinner    -> thinking
uniform float uFlowSpin;   // flow-gated spin TIME, integrated on the JS side so it
                           // only advances while thinking; use this (not t*uFlow)
                           // for thinking rotation so ramping flow eases the spin
                           // in instead of jumping by the whole elapsed time
uniform float uOrbSpin;    // integrated orbit phase for the Glow's colour masses
                           // (base rate, lifted while active) — use this instead of
                           // t*orbS so a state change never jumps the orbit angle
uniform float uReact;      // reactive amplitude     -> listening / speaking
uniform float uExpressivity; // overall liveliness 0..2 (1 = default); Sphere scales
                           // its ripple COUNT with it (amplitude is already scaled
                           // into the state drivers on the JS side)
uniform float uDark;       // 1 = dark theme, 0 = light (halo tuning)
uniform vec3  uCol1;       // colour 2 as HSV; uCol0 (above) is colour 1
uniform vec3  uCol2;       // colour 3 as HSV
uniform vec3  uCol3;       // colour 4 as HSV
uniform vec3  uCol4;       // colour 5 as HSV
uniform float uCount;      // active colours, lerped 1 .. 5
uniform vec2  uTap;        // last tap/click position, in coords() space
uniform float uTapTime;    // seconds since that tap (large when idle => no ripple)
uniform vec2  uHover;      // live cursor position while hovering, in coords() space
uniform float uHoverAmt;   // hover presence 0..1 (smoothed; 0 when not hovering)
uniform float uMic;        // live microphone level 0..1 (voice/recording mode)
uniform float uVoice;      // voice-mode presence 0..1 (smoothed; 0 when not recording)
uniform vec2  uDrag;       // drag/swipe spin offset (.x = horizontal, .y = vertical),
                           // integrated from the pointer with momentum; the Sphere
                           // adds it to its globe spin so a swipe spins it that way
varying vec2  vUv;

#define PI 3.141592653589793
#define TAU 6.283185307179586

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Desaturate toward luminance (drives the monochrome "error" treatment; the
// conversational states keep uSat pinned at 1.0).
vec3 desat(vec3 c, float s) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(l), c, s);
}

// Push saturation away from luminance (s > 1 = more saturated), clamped.
vec3 saturate3(vec3 c, float s) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return clamp(mix(vec3(l), c, s), 0.0, 1.0);
}

vec2 rot2(vec2 p, float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c) * p;
}

// One-sided triangle ping-pong: folds x (>=0) into [0, b], reflecting at b —
// used to make blob centres bounce back when they reach the orb's edge.
float pingpong(float x, float b) {
  float m = mod(x, 2.0 * b);
  return b - abs(m - b);
}

// The user's chosen colour, honoured as-is (full HSV — hue, saturation AND
// value), so brand colours including muted/pastel/dark tones render true. Dark
// mode nudges saturation up a touch so colours stay vivid over the dark
// backdrop. The old white-background hue taming now lives at palette-generation
// time (see color.ts vividColor) so explicit picks aren't altered here.
vec3 vivid(vec3 hsv) {
  return hsv2rgb(vec3(hsv.x, clamp(hsv.y + uDark * 0.06, 0.0, 1.0), hsv.z));
}

// Tap/click ripple shared by every style: concentric waves spreading out from
// uTap so a tap visibly disturbs the visual where the user touched it. Returns a
// signed displacement ~[-1,1] near the expanding wavefront; ~0 once it has faded
// (uTapTime large). Distances are in coords() space.
float tapRipple(vec2 p) {
  float age = uTapTime;
  if (age > 1.5) return 0.0;
  float d = distance(p, uTap);
  float front = age * 0.75;                       // wavefront expands outward
  float env = exp(-pow((d - front) / 0.14, 2.0)); // gaussian shell at the front
  float decay = exp(-age * 2.6);                  // whole ripple fades in ~1s
  return sin(d * 34.0 - age * 24.0) * env * decay;
}

// Continuous, gentle ripple that follows the hovering cursor (uHover), scaled by
// uHoverAmt. Persistent (driven by uTime) so the visual keeps reacting to the
// cursor while it hovers, fading out when it leaves.
float hoverRipple(vec2 p) {
  if (uHoverAmt <= 0.001) return 0.0;
  float d = distance(p, uHover);
  float env = exp(-pow(d / 0.22, 2.0));           // a bit wider so ripples reach out
  return sin(d * 30.0 - uTime * 7.0) * env * uHoverAmt * 0.6;
}

// Combined pointer disturbance: tap ripple + hover ripple. Styles call this so a
// tap AND a hover both ripple the visual from the pointer position.
float poke(vec2 p) {
  return tapRipple(p) + hoverRipple(p);
}
`;

// Ashima / Stefan Gustavson simplex noise (snoise) — pasted inline as required.
const SNOISE = /* glsl */ `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){
  const vec2  C = vec2(1.0/6.0, 1.0/3.0);
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// Speech-activity envelope (0..1) shared by every visualization so "speaking"
// ebbs and PAUSES like real talking, instead of a constant drone. A slow phrase
// gate (~0 during pauses, 1 during phrases) times a faster syllable wobble.
float speechEnv(float t) {
  float gate = smoothstep(-0.25, 0.35, snoise(vec3(t * 0.6, 21.0, 0.0)));
  float syl  = 0.55 + 0.45 * snoise(vec3(t * 3.0, 5.0, 0.0));
  return clamp(gate * syl, 0.0, 1.0);
}
`;

// Centered, square-unit coordinates normalized to the SMALLER dimension
// (phone width), so shapes stay inside the screen width on a tall canvas.
const COORDS = /* glsl */ `
vec2 coords() {
  float m = min(uResolution.x, uResolution.y);
  return (gl_FragCoord.xy - 0.5 * uResolution.xy) / m;
}
`;

/* ------------------------------------------------------------------ */
/* ORB — a FLAT disc filled with a flowing liquid colour gradient. No   */
/* 3D shading, specular or rim glow: big soft colour masses domain-warp */
/* and drift inside the circle (mesh-gradient / shaders.com look).      */
/* ------------------------------------------------------------------ */
export const ORB_FRAGMENT = HEADER + SNOISE + COORDS + /* glsl */ `
void main() {
  vec2 q = coords();
  float t = uTime;
  float r = length(q);
  // Speaking uses the irregular talk envelope (phrases + pauses); listening uses a
  // steady, gentle breath instead — so it reads as attentive, not like quiet talking.
  float speak = smoothstep(0.6, 1.0, uReact);
  float speech = uReact * mix(0.55 + 0.25 * sin(t * 1.6), speechEnv(t), speak);
  speech = mix(speech, uMic, uVoice);   // voice mode: react to the real mic level

  // Flat disc that scales in/out with the speaking rate (speech). Slightly soft
  // edge (not a hard cut) + a faint halo so the circle melts into the background.
  float R = 0.24 * (1.0 + 0.14 * speech);
  float aa = 1.6 / min(uResolution.x, uResolution.y);
  float circle = 1.0 - smoothstep(R - aa, R + 0.005 + aa, r);

  vec2 p = q / R;                          // unit-disc coordinates

  // --- FLOWING LIQUID GRADIENT (flat). Domain-warp the coords with slow, low-
  // frequency noise so big colour masses fold and drift inside the disc, then
  // blend the palette by smooth overlapping noise fields (soft organic blobs, not
  // bands). uTime carries the per-state speed; speech only adds AMPLITUDE so the
  // flow surges while talking rather than spinning up. ---
  // Per-state energy so each state reads as a distinct animation: idle drifts
  // calmly, listening gently lifts, thinking slowly rotates (uFlow), connecting
  // pulses (uLoad), speaking surges (speech).
  float energy = 0.10 + 0.28 * uReact + 0.18 * uFlow + 0.22 * uLoad + 0.42 * speech;
  // Expressivity gives the liquid an extra speed lift on top of the global state
  // speed: 0.8x drift at min, 1x at the default, 1.2x at max (so cranking it up
  // makes the colour masses fold and flow noticeably faster).
  float ct = (t * 0.13 + uFlowSpin * 0.05) * (0.8 + 0.2 * uExpressivity);  // thinking flows just a touch faster
  float amp = 0.36 + 0.24 * energy;        // gentle turbulence; keeps the masses sleek
  vec2 w1 = vec2(snoise(vec3(p * 0.65, ct)),
                 snoise(vec3(p * 0.65 + 11.0, ct)));
  vec2 sp = p + amp * w1;
  // A GENTLE second warp only — low frequency + small amplitude keeps the masses
  // big and sleek (just a couple of smooth folds, not fine detail).
  vec2 w2 = vec2(snoise(vec3(sp * 0.85 + 3.0, ct * 0.8)),
                 snoise(vec3(sp * 0.85 + 21.0, ct * 0.8)));
  sp += 0.14 * w2;
  // Thinking: a SLOW, RIGID rotation of the liquid field — the colour masses
  // gently orbit as one (a calm "processing" loop), not a radius-dependent shear
  // that winds into a tight spiral. ONLY thinking rotates; listening and speaking
  // flow via their breathing/surge instead, so they never spin. uFlowSpin is the
  // integrated flow-gated angle, so entering/leaving thinking eases the rotation
  // rather than snapping by the whole elapsed time.
  sp = rot2(sp, uFlowSpin * 0.30);

  // Pointer ripple (tap + hover): shove the liquid colour field radially out from
  // the pointer so the gradient ripples around the cursor/tap.
  vec2 rtoP = q - (uHoverAmt > 0.001 ? uHover : uTap);
  sp += (rtoP / (length(rtoP) + 1e-4)) * poke(q) * 0.5;

  // Palette. A single colour falls back to a brighter + a deeper SHADE of itself
  // (so a mono orb still has a flowing gradient), crossfading to the real colours
  // 2/3 as they activate.
  float g1 = clamp(uCount - 1.0, 0.0, 1.0);
  float g2 = clamp(uCount - 2.0, 0.0, 1.0);
  float g3 = clamp(uCount - 3.0, 0.0, 1.0);
  float g4 = clamp(uCount - 4.0, 0.0, 1.0);
  vec3 cA = vivid(uCol0);
  vec3 kL = clamp(vivid(uCol0) * 1.30, 0.0, 1.0);
  // Deep shade for the single-colour gradient. Dark mode keeps it genuinely deep
  // (it pops against the dark screen); light mode lifts it a lot so the gradient
  // circulates light<->base instead of dragging a near-black mass across white.
  vec3 kD = vivid(uCol0) * mix(0.92, 0.74, uDark);
  vec3 cB = mix(kL, vivid(uCol1), g1);
  vec3 cC = mix(kD, vivid(uCol2), g2);
  vec3 cD = vivid(uCol3);                  // colours 4/5: only mixed in when active
  vec3 cE = vivid(uCol4);

  // Smooth, overlapping colour fields -> soft blends. Colours 4/5 ride on two
  // extra fields, gated by g3/g4 so a 1-3 colour orb is left exactly as it was.
  float f0 = snoise(vec3(sp * 0.5 + 1.0, ct));
  float f1 = snoise(vec3(sp * 0.5 + 8.0, ct * 0.9 + 4.0));
  float f2 = snoise(vec3(sp * 0.5 + 15.0, ct * 1.1 + 9.0));
  float f3 = snoise(vec3(sp * 0.5 + 22.0, ct * 0.8 + 16.0));
  vec3 col = cA;
  col = mix(col, cB, smoothstep(-0.4, 0.7, f0));
  col = mix(col, cC, smoothstep(-0.3, 0.8, f1));
  col = mix(col, cD, smoothstep(-0.2, 0.8, f2) * g3);
  col = mix(col, cE, smoothstep(-0.2, 0.8, f3) * g4);

  // A single broad, soft sheen sweep (not busy ribbons) — keeps it sleek.
  float sheen = smoothstep(0.55, 0.95, snoise(vec3(sp * 0.55 + 30.0, ct)));
  col = mix(col, vec3(1.0), 0.32 * sheen);

  col = saturate3(col, 1.12);
  col = desat(col, uSat);                  // thinking desaturates
  // Light mode: only the faintest deepen — keep the colour vivid on white so it
  // reads as close to the (well-liked) dark-mode pop as the white backdrop allows.
  col *= mix(0.97, 1.0, uDark);

  // Composite: flat opaque disc, plus a faint soft halo at the rim. Connecting
  // breathes the opacity ("not ready yet").
  float fade = mix(1.0, 0.5 + 0.4 * sin(t * 2.0), uLoad);
  float halo = exp(-pow(max(r - R, 0.0) / 0.06, 2.0)) * (1.0 - circle);
  vec3 haloCol = mix(mix(cA, vec3(1.0), 0.5), cA, uDark);
  float haloA = halo * (mix(0.05, 0.10, uDark) + 0.05 * uReact);
  // Breathing room: let the app background show through the interior a touch (more
  // in light mode, where a fully solid disc read heavy) while the rim stays the
  // most opaque so the silhouette is still crisp. r/R is 0 at centre, 1 at the rim.
  float coreAiry = mix(0.80, 0.94, uDark);
  // A mono orb has no 2nd/3rd colour to fill it. In the CALM states open the
  // interior up and let it gently breathe (more of the app shows through). While
  // SPEAKING, firm it back toward solid so the busy talk-flow doesn't show
  // through the transparency and read as glitchy. mono = 1 for a single colour.
  float mono = 1.0 - g1;
  float breathe = 0.5 + 0.5 * sin(t * 0.9);
  float monoCore = mix(mix(0.50, 0.72, uDark) - 0.06 * breathe,
                       mix(0.80, 0.93, uDark), speak);
  coreAiry = mix(coreAiry, monoCore, mono);
  float bodyA = circle * mix(coreAiry, 1.0, smoothstep(0.0, R, r));
  vec3 pm = col * bodyA + haloCol * haloA * (1.0 - bodyA);
  float a = bodyA + haloA * (1.0 - bodyA);
  float g = uBright * fade;
  gl_FragColor = vec4(pm * g, a * g);
}
`;

/* ------------------------------------------------------------------ */
/* GLOW — a soft, blurred GLOBE: like the Orb but with soft, round edges    */
/* (no hard circle line). Solid through the core with a gentle round         */
/* falloff, soft 3D volume shading, and drifting interior colour. No         */
/* specular hotspot. Pulses noticeably while speaking.                       */
/* ------------------------------------------------------------------ */
export const GLOW_FRAGMENT = HEADER + SNOISE + COORDS + /* glsl */ `
void main() {
  vec2 q = coords();
  float t = uTime;
  float r = length(q);

  // Speaking uses the irregular talk envelope (phrases + pauses); listening uses a
  // steady, gentle breath instead — so it reads as attentive, not like quiet talking.
  float speak = smoothstep(0.6, 1.0, uReact);
  float speech = uReact * mix(0.55 + 0.25 * sin(t * 1.6), speechEnv(t), speak);
  speech = mix(speech, uMic, uVoice);   // voice mode: react to the real mic level
  // A calmer, low-passed copy of the speech signal for the SIZE pulse: blend in the
  // slow phrase rhythm so the glow breathes with speech rather than juddering on every
  // syllable. Keeps reactivity but takes the "hectic" edge off the dominant motion.
  float speechSmooth = mix(speech, uReact * (0.55 + 0.25 * sin(t * 1.6)), 0.5 * speak);
  // Per-state motion energy so each state reads as a DISTINCT animation: idle
  // barely moves, listening lifts, thinking churns (uFlow), connecting pulses
  // (uLoad), speaking surges (speech). Drives the warp / swirl / orbit below.
  // Interior turbulence energy. Speech contributes only a LITTLE here (was 0.50) so
  // the interior stays calm + fluid while talking — the speaking motion is carried
  // by the smooth size pulse below, not by jittery interior churn (which glitched).
  float energy = 0.12 + 0.30 * uReact + 0.18 * uFlow + 0.28 * uLoad + 0.06 * speechSmooth;
  // Size: the glow scales in/out with the speaking rate (speechSmooth) — the primary
  // speaking motion — plus a slow connecting breath and a gentle listening wobble.
  // Idle/thinking hold a steady size (their motion is the interior swirl).
  float R = 0.24 * (1.0 + speechSmooth * 0.20 + uLoad * 0.05 * sin(t * 2.0) + uReact * 0.04 * sin(t * 1.6));
  float p = r / R;                           // normalized radius (0 centre, 1 rim)

  // Soft globe body: solid through the core, then a soft round falloff to 0.
  float core = exp(-2.0 * p * p);
  float body = smoothstep(1.06, 0.62, p);

  // Drifting interior colour, displaced by concentric ripples so the shapes
  // read as moving WAVES inside the glow (livelier while speaking).
  vec2 P = q / R;
  float pl = length(P);
  float nt = t * 0.15 + uFlowSpin * 0.05;     // a livelier base drift (thinking adds more)
  float nAmp = 0.20 + 0.28 * energy;          // stronger domain-warp => more flowing, airy masses
  vec2 sp = P + nAmp * vec2(snoise(vec3(P * 0.7, nt)),
                            snoise(vec3(P * 0.7 + 4.7, nt)));
  // Concentric ripple displaced tangentially — but faded out near the centre,
  // where the angle is undefined and the displacement would otherwise spin and
  // glitch (most visible when the amplitude rises on speech pulses).
  float ang = atan(P.y, P.x);
  float wave = (0.018 + 0.025 * energy) * sin(pl * 5.0 - t * 2.0) * smoothstep(0.0, 0.4, pl);
  sp += wave * vec2(-sin(ang), cos(ang));
  // Thinking: a SLOW, RIGID rotation of the interior — the colour masses gently
  // orbit as one (a calm "processing" loop), not a radius-dependent shear that
  // winds into a tight spiral over time. ONLY thinking rotates (uFlow); listening
  // and speaking move via their breathing/waves instead, so they never spin.
  // uFlowSpin is the integrated flow-gated angle so the rotation eases in/out with
  // the state instead of snapping by the whole elapsed time.
  sp = rot2(sp, uFlowSpin * 0.30);
  // Pointer ripple (tap + hover): shove the colour field radially out from the
  // pointer position.
  vec2 gtoP = q - (uHoverAmt > 0.001 ? uHover : uTap);
  sp += (gtoP / (length(gtoP) + 1e-4)) * poke(q) * 0.5;
  float bt = t;
  // Orbit angle from the integrated phase uOrbSpin (base rate + an "active" lift,
  // accumulated on the JS side) so the masses circle a touch faster when active
  // WITHOUT the angle jumping by the whole elapsed time when a message flips the
  // state. The small snoise terms are continuous wobbles, so they stay on bt.
  float a0 =  uOrbSpin * 0.42 + 2.0 * snoise(vec3(bt * 0.12, 0.0, 0.0));
  float a1 = -uOrbSpin * 0.34 + 2.0 * snoise(vec3(bt * 0.10, 5.0, 0.0)) + 2.0;
  // Two more orbiting masses for colours 4/5 — only contribute once active (g3/g4).
  float a2 =  uOrbSpin * 0.30 + 2.0 * snoise(vec3(bt * 0.11, 9.0, 0.0)) + 1.0;
  float a3 = -uOrbSpin * 0.26 + 2.0 * snoise(vec3(bt * 0.09, 14.0, 0.0)) + 3.5;
  vec2 c0 = 0.40 * vec2(cos(a0), sin(a0));
  vec2 c1 = 0.38 * vec2(cos(a1), sin(a1));
  vec2 c2c = 0.36 * vec2(cos(a2), sin(a2));
  vec2 c3c = 0.34 * vec2(cos(a3), sin(a3));
  float b0 = smoothstep(1.15, 0.1, length(sp - c0));
  float b1 = smoothstep(1.30, 0.1, length(sp - c1));
  float b2 = smoothstep(1.20, 0.1, length(sp - c2c));
  float b3 = smoothstep(1.25, 0.1, length(sp - c3c));

  vec3 k0   = saturate3(vivid(uCol0), 1.7);
  vec3 kL   = saturate3(clamp(vivid(uCol0) * 1.18, 0.0, 1.0), 1.3);
  // "Deep" shade kept only mildly darker (was 0.62) so the 1-/2-colour fallback
  // mass doesn't drag the glow dark.
  vec3 kD   = saturate3(vivid(uCol0) * 0.85, 1.3);
  vec3 colB = mix(kL, saturate3(vivid(uCol1), 1.7), clamp(uCount - 1.0, 0.0, 1.0));
  vec3 colC = mix(kD, saturate3(vivid(uCol2), 1.7), clamp(uCount - 2.0, 0.0, 1.0));
  vec3 colD = saturate3(vivid(uCol3), 1.7);
  vec3 colE = saturate3(vivid(uCol4), 1.7);
  vec3 base = saturate3(mix(vivid(uCol0), vec3(1.0), 0.06), 1.3);
  vec3 col = base;
  col = mix(col, k0,   b0);
  col = mix(col, colB, b1);
  col = mix(col, colC, b0 * 0.5);
  // Colours 4/5 fold in on their own masses, gated so 1-3 colours are unchanged.
  col = mix(col, colD, b2 * clamp(uCount - 3.0, 0.0, 1.0));
  col = mix(col, colE, b3 * clamp(uCount - 4.0, 0.0, 1.0));
  // Mixing different hues averages toward a muddy, darker midpoint; push the
  // saturation + value back up so multi-colour glows stay bright and vivid.
  col = saturate3(col, 1.15);
  col = clamp(col * 1.12, 0.0, 1.0);
  col = desat(col, uSat);

  // Soft 3D globe shading (lit upper-left), gentle so the edge stays soft.
  // No specular hotspot — there's no bright light-source blip.
  float z = sqrt(max(1.0 - p * p, 0.0));
  vec3 nrm = normalize(vec3(q / R, z + 1e-4));
  vec3 Ld = normalize(vec3(-0.35, 0.45, 0.85));
  float diff = clamp(dot(nrm, Ld), 0.0, 1.0);
  col *= 0.80 + 0.20 * diff; // higher floor so shading doesn't darken the colours
  float fres = pow(1.0 - clamp(nrm.z, 0.0, 1.0), 2.5);
  col += fres * 0.10 * mix(vec3(1.0), k0, 0.6); // faint, soft rim tint

  // Composite: soft globe over a soft halo (premultiplied).
  vec3 haloCol = mix(mix(vivid(uCol0), vec3(1.0), 0.75),
                     mix(vivid(uCol0), vec3(1.0), 0.32), uDark);
  float halo = exp(-pow(max(r - R * 0.8, 0.0) / 0.09, 2.0));
  float haloA = halo * (mix(0.05, 0.10, uDark) + 0.05 * uReact);
  // Airy body: the gaps between colour are semi-transparent so the background
  // shows through, and the drifting colour waves are the more solid parts. A low
  // base fill + strongly wave-driven body leaves lots of "air" inside, so the
  // glow reads as flowing wisps rather than a solid ball.
  float waves = clamp(b0 + 0.8 * b1, 0.0, 1.0);
  float bodyA = clamp(body * (0.15 + 0.60 * waves + 0.06 * core) * (0.92 + 0.08 * fres), 0.0, 1.0);
  float fade = mix(1.0, 0.45 + 0.35 * sin(t * 2.0), uLoad);
  vec3 pm = col * bodyA + haloCol * haloA * (1.0 - bodyA);
  float al = bodyA + haloA * (1.0 - bodyA);
  float g = uBright * fade;
  gl_FragColor = vec4(pm * g, al * g);
}
`;

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* SPHERE — a glossy liquid orb: a fixed circle bump-mapped with flowing  */
/* longitudinal ripples, lit with a sharp specular so silky highlight     */
/* streaks slide over deep, draped folds (iOS "liquid glass"). The folds  */
/* flow + deepen while speaking.                                          */
/* ------------------------------------------------------------------ */
export const SPHERE_FRAGMENT = HEADER + SNOISE + COORDS + /* glsl */ `
void main() {
  vec2 q = coords();
  float t = uTime;
  float r = length(q);
  // Speaking uses the irregular talk envelope (phrases + pauses); listening uses a
  // steady, gentle breath instead — so it reads as attentive, not like quiet talking.
  float speak = smoothstep(0.6, 1.0, uReact);
  float speech = uReact * mix(0.55 + 0.25 * sin(t * 1.6), speechEnv(t), speak);
  speech = mix(speech, uMic, uVoice);   // voice mode: react to the real mic level
  // State energy: idle/ready sits low (calm, near-still ripples); listening,
  // thinking and connecting each lift it via their own driver; speaking peaks.
  // Drives ripple amplitude + silhouette wobble so every state reads distinct.
  float energy = 0.32 + 0.40 * uReact + 0.42 * uFlow + 0.26 * uLoad + 0.55 * speech;
  // Expressivity sets the fold WIDTH: turning it up LOWERS the fold frequency so
  // the folds get wider and — together with the bigger amplitude (the state
  // drivers are expressivity-scaled) — read as fewer, BIGGER bulges while speaking
  // rather than lots of tiny ones. 1 = the tuned default.
  float fexp = 1.15 - 0.15 * uExpressivity;  // 1.15x folds at min, 1x default, 0.85x max

  // Globe spin (left -> right), shared by the silhouette ripple AND the surface
  // folds below so the edge bulges track the waves rolling across the surface.
  // uDrag.x adds the user's swipe spin (with momentum) on top of the base drift,
  // so dragging across the sphere spins it that way and it keeps gliding after.
  float rot = t * 0.5 + uDrag.x;

  // The body stays essentially a CIRCLE; the only silhouette movement comes from
  // the same vertical meridian folds that ripple the surface, sampled at the
  // rim's x and weighted by rimx^2 so they only act on the LEFT/RIGHT sides —
  // where the folds are seen edge-on. Wave crests there bulge OVER the base
  // circle (and troughs dip in), so the ripples read as 3D waves rolling across a
  // round sphere instead of a wobbly blob. Top & bottom stay perfectly round.
  float ea = atan(q.y, q.x);
  float rimx = cos(ea);
  float foldEdge = 0.60 * sin(rimx * 7.0 * fexp - rot) + 0.40 * sin(rimx * 13.0 * fexp - rot * 1.8);
  float sideW = rimx * rimx;            // strong at L/R (folds seen edge-on), ~0 top/bottom
  // A gentle symmetric ripple is always present; while SPEAKING the wave crests
  // additionally bulge OUTWARD over the base circle (rectified to positive only,
  // so it only ever swells past the silhouette, never dents in) and pulse with the
  // speech envelope — the ripples visibly crest over the edge as the agent talks.
  float ripple = foldEdge * sideW * (0.010 + 0.018 * energy);
  float bulge  = max(foldEdge, 0.0) * sideW * (0.06 * uReact + 0.16 * speech);
  // Hover: the silhouette reaches toward the cursor. A rounded crest centred on the
  // cursor's angular direction protrudes the edge there and tracks the pointer as
  // it moves around the sphere; it rides the fold waves so it crests like the rest
  // of the surface rather than ballooning. Fades in/out with uHoverAmt.
  float hoverAng = atan(uHover.y, uHover.x);
  float hoverNear = exp(-pow(acos(clamp(cos(ea - hoverAng), -1.0, 1.0)) / 0.7, 2.0));
  float hoverBulge = hoverNear * uHoverAmt * (0.05 + 0.06 * max(foldEdge, 0.0));
  float R = 0.245 * (1.0 + ripple + bulge + hoverBulge);
  float aa = 1.6 / min(uResolution.x, uResolution.y);
  float circle = 1.0 - smoothstep(R - aa, R + aa, r);
  if (circle <= 0.0) { gl_FragColor = vec4(0.0); return; }

  // Unit-sphere normal (front-facing hemisphere).
  vec2 p = q / R;
  float z = sqrt(max(1.0 - dot(p, p), 0.0));
  vec3 n = vec3(p, z);

  // Vertical meridian folds (ripples) that travel LEFT -> RIGHT, so the sphere
  // reads like a globe spinning on its vertical axis: the fold front is a
  // vertical line sweeping across. uTime carries the per-state speed.
  float nt = t * 0.22;
  vec2 wc = p * 1.4 - vec2(rot * 0.30, uDrag.y * 0.30); // noise drifts with the spin (+ vertical swipe)
  float w0n = snoise(vec3(wc, nt));
  float w1n = snoise(vec3(wc + 5.0, nt));
  float sx = p.x + 0.10 * w0n;                         // mostly-x surface coord (slight warp)
  float A = sx * 7.0 * fexp - rot;
  float B = sx * 13.0 * fexp - rot * 1.8;
  // Analytic gradient: folds vary in x only (dh/dy ~ 0) so the ripple stays a
  // vertical line; the noise adds a little organic perturbation. The coefficients
  // track the fold frequencies (scaled by fexp) so the relief stays correct.
  vec2 grad = vec2(7.0 * fexp * cos(A) + 6.5 * fexp * cos(B), 0.0);
  grad += 1.8 * vec2(w0n, w1n);
  float bump = (0.060 + 0.105 * energy) * (0.55 + 0.45 * z); // deeper folds -> stronger 3D relief
  vec3 N = normalize(n - vec3(grad * bump, 0.0));

  // Pointer ripple: concentric waves spreading from the pointer, added as a normal
  // perturbation (gradient of the ripple height) so the sphere visibly ripples
  // around it. The HOVER ripple is amplified here so moving the cursor over the
  // sphere sends pronounced ripples rolling across the surface. Faded by z so it
  // stays on the visible cap.
  vec2 re = vec2(0.0016, 0.0);
  float rip0 = tapRipple(q)        + 2.4 * hoverRipple(q);
  float ripx = tapRipple(q + re.xy) + 2.4 * hoverRipple(q + re.xy);
  float ripy = tapRipple(q + re.yx) + 2.4 * hoverRipple(q + re.yx);
  vec2 rgrad = vec2(ripx - rip0, ripy - rip0) / re.x;
  N = normalize(N - vec3(rgrad * 0.019 * z, 0.0));

  // Lighting from the upper-right (sharp specular -> silky streaks).
  vec3 L = normalize(vec3(0.42, 0.34, 0.84));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Hh = normalize(L + V);
  float diff = clamp(dot(N, L), 0.0, 1.0);
  float spec = pow(clamp(dot(N, Hh), 0.0, 1.0), 46.0);
  float sheen = pow(clamp(dot(N, Hh), 0.0, 1.0), 9.0);
  float fres = pow(1.0 - clamp(N.z, 0.0, 1.0), 2.6);

  // Colour: a RANDOM gradient that drifts across the surface, sweeping L->R with
  // the globe spin — like the Glow's moving colour masses, not regular longitude
  // bands. Big soft noise blobs of each colour over a colour-0 base (so a single
  // colour sphere is never black; it just circulates light/deep shades of itself,
  // exactly like the Glow). Adding a colour mixes its mass into the gradient.
  float g1 = clamp(uCount - 1.0, 0.0, 1.0);
  float g2 = clamp(uCount - 2.0, 0.0, 1.0);
  float g3 = clamp(uCount - 3.0, 0.0, 1.0);
  float g4 = clamp(uCount - 4.0, 0.0, 1.0);
  vec3 k0   = saturate3(vivid(uCol0), 1.25);
  vec3 kL   = saturate3(clamp(vivid(uCol0) * 1.18, 0.0, 1.0), 1.2);
  // Light mode lifts the deep shade so a single-colour sphere doesn't carry a
  // dark mass across the white screen; dark mode keeps it deeper (pops on dark).
  vec3 kD   = saturate3(vivid(uCol0) * mix(0.94, 0.85, uDark), 1.2);
  vec3 colB = mix(kL, saturate3(vivid(uCol1), 1.25), g1);
  vec3 colC = mix(kD, saturate3(vivid(uCol2), 1.25), g2);
  vec3 colD = saturate3(vivid(uCol3), 1.25);           // colours 4/5: gated below
  vec3 colE = saturate3(vivid(uCol4), 1.25);
  float drift = rot * 0.5;                              // sweeps with the globe spin
  // LOW-frequency field + VERY WIDE smoothstep = big, soft gradient blurs that
  // melt into each other (not small spotted blobs).
  vec2 fp = vec2(sx * 0.85 - drift, p.y * 0.8 - uDrag.y * 0.5); // surface field coord (large masses; vertical swipe rolls it)
  float bb0 = smoothstep(-0.65, 0.75, snoise(vec3(fp, rot * 0.10 + 2.0)));
  float bb1 = smoothstep(-0.45, 0.85, snoise(vec3(fp * 0.8 + 8.0, rot * 0.08 - 1.0)));
  // Two more drifting masses carry colours 4/5; gated so 1-3 colours are unchanged.
  float bb2 = smoothstep(-0.55, 0.80, snoise(vec3(fp * 0.9 + 15.0, rot * 0.12 + 5.0)));
  float bb3 = smoothstep(-0.50, 0.82, snoise(vec3(fp * 0.7 + 22.0, rot * 0.06 - 4.0)));
  vec3 hue = k0;
  hue = mix(hue, colB, bb0);
  hue = mix(hue, colC, bb1);
  hue = mix(hue, colD, bb2 * g3);
  hue = mix(hue, colE, bb3 * g4);
  hue = saturate3(hue, 1.2);

  vec3 light = mix(hue, vec3(1.0), 0.8);
  // DARK mode: a vivid hue body with a deep-but-coloured shadow side; the gloss is
  // the bright WHITE specular streaks (which pop against the dark screen).
  vec3 colDark = hue * (0.5 + 0.5 * diff);
  // LIGHT mode: WHITE flows across the sphere — over the white screen the gloss
  // must read as LIGHTNESS, not a dark tint. A light colour base, with the lit
  // ripple crests + broad sheen blending toward white; the troughs keep the
  // colour so the silhouette stays defined.
  vec3 colLight = mix(hue, vec3(1.0), 0.32) * (0.86 + 0.16 * diff);
  colLight = mix(colLight, vec3(1.0), clamp(0.5 * pow(diff, 1.6) + 0.55 * sheen, 0.0, 0.9));
  vec3 col = mix(colLight, colDark, uDark);
  col += light * spec * 1.2;     // sharp silky streaks
  col += hue * sheen * 0.4;      // broad sheen
  col += hue * fres * 0.55;      // rim glow
  col = desat(col, uSat);

  // Opacity: mostly solid so the (dark) background can't bleed through the shadow
  // side as black. Light mode stays a touch more translucent so it sits softly on
  // the white screen; highlights + rim push it fully opaque.
  float lum = dot(clamp(col, 0.0, 1.0), vec3(0.299, 0.587, 0.114));
  // Connecting: a slow opacity breath so the state reads as "waking up".
  float pulse = mix(1.0, 0.62 + 0.38 * sin(t * 1.9), uLoad);
  float aFloor = mix(0.6, 0.82, uDark);
  float a = circle * uBright * pulse * clamp(aFloor + 0.3 * lum + 0.5 * spec + 0.2 * fres, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

/* ------------------------------------------------------------------ */
/* RING — a fixed ring with radial SPIKES/BARS fanning out from its       */
/* outer edge, like a circular audio spectrum analyser. Each bar bounces   */
/* IN PLACE (no travel/rotation), so switching states is a smooth          */
/* amplitude crossfade: bars erupt on speech, idle into a short calm       */
/* fringe, and pulse gently when connecting. A thin static ring forms the  */
/* base of the spikes.                                                     */
/* ------------------------------------------------------------------ */
export const RING_FRAGMENT = HEADER + SNOISE + COORDS + /* glsl */ `
void main() {
  vec2 q = coords();
  float t = uTime;
  float r = length(q);
  float a = atan(q.y, q.x);                 // -PI..PI

  // Speaking uses the irregular talk envelope (phrases + pauses); listening uses a
  // steady, gentle breath instead — so it reads as attentive, not like quiet talking.
  float speak = smoothstep(0.6, 1.0, uReact);
  float speech = uReact * mix(0.55 + 0.25 * sin(t * 1.6), speechEnv(t), speak);
  speech = mix(speech, uMic, uVoice);   // voice mode: react to the real mic level
  float aa = 1.6 / min(uResolution.x, uResolution.y);

  // --- Geometry: bars live in N angular cells, starting at the ring R0 ---
  float R0 = 0.205;                         // ring radius (bars start here)
  const float N = 72.0;                     // number of radial bars
  float seg = a / TAU + 0.5;                // 0..1 around the circle
  float pos = seg * N;
  float idx = floor(pos);
  float cell = fract(pos) - 0.5;            // -0.5..0.5 within a bar slot

  // --- Per-bar amplitude (0..1): the energy concentrates into a few GROUPS
  // (clusters of tall bars) at slowly drifting angular positions, and per-bar
  // noise gives each bar in a group its own height — so the peaks read as
  // bespoke grouped clusters with low gaps between them, not one smooth wave.
  // The groups are periodic (von Mises) so they're seamless around the ring. ---
  float ph = idx * (TAU / N);
  float grp = max(
      exp(3.2 * (cos(ph - t * 0.55) - 1.0)),
      max(exp(3.2 * (cos(ph - t * 0.55 - 2.3) - 1.0)),
          exp(3.2 * (cos(ph + t * 0.5 + 1.4) - 1.0))));
  float perBar = 0.5 + 0.5 * snoise(vec3(idx * 0.8, t * 1.0, 0.0)); // individual bar heights
  float spec = pow(clamp(grp * (0.4 + 0.6 * perBar), 0.0, 1.0), 1.25); // bespoke grouped peaks

  // Connecting: all bars breathe together (a calm "working" pulse), no sweep.
  float pulse = 0.30 + 0.40 * (0.5 + 0.5 * sin(t * 2.2));
  spec = mix(spec, max(spec * 0.5, pulse), uLoad);

  // State energy: idle barely twitches; listening gentle; speaking erupts.
  // While speaking, the speech envelope makes the whole fringe ebb in pauses.
  float energy = mix(0.16, 1.0, uReact);
  float talk = mix(1.0, 0.45 + 0.55 * speechEnv(t), step(0.5, uReact));
  // Small base so the gaps between groups sit low (near the ring) and the
  // grouped peaks stand out.
  float L = 0.005 + (0.155 * spec * energy) * talk + 0.006 * uReact;
  // Voice mode: the whole fringe lifts with the live mic level (per-bar shape kept).
  L += uVoice * uMic * (0.10 + 0.06 * perBar);

  // Tap: bars near the touched angle erupt outward in a quick, quivering pulse.
  float ta = atan(uTap.y, uTap.x);
  float adist = acos(clamp(cos(a - ta), -1.0, 1.0));        // 0..PI around the ring
  float tDecay = exp(-uTapTime * 3.0) * (1.0 - step(1.2, uTapTime));
  float tapAmp = exp(-pow(adist / 0.55, 2.0)) * tDecay * (0.6 + 0.4 * sin(uTapTime * 30.0));
  L += 0.13 * max(tapAmp, 0.0);

  // Hover: bars near the cursor's angle lift + quiver continuously while hovering.
  float ha = atan(uHover.y, uHover.x);
  float hdist = acos(clamp(cos(a - ha), -1.0, 1.0));
  float hovAmp = exp(-pow(hdist / 0.55, 2.0)) * uHoverAmt * (0.55 + 0.45 * sin(t * 9.0));
  L += 0.11 * max(hovAmp, 0.0);

  // --- Bar mask: angular fill (with gaps) x radial extent (R0 -> R0+L) ---
  float barHalf = 0.34;                     // fraction of each cell the bar fills
  float angAA = clamp((N / TAU) * aa / max(r, 0.04), 0.012, 0.4);
  float inAng = 1.0 - smoothstep(barHalf - angAA, barHalf + angAA, abs(cell));
  float outer = R0 + L;
  float inRad = smoothstep(R0 - aa, R0 + aa, r)
              * (1.0 - smoothstep(outer - aa, outer + aa, r));
  float bar = inAng * inRad;

  // --- The base ring the spikes grow from (static, thin). ---
  float ring = 1.0 - smoothstep(0.009, 0.012, abs(r - R0));

  // --- Palette: up to 5 hues blended SEAMLESSLY around the ring. Colours sit at
  // evenly-spaced angles (TAU / active count) and blend with periodic (wrap-
  // around) weights, so there is no start/end seam and the hues fade softly into
  // one another. The set slowly rotates; colours 2-5 crossfade in with uCount.
  // (At 3 colours the spacing is TAU/3, exactly as before.) ---
  vec3 k0 = vivid(uCol0);
  vec3 k1 = vivid(uCol1);
  vec3 k2 = vivid(uCol2);
  vec3 k3 = vivid(uCol3);
  vec3 k4 = vivid(uCol4);
  float spin = t * 0.16;
  float sharp = 1.3;                          // lower = softer fade between hues
  float cseg = TAU / max(uCount, 1.0);        // even angular spacing for any count
  float w0 = exp(sharp * (cos(a - spin) - 1.0));
  float w1 = exp(sharp * (cos(a - spin - cseg) - 1.0)) * clamp(uCount - 1.0, 0.0, 1.0);
  float w2 = exp(sharp * (cos(a - spin - 2.0 * cseg) - 1.0)) * clamp(uCount - 2.0, 0.0, 1.0);
  float w3 = exp(sharp * (cos(a - spin - 3.0 * cseg) - 1.0)) * clamp(uCount - 3.0, 0.0, 1.0);
  float w4 = exp(sharp * (cos(a - spin - 4.0 * cseg) - 1.0)) * clamp(uCount - 4.0, 0.0, 1.0);
  vec3 col = (k0 * w0 + k1 * w1 + k2 * w2 + k3 * w3 + k4 * w4) / (w0 + w1 + w2 + w3 + w4 + 1e-4);
  col = saturate3(col, 1.25);
  col = desat(col, uSat);

  // --- Composite (premultiplied, additive across the disjoint regions) ---
  float g = uBright;
  vec3 pm = vec3(0.0);
  float al = 0.0;
  // bars
  float barA = bar * g;
  pm += col * barA;
  al += barA;
  // ring
  float ringA = ring * 0.9 * g;
  pm += col * 1.05 * ringA;
  al += ringA;

  // Soft outer glow behind the fringe (mainly on dark, keeps it from looking flat).
  float glow = exp(-pow(max(r - R0, 0.0) / (0.10 + 0.10 * speech), 2.0)) * (1.0 - ring);
  float glowA = glow * (mix(0.04, 0.10, uDark) + 0.06 * speech) * g;
  pm += col * glowA;
  al += glowA;

  // Connecting pulses its overall opacity ("not ready yet").
  float fade = mix(1.0, 0.5 + 0.35 * sin(t * 2.0), uLoad);
  pm *= fade;
  al = clamp(al * fade, 0.0, 1.0);

  gl_FragColor = vec4(pm, al);
}
`;

/* ------------------------------------------------------------------ */
/* WAVE — an oscillating STRING: a travelling wave (moves left->right)    */
/* under a Gaussian packet. Flat-lines during silence and erupts into     */
/* waves on speech; waves pack CLOSER together while speaking; a gradient  */
/* of the chosen colours flows along the line. Crisp, no glow.            */
/* ------------------------------------------------------------------ */
export const WAVE_FRAGMENT = HEADER + SNOISE + COORDS + /* glsl */ `
void main() {
  vec2 q = coords();
  float t = uTime;
  float x = q.x;

  // --- The string: flat at the edges, bursting into a wave packet in the centre.
  // The frequency rises (waves pack closer) while speaking. ---
  float sigma = 0.18;                              // packet half-width (narrow -> L/R margin)
  // Connecting sweeps the packet side-to-side like a loader; else centred.
  float center = uLoad * 0.30 * sin(t * 1.3);
  float env = exp(-pow((x - center) / sigma, 2.0));

  // Waves closer together while speaking (uReact); thinking adds some too.
  float freq = 24.0 + 26.0 * uReact + 10.0 * uFlow;
  // Travelling wave: the crests move LEFT -> RIGHT (uTime carries the per-state
  // speed). The symmetric, centred envelope keeps the packet balanced so it reads
  // as a clean waveform scrolling sideways rather than a lopsided lean.
  float phase = x * freq - t * 5.0;

  // A gentle always-on ripple keeps LISTENING/idle a subtle, near-flat line that
  // still waves left->right. The bigger SPEAKING waves erupt only at high uReact
  // and follow the speech envelope SMOOTHLY (no hard gate), so they rise and fall
  // naturally instead of snapping, and still flatten toward the baseline during
  // speech pauses (flat-line vs waves). Thinking/connecting keep a steady wave.
  float base  = 0.018 + 0.022 * uReact;         // subtle ripple (listening stays low)
  float speak = smoothstep(0.6, 1.0, uReact);   // ~0 listening, 1 speaking
  // Voice mode drives the wave height from the real mic level instead of the
  // synthetic talk envelope.
  float drive = mix(speak * 0.26 * speechEnv(t), 0.30 * uMic, uVoice);
  float amp = env * (base + drive + 0.14 * uFlow + 0.10 * uLoad);
  float y = amp * sin(phase);

  // Crisp anti-aliased line. The vertical half-thickness is expanded by the
  // slope so the stroke keeps a constant PERPENDICULAR width when steep, but the
  // anti-alias band is held at a fixed ~1.5px in SCREEN space — otherwise the
  // soft edge gets magnified at steep parts and reads as a glow/blur.
  // Tap: a localized ripple bump on the string centred at the touched x.
  float wAge = uTapTime;
  float wBump = exp(-pow((x - uTap.x) / 0.12, 2.0))
              * sin((x - uTap.x) * 40.0 - wAge * 24.0)
              * exp(-wAge * 2.6) * (1.0 - step(1.5, wAge));
  y += wBump * 0.05;
  // Hover: a localized ripple bump on the string that follows the cursor.
  float wHov = exp(-pow((x - uHover.x) / 0.12, 2.0))
             * sin((x - uHover.x) * 40.0 - t * 7.0) * uHoverAmt;
  y += wHov * 0.04;

  float dydx = amp * freq * cos(phase);
  float halfWv = 0.0030 * sqrt(1.0 + dydx * dydx); // vertical half-thickness (thin line)
  float pix = 1.4 / min(uResolution.x, uResolution.y);
  float core = 1.0 - smoothstep(halfWv - pix, halfWv + pix, abs(q.y - y));

  // --- gradient colours flowing ALONG the string: broad, soft bands whose
  // centres slowly drift, so the colours smoothly change over time. 1-5 colours
  // crossfade in/out with uCount (a single colour fills the whole line). Band
  // centres spread evenly along the line ((i+0.5)/count). ---
  vec3 k0 = vivid(uCol0);
  vec3 k1 = vivid(uCol1);
  vec3 k2 = vivid(uCol2);
  vec3 k3 = vivid(uCol3);
  vec3 k4 = vivid(uCol4);
  float gx = clamp(x + 0.5, 0.0, 1.0);             // 0..1 along the line
  float seg = 1.0 / max(uCount, 1.0);              // even band spacing for any count
  // Band half-width tracks the spacing so adjacent colours don't wash into each
  // other as more are added — each colour keeps a clearly visible region.
  float bandW = seg * 0.7;
  float m0 = 0.5 * seg + 0.12 * sin(t * 0.13);
  float m1 = 1.5 * seg + 0.13 * sin(t * 0.11 + 2.1);
  float m2 = 2.5 * seg + 0.12 * sin(t * 0.17 + 4.2);
  float m3 = 3.5 * seg + 0.12 * sin(t * 0.15 + 1.0);
  float m4 = 4.5 * seg + 0.12 * sin(t * 0.10 + 3.3);
  float w0 = exp(-pow((gx - m0) / bandW, 2.0));
  float w1 = exp(-pow((gx - m1) / bandW, 2.0)) * clamp(uCount - 1.0, 0.0, 1.0);
  float w2 = exp(-pow((gx - m2) / bandW, 2.0)) * clamp(uCount - 2.0, 0.0, 1.0);
  float w3 = exp(-pow((gx - m3) / bandW, 2.0)) * clamp(uCount - 3.0, 0.0, 1.0);
  float w4 = exp(-pow((gx - m4) / bandW, 2.0)) * clamp(uCount - 4.0, 0.0, 1.0);
  vec3 col = (k0 * w0 + k1 * w1 + k2 * w2 + k3 * w3 + k4 * w4) / (w0 + w1 + w2 + w3 + w4 + 1e-4);
  col = saturate3(col, 1.2);
  col = desat(col, uSat);

  // Fade the ends earlier so the string sits smaller, with margin left & right.
  float edgeFade = smoothstep(0.40, 0.24, abs(x));

  // Composite: a crisp line, no glow (premultiplied).
  float a = core * edgeFade * uBright;
  gl_FragColor = vec4(col * a, a);
}
`;

/* ------------------------------------------------------------------ */
/* AURA — several glowing strands woven into a wave-packet: they swell  */
/* and entangle in the centre, flatten toward the edges, and brighten   */
/* to white where they cross. Two strands per active colour, so more    */
/* colours = more entangled lines. Flows + waves more while speaking.   */
/* ------------------------------------------------------------------ */
export const AURA_FRAGMENT = HEADER + SNOISE + COORDS + /* glsl */ `
// Soft glowing strand at y = yc(x), with a DEPTH that oscillates along x + time
// so strands pass over and under each other (woven ribbons). Compositing is
// depth-weighted: where strands overlap, the frontmost (highest z) wins, so one
// line rolls over the other instead of the colours just adding.
void addStrand(inout vec3 colNum, inout float wDen, inout float covMax, inout float covSum,
               float qy, float x, float t, float env, float amp,
               float ph, float fr, float sp, vec3 c, float gate) {
  // Travelling phase (x*fr - t*sp): the waves move LEFT -> RIGHT, like the Wave.
  float yc = env * amp * (0.72 * sin(x * fr - t * sp + ph)
                        + 0.28 * sin(x * fr * 1.6 - t * sp * 1.3 + ph * 1.7));
  yc += env * amp * 0.6 * sin(t * 0.5 + ph * 2.0); // drift scales with amp: flat when calm, woven when active
  float d = abs(qy - yc);
  float z = sin(x * fr * 0.6 - t * sp * 1.0 + ph * 1.3); // depth travels right too
  // Depth biases which strand shows on top (rolls over), but stays BOUNDED so a
  // faint tail can't override a bright line's colour (that caused odd overlaps).
  float depth = 0.5 + 0.5 * z;                          // 0 = far/back, 1 = near/front
  // 3D depth-of-field: a strand further back (low depth) is rendered WIDER + SOFTER
  // (blurrier) with a lower peak, while a near strand stays crisp — so the weave
  // reads with real front-to-back depth as the lines roll over each other.
  float thick = mix(0.052, 0.015, depth);
  // Less blur toward the far left/right edges, where the strands converge — so
  // they read crisp there instead of smearing into one soft mass.
  thick *= mix(1.0, 0.5, smoothstep(0.16, 0.34, abs(x)));
  float g = exp(-(d * d) / (thick * thick)) * gate * mix(0.70, 1.0, depth);
  // Brightness varies with depth: a strand in FRONT reads brighter than one
  // behind it, so even a single colour shows lights + darks as the lines roll.
  // Light mode keeps the floor high so "back" strands don't dim into muddy tones
  // (a darkened yellow goes olive/brown on white); dark mode can dim further since
  // the lines read against black.
  vec3 cc = c * (mix(0.82, 0.55, uDark) + mix(0.40, 0.70, uDark) * depth);
  float w = g * (0.22 + 0.78 * depth);                  // coverage-primary front/back
  colNum += cc * w;
  wDen += w;
  covMax = max(covMax, g);
  covSum += g;                                          // total coverage -> overlap bloom
}

void main() {
  vec2 q = coords();
  float t = uTime;
  float x = q.x;
  // Speaking uses the irregular talk envelope (phrases + pauses); listening uses a
  // steady, gentle breath instead — so it reads as attentive, not like quiet talking.
  float speak = smoothstep(0.6, 1.0, uReact);
  float speech = uReact * mix(0.55 + 0.25 * sin(t * 1.6), speechEnv(t), speak);
  speech = mix(speech, uMic, uVoice);   // voice mode: react to the real mic level

  // Amplitude envelope: a NARROW packet so the waviness concentrates in the middle
  // and the strands flatten to near-straight lines toward the left/right edges.
  // (The visibility fade below stays wide, so those flat lines still stretch out.)
  float sigma = 0.16 + 0.05 * speech;
  float env = exp(-pow(x / sigma, 2.0));
  // State-driven amplitude, like the Wave: calm + low when idle/ready, a clear
  // ripple while listening/thinking, and a full entangled swell when speaking.
  float amp = 0.04 + 0.05 * uReact + 0.05 * uFlow + 0.04 * uLoad + 0.15 * speech;
  // The tallest crest is ~1.6 * amp (the two sines + the drift term). Expressivity
  // scales the state drivers up (so uReact/speech can run high), which pushed the
  // crests past the canvas half-height (0.5) and clipped them. Cap amp so the
  // crest + strand thickness always stays inside the canvas at any expressivity.
  amp = min(amp, 0.27);

  float g1 = clamp(uCount - 1.0, 0.0, 1.0);
  float g2 = clamp(uCount - 2.0, 0.0, 1.0);
  float g3 = clamp(uCount - 3.0, 0.0, 1.0);
  float g4 = clamp(uCount - 4.0, 0.0, 1.0);
  vec3 c0 = vivid(uCol0);
  // ALWAYS six strands regardless of colour count: inactive colour slots collapse
  // to the active palette (lines never disappear, only recolour). Slots 2/3
  // become colours 2/3 as they activate, else fall back to colour 1.
  vec3 c1 = mix(c0, vivid(uCol1), g1);
  vec3 c2 = mix(c0, vivid(uCol2), g2);
  // Colours 4/5 recolour two of the fainter companion strands once active, so the
  // weave can show up to five hues without adding strands. They fall back to
  // c0 / c1 when inactive, leaving a 1-3 colour aura exactly as it was.
  vec3 c3 = mix(c0, vivid(uCol3), g3);
  vec3 c4 = mix(c1, vivid(uCol4), g4);

  // Six strands (different phase/frequency/speed so they weave + roll). Two
  // strands per colour slot so the picked colours read clearly — no lightened
  // companions (those looked washed out); every line keeps its chosen hue.
  // Each slot pairs ONE solid line with ONE more-transparent line (the last
  // gate arg). With a single colour the strands would otherwise blend into one
  // opaque mass; the per-line transparency keeps the weave legible — fainter
  // ribbons read as sitting behind the solid ones instead of merging.
  vec3 colNum = vec3(0.0);
  float wDen = 0.0;
  float covMax = 0.0;
  float covSum = 0.0;
  // Tap: a localized vertical ripple displaces the whole weave near the touched x,
  // so the strands swell + ripple where the user tapped.
  float aAge = uTapTime;
  float aOff = exp(-pow((x - uTap.x) / 0.16, 2.0))
             * sin((x - uTap.x) * 30.0 - aAge * 22.0)
             * exp(-aAge * 2.6) * (1.0 - step(1.5, aAge)) * 0.045;
  // Hover: a localized vertical ripple that follows the cursor along the weave.
  float aHov = exp(-pow((x - uHover.x) / 0.16, 2.0))
             * sin((x - uHover.x) * 30.0 - t * 7.0) * uHoverAmt * 0.04;
  float qy = q.y - aOff - aHov;
  addStrand(colNum, wDen, covMax, covSum, qy, x, t, env, amp, 0.0, 13.0, 1.00, c0, 1.00);
  addStrand(colNum, wDen, covMax, covSum, qy, x, t, env, amp, 1.3, 15.5, 1.22, c3, 0.55);
  addStrand(colNum, wDen, covMax, covSum, qy, x, t, env, amp, 2.6, 12.0, 0.92, c1, 0.90);
  addStrand(colNum, wDen, covMax, covSum, qy, x, t, env, amp, 3.9, 16.5, 1.12, c4, 0.50);
  addStrand(colNum, wDen, covMax, covSum, qy, x, t, env, amp, 5.2, 14.0, 1.05, c2, 0.85);
  addStrand(colNum, wDen, covMax, covSum, qy, x, t, env, amp, 0.7, 17.0, 1.30, c2, 0.62);

  // Frontmost strand's colour (depth-weighted) at each pixel.
  vec3 col = colNum / max(wDen, 1e-4);
  // Bright CROSSINGS: where strands overlap (coverage beyond the single top
  // strand), the colour blooms brighter and washes a little toward white — so the
  // weave shows interesting, luminous intersections even with one colour.
  float overlap = clamp(covSum - covMax, 0.0, 1.5);
  // Crossings read OPPOSITELY per theme. LIGHT mode: a gentle brighten + faint
  // white wash so intersections glow softly over the white screen. DARK mode: the
  // overlaps DARKEN instead (a dark overlay where lines cross), so intersections
  // read as deep shadows against the dark screen rather than glowing white.
  vec3 colLight = col * (1.0 + 0.28 * overlap);
  colLight = mix(colLight, vec3(1.0), 0.05 * clamp(overlap, 0.0, 1.0));
  vec3 colDark = col * (1.0 - 0.45 * clamp(overlap, 0.0, 1.0));
  col = mix(colLight, colDark, uDark);
  col = saturate3(col, 1.1);
  col = desat(col, uSat);
  // Dark mode: a gentle darker overlay so the lines read a touch moodier against
  // the dark screen — but kept fairly bright so the aura still pops.
  col *= mix(1.0, 0.88, uDark);

  // Visibility fade: kept wide so the (now flat) strands stay stretched far out to
  // the left/right before dissolving into the background.
  float edgeFade = smoothstep(0.5, 0.30, abs(x));
  float scale = (0.95 + 0.4 * speech) * uBright * edgeFade;
  float a = clamp(covMax * scale, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

/* ------------------------------------------------------------------ */
/* BARS — a classic linear audio EQ: a centred row of vertical rounded  */
/* capsules whose heights react per state. Idle rests as short nubs;     */
/* connecting sweeps a bump across them like a loader; thinking rolls a   */
/* travelling wave; listening lifts gently; speaking erupts with the talk */
/* envelope. The palette is distributed across the bars (left -> right).  */
/* ------------------------------------------------------------------ */
export const BARS_FRAGMENT = HEADER + SNOISE + COORDS + /* glsl */ `
// SDF of a vertical capsule centred at the origin: a segment from (0,-h) to
// (0,+h) with radius r. Negative inside.
float vCapsule(vec2 p, float h, float r) {
  p.y -= clamp(p.y, -h, h);
  return length(p) - r;
}
void main() {
  vec2 q = coords();
  float t = uTime;
  float aa = 1.6 / min(uResolution.x, uResolution.y);

  // Speaking uses the irregular talk envelope (phrases + pauses); listening uses a
  // steady, gentle breath instead — so it reads as attentive, not like talking.
  float speak = smoothstep(0.6, 1.0, uReact);
  float speech = uReact * mix(0.55 + 0.25 * sin(t * 1.6), speechEnv(t), speak);
  speech = mix(speech, uMic, uVoice);   // voice mode: react to the real mic level

  // --- Geometry: a fixed centred row of thin bars with constant spacing. ---
  float N = 8.0;                           // fixed count
  float span = 0.60;                       // total width of the row
  float gap = span / (N - 1.0);            // constant spacing between bar centres
  float bw  = 0.030;                       // thin bars (also the dot radius when short)
  // Nearest bar to this pixel.
  float fx = (q.x + span * 0.5) / gap;
  float idx = floor(fx + 0.5);
  if (idx < 0.0 || idx > N - 1.0) { gl_FragColor = vec4(0.0); return; }
  float u  = idx / max(N - 1.0, 1.0);      // 0..1 position of this bar
  float bx = -span * 0.5 + idx * gap;      // this bar's centre x

  // --- Per-bar height (half-height in coords units) ---
  // A centred hump so the middle bars stand tallest (the classic EQ silhouette).
  float window = 0.5 + 0.5 * sin(u * PI);
  // Each bar gets its own wiggle so the row isn't a rigid shape.
  float perBar = 0.5 + 0.5 * snoise(vec3(idx * 0.9, t * 1.6, 0.0));
  // Speaking gate (1 while speaking, ~0 otherwise) — only SPEAKING grows tall
  // bars; ready / listening / thinking / connecting stay low so they read as dots.
  float speakGate = smoothstep(0.45, 0.85, uReact);
  // Speaking ebbs in pauses (talk envelope).
  float talk = 0.45 + 0.55 * speechEnv(t);
  // Thinking: a travelling wave rolling left -> right across the bars.
  float flowWave = 0.4 + 0.6 * (0.5 + 0.5 * sin(u * 6.0 - t * 3.0));
  // Connecting: a single bump sweeping across like a loader.
  float sweep = fract(t * 0.4);
  float loadBump = exp(-pow((u - sweep) / 0.14, 2.0));

  // Tall reactive bars ONLY while speaking; the other states keep tiny heights so
  // the capsules render as dots. A little life keeps the dots from being dead.
  float idleLife = 0.012 * (0.5 + 0.5 * sin(t * 1.3 + idx * 0.7));
  float h = 0.235 * window * perBar * speech * speakGate * talk  // speaking bars
          + idleLife * (1.0 - speakGate)                          // gentle dot breath
          + 0.035 * uFlow * flowWave                              // thinking: subtle
          + 0.050 * uLoad * loadBump;                             // connecting: subtle sweep
  // Voice mode lifts the bars with the live mic level (centre bars rise most).
  h += uVoice * uMic * 0.18 * (0.5 + 0.5 * window);
  // Tap / hover: bars near the pointer's column erupt (sampled at the bar centre).
  h += 0.10 * max(poke(vec2(bx, 0.0)), 0.0);
  h = clamp(h, 0.0, 0.40);

  // Radius is CONSTANT, so moving between states is a smooth grow/shrink of the
  // height with the gaps always preserved (no scaling / merging). When a bar is
  // short the constant-radius capsule naturally reads as a round dot.
  float rad = bw;

  float d = vCapsule(vec2(q.x - bx, q.y), h, rad);
  float bar = 1.0 - smoothstep(-aa, aa, d);
  if (bar <= 0.0) { gl_FragColor = vec4(0.0); return; }

  // --- Colour: a smooth gradient that FLOWS through the bars (rather than one
  // flat colour per bar). The sample coordinate mixes the bar's x-position with
  // the pixel's height and drifts with time, so multiple colours read as a single
  // gradient sliding inside the bars. Wide bands keep it a smooth blend. ---
  vec3 k0 = vivid(uCol0);
  vec3 k1 = vivid(uCol1);
  vec3 k2 = vivid(uCol2);
  vec3 k3 = vivid(uCol3);
  vec3 k4 = vivid(uCol4);
  float seg = 1.0 / max(uCount, 1.0);
  float bandW = seg * 1.05;                            // wide => gradient, not bands
  float gpos = clamp(u * 0.7 + (q.y / 0.42) * 0.18 + 0.14 * sin(t * 0.5) + 0.15, 0.0, 1.0);
  float w0 = exp(-pow((gpos - 0.5 * seg) / bandW, 2.0));
  float w1 = exp(-pow((gpos - 1.5 * seg) / bandW, 2.0)) * clamp(uCount - 1.0, 0.0, 1.0);
  float w2 = exp(-pow((gpos - 2.5 * seg) / bandW, 2.0)) * clamp(uCount - 2.0, 0.0, 1.0);
  float w3 = exp(-pow((gpos - 3.5 * seg) / bandW, 2.0)) * clamp(uCount - 3.0, 0.0, 1.0);
  float w4 = exp(-pow((gpos - 4.5 * seg) / bandW, 2.0)) * clamp(uCount - 4.0, 0.0, 1.0);
  vec3 col = (k0 * w0 + k1 * w1 + k2 * w2 + k3 * w3 + k4 * w4) / (w0 + w1 + w2 + w3 + w4 + 1e-4);
  col = saturate3(col, 1.2);
  col = desat(col, uSat);

  // Connecting breathes the overall opacity ("not ready yet").
  float fade = mix(1.0, 0.5 + 0.4 * sin(t * 2.0), uLoad);
  float a = bar * uBright * fade;
  gl_FragColor = vec4(col * a, a);
}
`;
