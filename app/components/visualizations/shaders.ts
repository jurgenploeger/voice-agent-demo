// Shared GLSL building blocks + one fragment shader per visualization.
// All shaders are time-driven (uTime), hue-driven (uHue, degrees 0-360),
// and output PREMULTIPLIED alpha so the colored halo bleeds into the white
// phone screen instead of sitting on top of it like a sticker.

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
uniform float uHue;        // degrees, 0-360
uniform vec2  uResolution; // drawing-buffer pixels
// Conversational-state drivers (lerped on the JS side). See states.ts.
uniform float uLevel;      // motion amplitude / energy
uniform float uBright;     // overall opacity / presence
uniform float uSat;        // color saturation
uniform float uOrbit;      // rotational / orbiting motion
// Motion-pattern weights (one ~1 per state):
uniform float uLoad;       // bouncing loader sweep  -> connecting
uniform float uFlow;       // traveling / spinner    -> thinking
uniform float uReact;      // reactive amplitude     -> listening / speaking
uniform float uDark;       // 1 = dark theme, 0 = light (halo tuning)
uniform float uHue1;       // colour 2 (degrees); uHue (above) is colour 1
uniform float uHue2;       // colour 3 (degrees)
uniform float uCount;      // active colours, lerped 1 .. 3
varying vec2  vUv;

#define PI 3.141592653589793
#define TAU 6.283185307179586

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// hue helper: takes a degree offset from the base hue
vec3 hueCol(float degOffset, float s, float v) {
  return hsv2rgb(vec3(fract((uHue + degOffset) / 360.0), s, v));
}

// Desaturate toward luminance (used for the "thinking" busy look).
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

// Vivid, white-background-tuned color from a single hue (degrees). Saturation
// and value are fixed (the slider only moves hue); the yellow-green band
// (~45-180) is tamed because high S/V there reads acidic on white.
vec3 vivid(float hueDeg) {
  float h = mod(hueDeg, 360.0);
  float yg = smoothstep(45.0, 80.0, h) * (1.0 - smoothstep(150.0, 185.0, h));
  // Bright + confident; the yellow-green band is only gently tamed so it never
  // goes muddy. Dark mode pushes saturation a touch higher so it stays vivid.
  float s = mix(0.88, 0.68, yg) + uDark * 0.06;
  float v = mix(1.0, 0.92, yg);
  return hsv2rgb(vec3(h / 360.0, clamp(s, 0.0, 1.0), v));
}

// Deep, saturated version of a hue for interior bases / shadows.
vec3 deepHue(float hueDeg) {
  return hsv2rgb(vec3(mod(hueDeg, 360.0) / 360.0, 0.9, 0.42));
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
/* ORB — fixed circle, domain-warped flowing interior ("Siri flow").   */
/* The silhouette never moves; all motion happens inside the disc.     */
/* ------------------------------------------------------------------ */
export const ORB_FRAGMENT = HEADER + SNOISE + COORDS + /* glsl */ `
void main() {
  vec2 q = coords();
  float t = uTime;
  float r = length(q);

  // FIXED, perfect circle of CONSTANT size — the orb itself never pulses or
  // scales (in any state). All life happens in the liquid interior below.
  float breath = 0.5 + 0.5 * sin(t * (TAU / 3.6)); // used only for the halo
  // Shared "speech" envelope (layered simplex noise, irregular/non-looping).
  // It drives BOTH the size pulse and the interior mesh below, so the gradients
  // surge in rhythm with the talking instead of churning at a steady rate.
  // Speech activity with natural pauses (shared envelope). Swells the orb on
  // speech bursts and rests it during pauses, rather than a constant pulse.
  float speech = uReact * speechEnv(t); // 0 .. ~1 while speaking, ~0 in pauses
  float R = 0.24 * (1.0 + speech * 0.10);
  float aa = 1.6 / min(uResolution.x, uResolution.y);
  float circle = 1.0 - smoothstep(R - aa, R + aa, r);

  // Interior coordinates normalized to the unit disc.
  vec2 p = q / R;

  // --- Soft colored fog: ONE low-frequency, large-scale noise nudge only ---
  // No fbm, no octave stacking. Low frequency + small amplitude keeps the
  // masses big and smooth (no veins, filaments or marble). The interior is
  // always in gentle liquid motion. State is conveyed purely by MOTION SPEED &
  // AMPLITUDE (which lerp smoothly) — no rotation, so switching never spins.
  // Always-on gentle liquid drift; speaking runs it at a natural pace.
  // The interior churn SPEED comes entirely from uTime's rate (lerped per-state
  // on the JS side), so the noise clock uses a FIXED coefficient. Multiplying
  // the accumulated uTime by a lerping per-state factor would make the phase
  // JUMP on a state change — that's what made the interior spin up suddenly.
  // Speech still adds AMPLITUDE (nAmp) below; it just doesn't add extra speed.
  float nt = t * 0.09;
  // The mesh warps harder on speech peaks (in sync with the size pulse).
  float nAmp = 0.16 + 0.18 * uReact + 0.14 * speech;
  vec2 sp = p + nAmp * vec2(snoise(vec3(p * 0.6, nt)),
                            snoise(vec3(p * 0.6 + 4.7, nt)));
  // A circular wave rippling out from the centre, displacing TANGENTIALLY so the
  // interior swirls in concentric waves — liquid sloshing inside the orb.
  float ang = atan(p.y, p.x);
  float wave = (0.05 + 0.05 * speech) * sin(length(p) * 6.0 - nt * 4.0);
  sp += wave * vec2(-sin(ang), cos(ang));

  // --- 2-3 big, soft colour clouds that CIRCULATE around the interior on their
  // own orbits (counter-rotating, with noise on angle + radius) so the masses
  // revolve like liquid swirling inside the orb. The radii stay bounded so the
  // (large) blobs always overlap into one connected shape — never a gap. The
  // base angular rate uses uTime directly (which already carries the per-state
  // speed), so speaking swirls faster without a phase jump on state change. ---
  float edge = 0.5;
  float bt = t;
  float a0 =  bt * 0.55 + 2.2 * snoise(vec3(bt * 0.13, 0.0, 0.0));
  float a1 = -bt * 0.44 + 2.2 * snoise(vec3(bt * 0.11, 5.0, 0.0)) + 2.0;
  float a2 =  bt * 0.34 + 2.2 * snoise(vec3(bt * 0.09, 9.0, 0.0)) + 4.0;
  float rad0 = edge * (0.42 + 0.36 * (0.5 + 0.5 * snoise(vec3(bt * 0.20, 1.0, 0.0))));
  float rad1 = edge * (0.40 + 0.38 * (0.5 + 0.5 * snoise(vec3(bt * 0.17, 2.0, 0.0))));
  float rad2 = edge * (0.38 + 0.32 * (0.5 + 0.5 * snoise(vec3(bt * 0.14, 4.0, 0.0))));
  vec2 c0 = rad0 * vec2(cos(a0), sin(a0));
  vec2 c1 = rad1 * vec2(cos(a1), sin(a1));
  vec2 c2 = rad2 * vec2(cos(a2), sin(a2));
  // Tighter falloffs so the clouds read as distinct, defined colour zones (a
  // mesh gradient) rather than melting into one uniform blur — still soft.
  float b0 = smoothstep(1.05, 0.1, length(sp - c0));
  float b1 = smoothstep(1.35, 0.1, length(sp - c1));
  float b2 = smoothstep(1.32, 0.1, length(sp - c2));

  // One drifting "light source" spot — the orb is most transparent here, so the
  // background shines through more (a glowing window; reads as depth on dark).
  // Measured from the UN-warped coordinate so it stays a single coherent blob
  // (the noise warp can't fold it into multiple lobes). Large, drifting softly.
  vec2 lc = 0.22 * vec2(sin(t * 0.085 + 1.3), cos(t * 0.1 + 0.5));
  float lightSpot = smoothstep(1.7, 0.1, length(p - lc));

  // Palette: harmonic offsets from one hue. Kept saturated so the interior
  // colour reads pronounced even through the translucent body.
  // Up to three user-chosen colours; colours 2 and 3 crossfade in as uCount
  // rises (lerped), so adding/removing a colour is smooth.
  // Dark mode pushes saturation higher so the orb reads as vivid/neon over the
  // dark backdrop instead of muted/muddy. Light mode is unchanged.
  float satK = mix(1.85, 2.35, uDark);
  vec3 k0 = saturate3(vivid(uHue),  satK);
  vec3 k1 = saturate3(vivid(uHue1), satK);
  vec3 k2 = saturate3(vivid(uHue2), satK);
  // SINGLE-colour fallback: rather than every cloud being the IDENTICAL hue (so
  // the interior barely moves), the 2nd/3rd clouds become a brighter and a
  // deeper SHADE of that one hue — so a mono orb still shows light and deep
  // masses circulating inside. These crossfade to the real colours 2/3 as those
  // activate, so the multi-colour look is unchanged.
  vec3 kLight = saturate3(clamp(vivid(uHue) * 1.20, 0.0, 1.0), mix(1.4, 1.8, uDark));
  vec3 kDeep  = saturate3(vivid(uHue) * 0.62, mix(1.5, 1.95, uDark));
  vec3 colA = k0;
  vec3 colB = mix(kLight, k1, clamp(uCount - 1.0, 0.0, 1.0));
  vec3 colC = mix(kDeep,  k2, clamp(uCount - 2.0, 0.0, 1.0));
  // Base fills the gaps between clouds — kept saturated so the mesh stays vivid;
  // less white mixed in on dark so the colour stays neon rather than washing out.
  vec3 base = saturate3(mix(vivid(uHue), vec3(1.0), mix(0.08, 0.03, uDark)), mix(1.4, 1.8, uDark));

  vec3 col = base;
  col = mix(col, colA, b0);
  col = mix(col, colB, b1);
  col = mix(col, colC, b2);
  // Bright luminous core of the light source — a prominent highlight.
  col += lightSpot * 0.2 * mix(vec3(1.0), colA, 0.3);

  // --- Glassy shading (sells the 3D volume) ---
  float z = sqrt(max(R * R - r * r, 0.0));
  vec3 nrm = normalize(vec3(q, z + 1e-4));
  vec3 L = normalize(vec3(-0.32, 0.5, 0.8));
  // very gentle volumetric shading — kept light so it reads lit-from-within
  col *= 0.92 + 0.08 * clamp(dot(nrm, L), 0.0, 1.0);
  // brighter specular near the top — a defined glassy highlight
  float spec = pow(clamp(dot(nrm, L), 0.0, 1.0), 3.5);
  col += spec * (0.22 + 0.12 * uLevel);
  // Soft Fresnel rim — gentle and colour-tinted so the edge blends rather than
  // ringing the orb with a bright line.
  float fres = pow(1.0 - clamp(nrm.z, 0.0, 1.0), 3.0);
  col += fres * 0.22 * mix(vec3(1.0), colA, 0.65);

  // Colour stays consistent across states — states differ by MOTION, not hue.

  // --- Composite: TRANSLUCENT glassy body over a soft halo ---
  // The body lets the background show through (more see-through in the centre,
  // a more opaque glassy rim), so dark mode reveals the dark backdrop.
  vec3 haloCol = mix(mix(vivid(uHue), vec3(1.0), 0.78),
                     mix(vivid(uHue), vec3(1.0), 0.30), uDark);
  // Lower opacity + wider, softer falloff so the border glow melts into the bg.
  float halo = exp(-pow(max(r - R, 0.0) / 0.075, 2.0));
  float haloAmp = mix(0.07, 0.14, uDark) + 0.08 * uReact;
  float haloA = halo * haloAmp * (0.85 + 0.15 * breath) * (1.0 - circle);

  // See-through core, glassy rim — and the light-source spot is the MOST
  // transparent, so the background shines through there.
  float bodyA = circle * (0.7 + 0.3 * fres) * (1.0 - 0.66 * lightSpot);

  // Connecting pulses its opacity ("not ready yet") without fully vanishing.
  float fade = mix(1.0, 0.45 + 0.35 * sin(t * 2.0), uLoad);

  // Source-over (premultiplied): translucent body in front of the halo.
  vec3 pm = col * bodyA + haloCol * haloA * (1.0 - bodyA);
  float a = bodyA + haloA * (1.0 - bodyA);
  float g = uBright * fade;
  gl_FragColor = vec4(pm * g, a * g);
}
`;

/* ------------------------------------------------------------------ */
/* SPHERE — a soft GLOBE: like the Orb but with soft, round edges (no hard  */
/* circle line). Solid through the core with a gentle round falloff, soft   */
/* 3D volume shading, and drifting interior colour. No specular hotspot.    */
/* ------------------------------------------------------------------ */
export const SPHERE_FRAGMENT = HEADER + SNOISE + COORDS + /* glsl */ `
void main() {
  vec2 q = coords();
  float t = uTime;
  float r = length(q);

  float speech = uReact * speechEnv(t);      // 0..~1 while speaking, ~0 in pauses
  float R = 0.24 * (1.0 + speech * 0.08);    // same base size as the Orb
  float p = r / R;                           // normalized radius (0 centre, 1 rim)

  // Soft globe body: solid through the core, then a soft round falloff to 0.
  float core = exp(-2.0 * p * p);
  float body = smoothstep(1.06, 0.62, p);

  // Drifting interior colour, displaced by concentric ripples so the shapes
  // read as moving WAVES inside the sphere (livelier while speaking).
  vec2 P = q / R;
  float nt = t * 0.10;
  float nAmp = 0.18 + 0.16 * speech;
  vec2 sp = P + nAmp * vec2(snoise(vec3(P * 0.7, nt)),
                            snoise(vec3(P * 0.7 + 4.7, nt)));
  float ang = atan(P.y, P.x);
  float wave = (0.07 + 0.13 * speech) * sin(length(P) * 5.0 - t * 3.0);
  sp += wave * vec2(-sin(ang), cos(ang));
  float bt = t;
  float a0 =  bt * 0.42 + 2.0 * snoise(vec3(bt * 0.12, 0.0, 0.0));
  float a1 = -bt * 0.34 + 2.0 * snoise(vec3(bt * 0.10, 5.0, 0.0)) + 2.0;
  vec2 c0 = 0.40 * vec2(cos(a0), sin(a0));
  vec2 c1 = 0.38 * vec2(cos(a1), sin(a1));
  float b0 = smoothstep(1.15, 0.1, length(sp - c0));
  float b1 = smoothstep(1.30, 0.1, length(sp - c1));

  vec3 k0   = saturate3(vivid(uHue), 1.7);
  vec3 kL   = saturate3(clamp(vivid(uHue) * 1.18, 0.0, 1.0), 1.3);
  vec3 kD   = saturate3(vivid(uHue) * 0.62, 1.4);
  vec3 colB = mix(kL, saturate3(vivid(uHue1), 1.7), clamp(uCount - 1.0, 0.0, 1.0));
  vec3 colC = mix(kD, saturate3(vivid(uHue2), 1.7), clamp(uCount - 2.0, 0.0, 1.0));
  vec3 base = saturate3(mix(vivid(uHue), vec3(1.0), 0.06), 1.3);
  vec3 col = base;
  col = mix(col, k0,   b0);
  col = mix(col, colB, b1);
  col = mix(col, colC, b0 * 0.5);
  col = desat(col, uSat);

  // Soft 3D globe shading (lit upper-left), gentle so the edge stays soft.
  // No specular hotspot — there's no bright light-source blip.
  float z = sqrt(max(1.0 - p * p, 0.0));
  vec3 nrm = normalize(vec3(q / R, z + 1e-4));
  vec3 Ld = normalize(vec3(-0.35, 0.45, 0.85));
  float diff = clamp(dot(nrm, Ld), 0.0, 1.0);
  col *= 0.66 + 0.34 * diff;
  float fres = pow(1.0 - clamp(nrm.z, 0.0, 1.0), 2.5);
  col += fres * 0.10 * mix(vec3(1.0), k0, 0.6); // faint, soft rim tint

  // Composite: soft globe over a soft halo (premultiplied).
  vec3 haloCol = mix(mix(vivid(uHue), vec3(1.0), 0.75),
                     mix(vivid(uHue), vec3(1.0), 0.32), uDark);
  float halo = exp(-pow(max(r - R * 0.8, 0.0) / 0.09, 2.0));
  float haloA = halo * (mix(0.05, 0.10, uDark) + 0.05 * uReact);
  // Airy body: the gaps between colour are semi-transparent so the background
  // shows through, and the drifting colour waves are the more solid parts.
  float waves = clamp(b0 + 0.8 * b1, 0.0, 1.0);
  float bodyA = clamp(body * (0.30 + 0.5 * waves + 0.12 * core) * (0.92 + 0.08 * fres), 0.0, 1.0);
  float fade = mix(1.0, 0.45 + 0.35 * sin(t * 2.0), uLoad);
  vec3 pm = col * bodyA + haloCol * haloA * (1.0 - bodyA);
  float al = bodyA + haloA * (1.0 - bodyA);
  float g = uBright * fade;
  gl_FragColor = vec4(pm * g, al * g);
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

  float speech = uReact * speechEnv(t);
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

  // --- Palette: up to 3 hues blended SEAMLESSLY around the ring. Colours sit at
  // evenly-spaced angles and blend with periodic (wrap-around) weights, so there
  // is no start/end seam and the hues fade softly into one another. The set
  // slowly rotates; colours 2/3 crossfade in with uCount. ---
  vec3 k0 = vivid(uHue);
  vec3 k1 = vivid(uHue1);
  vec3 k2 = vivid(uHue2);
  float spin = t * 0.16;
  float sharp = 1.3;                          // lower = softer fade between hues
  float w0 = exp(sharp * (cos(a - spin) - 1.0));
  float w1 = exp(sharp * (cos(a - spin - TAU / 3.0) - 1.0)) * clamp(uCount - 1.0, 0.0, 1.0);
  float w2 = exp(sharp * (cos(a - spin - 2.0 * TAU / 3.0) - 1.0)) * clamp(uCount - 2.0, 0.0, 1.0);
  vec3 col = (k0 * w0 + k1 * w1 + k2 * w2) / (w0 + w1 + w2 + 1e-4);
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

  // --- The string: flat at the edges, bursting into a wave packet in the
  // centre. A STANDING wave (no sideways travel) keeps the packet symmetric
  // about the centre so it never looks skewed; a travelling phase would shift
  // the crests off-centre under the fixed envelope and read as a lean. The
  // frequency rises (waves pack closer) while speaking. ---
  float sigma = 0.16;                              // packet half-width (narrow -> L/R margin)
  // Connecting sweeps the packet side-to-side like a loader; else centred.
  float center = uLoad * 0.30 * sin(t * 1.3);
  float env = exp(-pow((x - center) / sigma, 2.0));

  // Waves closer together while speaking (uReact); thinking adds some too.
  float freq = 24.0 + 26.0 * uReact + 10.0 * uFlow;
  // Travelling phase: the waves move left -> right in every state (uTime carries
  // the per-state speed, lerped on the JS side).
  float phase = x * freq - t * 5.0;

  // A gentle always-on ripple keeps LISTENING/idle a subtle, near-flat line that
  // still waves left->right. The bigger SPEAKING waves erupt only at high uReact
  // and follow the speech envelope SMOOTHLY (no hard gate), so they rise and fall
  // naturally instead of snapping, and still flatten toward the baseline during
  // speech pauses (flat-line vs waves). Thinking/connecting keep a steady wave.
  float base  = 0.018 + 0.022 * uReact;         // subtle ripple (listening stays low)
  float speak = smoothstep(0.6, 1.0, uReact);   // ~0 listening, 1 speaking
  float amp = env * (base + speak * 0.26 * speechEnv(t) + 0.14 * uFlow + 0.10 * uLoad);
  float y = amp * sin(phase);

  // Crisp anti-aliased line. The vertical half-thickness is expanded by the
  // slope so the stroke keeps a constant PERPENDICULAR width when steep, but the
  // anti-alias band is held at a fixed ~1.5px in SCREEN space — otherwise the
  // soft edge gets magnified at steep parts and reads as a glow/blur.
  float dydx = amp * freq * cos(phase);
  float halfWv = 0.0030 * sqrt(1.0 + dydx * dydx); // vertical half-thickness (thin line)
  float pix = 1.4 / min(uResolution.x, uResolution.y);
  float core = 1.0 - smoothstep(halfWv - pix, halfWv + pix, abs(q.y - y));

  // --- gradient colours flowing ALONG the string: broad, soft bands whose
  // centres slowly drift, so the colours smoothly change over time. 1-3 colours
  // crossfade in/out with uCount (a single colour fills the whole line). ---
  vec3 k0 = vivid(uHue);
  vec3 k1 = vivid(uHue1);
  vec3 k2 = vivid(uHue2);
  float gx = clamp(x + 0.5, 0.0, 1.0);             // 0..1 along the line
  float m0 = 0.22 + 0.12 * sin(t * 0.13);
  float m1 = 0.50 + 0.13 * sin(t * 0.11 + 2.1);
  float m2 = 0.78 + 0.12 * sin(t * 0.17 + 4.2);
  float w0 = exp(-pow((gx - m0) / 0.30, 2.0));
  float w1 = exp(-pow((gx - m1) / 0.30, 2.0)) * clamp(uCount - 1.0, 0.0, 1.0);
  float w2 = exp(-pow((gx - m2) / 0.30, 2.0)) * clamp(uCount - 2.0, 0.0, 1.0);
  vec3 col = (k0 * w0 + k1 * w1 + k2 * w2) / (w0 + w1 + w2 + 1e-4);
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
/* AURA — a soft gradient glow that pools at the BOTTOM of the screen   */
/* and climbs both sides in a U, thinning toward the top. Smooth and    */
/* blurry (no sharp curtains); it swells and pulses while speaking.     */
/* ------------------------------------------------------------------ */
export const AURA_FRAGMENT = HEADER + SNOISE + /* glsl */ `
void main() {
  // Full-screen 0..1 coords (y = 1 top, 0 bottom).
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float t = uTime;

  // Speech activity with natural pauses (shared envelope): swells while speaking
  // (uReact ~1), gentle while listening (~0.45), and ebbs into pauses.
  float speech = uReact * speechEnv(t);

  // --- fluid motion: domain-warp the sampling position with slow flowing noise
  // so the oval undulates and morphs like liquid. uTime already integrates the
  // per-state speed (lerped in JS), so use a FIXED rate here — multiplying
  // accumulated time by a changing factor would make the phase JUMP on a state
  // change (glitchy). ---
  float slow = t * 0.13;
  vec2 warp = vec2(
    snoise(vec3(uv.x * 1.3, uv.y * 1.1 - slow, slow * 0.7)),
    snoise(vec3(uv.x * 1.3 + 5.0, uv.y * 1.1 + slow * 0.9, slow * 0.8 + 2.0))
  );
  vec2 p = uv + warp * (0.06 + 0.14 * uReact); // subtle at rest; flows more while speaking

  // Soft flowing field (sampled in the warped space) for gentle intensity drift.
  // Low frequencies only + a flatter remap so the glow stays an even, soft bloom
  // rather than throwing bright sparks/hotspots.
  float field = 0.72 * snoise(vec3(p.x * 0.8, p.y * 0.7 - slow, slow * 0.6))
              + 0.28 * snoise(vec3(p.x * 1.2 + 3.0, p.y * 1.0 + slow, slow + 2.0));
  field = field * 0.5 + 0.5;
  field = mix(0.66, field, 0.45);   // strongly flattened -> near-uniform glow

  // --- a soft bloom rising from the bottom edge: brightest low, fading up into
  // the dark (like Google's "Neural Expressive" UI). Kept SHORT, and a touch
  // taller at the left/right edges than in the middle so the top contour dips —
  // a slight U. Sampled in the WARPED space so it flows fluidly. ---
  float ex = clamp(abs(p.x - 0.5) * 2.0, 0.0, 1.0);          // 0 centre -> 1 at sides
  float reachY = mix(0.17, 0.25, smoothstep(0.15, 1.0, ex)); // low + flatter: ~1/4 screen max
  reachY *= 1.0 + 0.08 * speech;                             // gentle swell on speech peaks
  float mask = clamp(1.0 - smoothstep(0.0, reachY, p.y), 0.0, 1.0); // bright bottom -> fade up

  // Soft glow, modulated by the flowing field; breathes, swells with speech.
  float breath = 0.94 + 0.06 * sin(t * 0.5);
  float glow = clamp(mask * (0.84 + 0.16 * field) * breath, 0.0, 1.0);

  // --- palette: three colours whose AMOUNTS breathe over time. Instead of a
  // fixed left/centre/right split, each colour is a broad, soft band whose
  // centre slowly drifts (low-rate sines), so the proportion of each colour on
  // screen ebbs and flows. Sampled in the flowing (warped) space so the bands
  // aren't straight lines. Bands gate in/out with uCount, so 1 or 2 colours
  // degrade gracefully (and collapse to one hue when only one is active). ---
  vec3 c0 = vivid(uHue);
  vec3 c1 = vivid(uHue1);
  vec3 c2 = vivid(uHue2);
  // Drifting band centres -> the visible amount of each colour changes in time.
  float m0 = 0.18 + 0.12 * sin(t * 0.11);
  float m1 = 0.50 + 0.13 * sin(t * 0.09 + 2.1);
  float m2 = 0.82 + 0.12 * sin(t * 0.13 + 4.2);
  // Palette coordinate flows with the liquid field (organic, not a hard line).
  float gx = clamp(p.x + 0.12 * (field - 0.5), 0.0, 1.0);
  float w0 = exp(-pow((gx - m0) / 0.34, 2.0));
  float w1 = exp(-pow((gx - m1) / 0.34, 2.0)) * clamp(uCount - 1.0, 0.0, 1.0);
  float w2 = exp(-pow((gx - m2) / 0.34, 2.0)) * clamp(uCount - 2.0, 0.0, 1.0);
  float wsum = w0 + w1 + w2 + 1e-4;
  vec3 col = (c0 * w0 + c1 * w1 + c2 * w2) / wsum;
  // The weighted blend of differing hues averages toward grey in overlap zones,
  // so push saturation back up to keep the colours vivid.
  col = saturate3(col, 1.3);

  col = desat(col, uSat);

  // Speaking swells + pulses the glow; level lifts presence. Kept a touch
  // dimmer overall so the aura reads as a soft bloom, not a bright wash.
  float pulse = 1.0 + 0.65 * speech;
  float a = clamp(glow * (0.78 + 0.32 * uLevel) * pulse, 0.0, 0.82) * uBright;
  a = clamp(a, 0.0, 1.0);

  gl_FragColor = vec4(col * a, a);
}
`;
