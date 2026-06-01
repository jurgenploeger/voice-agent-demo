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
  float speechN = snoise(vec3(t * 3.0, 11.0, 3.0)) * 0.62
                + snoise(vec3(t * 1.3, 7.0, 9.0)) * 0.38; // -1 .. 1
  float talk = uReact * speechN;
  float R = 0.27 * (1.0 + talk * 0.09);
  float speech = uReact * (0.5 + 0.5 * speechN); // 0 .. ~1 while speaking
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
  float spd = 0.55 + 0.4 * uLevel + 0.5 * uFlow + 1.0 * uReact;
  float nt = t * 0.07 * spd;
  // The mesh warps harder on speech peaks (in sync with the size pulse).
  float nAmp = 0.16 + 0.18 * uReact + 0.14 * speech;
  vec2 sp = p + nAmp * vec2(snoise(vec3(p * 0.6, nt)),
                            snoise(vec3(p * 0.6 + 4.7, nt)));

  // --- 2-3 big, soft color clouds. Centres are NOISE-driven (not sines) so
  // they wander organically and never trace the same looping path — even at
  // the fast speaking speed. ---
  // Clouds also swing wider on speech peaks, matching the size pulse.
  float amp = (1.0 + 0.5 * uReact) * (1.0 + 0.35 * speech);
  vec2 c0 = 0.30 * amp * vec2(snoise(vec3(t * 0.16 * spd, 0.0, 1.0)),
                              snoise(vec3(t * 0.16 * spd, 1.0, 0.0)));
  vec2 c1 = 0.34 * amp * vec2(snoise(vec3(t * 0.12 * spd, 9.0, 0.0)),
                              snoise(vec3(t * 0.12 * spd, 0.0, 9.0)));
  vec2 c2 = 0.26 * amp * vec2(snoise(vec3(t * 0.09 * spd, 5.0, 2.0)),
                              snoise(vec3(t * 0.09 * spd, 2.0, 5.0)));
  // Tighter falloffs so the clouds read as distinct, defined colour zones (a
  // mesh gradient) rather than melting into one uniform blur — still soft.
  float b0 = smoothstep(0.85, 0.12, length(sp - c0));
  float b1 = smoothstep(0.95, 0.12, length(sp - c1));
  float b2 = smoothstep(0.78, 0.12, length(sp - c2));

  // One drifting "light source" spot — the orb is most transparent here, so the
  // background shines through more (a glowing window; reads as depth on dark).
  // Measured from the UN-warped coordinate so it stays a single coherent blob
  // (the noise warp can't fold it into multiple lobes). Large, drifting softly.
  vec2 lc = 0.22 * vec2(sin(t * 0.085 * spd + 1.3), cos(t * 0.1 * spd + 0.5));
  float lightSpot = smoothstep(1.7, 0.1, length(p - lc));

  // Palette: harmonic offsets from one hue. Kept saturated so the interior
  // colour reads pronounced even through the translucent body.
  // Up to three user-chosen colours. With one colour every cloud is the same
  // hue (mono shades); colours 2 and 3 crossfade in as uCount rises (lerped),
  // so adding/removing a colour is smooth.
  vec3 k0 = saturate3(vivid(uHue),  1.85);
  vec3 k1 = saturate3(vivid(uHue1), 1.85);
  vec3 k2 = saturate3(vivid(uHue2), 1.85);
  vec3 colA = k0;
  vec3 colB = mix(k0, k1, clamp(uCount - 1.0, 0.0, 1.0));
  vec3 colC = mix(k0, k2, clamp(uCount - 2.0, 0.0, 1.0));
  // Base fills the gaps between clouds — kept saturated so the mesh stays vivid.
  vec3 base = saturate3(mix(vivid(uHue), vec3(1.0), 0.08), 1.4);

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
/* WAVE — rounded vertical bars, summed-sine heights, drifting bell.   */
/* ------------------------------------------------------------------ */
export const WAVE_FRAGMENT = HEADER + COORDS + /* glsl */ `
#define N 33.0

// 4 summed sines of differing frequency/phase -> drifting, never symmetric.
float barAmp(float i, float t) {
  return 0.30
       + 0.26 * sin(i * 0.42 + t * 1.05)
       + 0.18 * sin(i * 0.21 - t * 0.73 + 1.7)
       + 0.12 * sin(i * 0.115 + t * 0.47 + 3.2)
       + 0.08 * sin(i * 0.07 - t * 1.6 + 0.5);
}

void main() {
  vec2 q = coords();
  float t = uTime;
  float breath = 0.5 + 0.5 * sin(t * (TAU / 3.8));

  float A = 0.40;            // half horizontal spread
  float maxH = 0.165;        // max half-height (keeps it in a center band)
  float spacing = (2.0 * A) / (N - 1.0);
  float radius = spacing * 0.30;
  float aa = 1.6 / min(uResolution.x, uResolution.y);

  // Reactive envelope centre slowly travels; loader bump bounces side to side.
  float center = 0.42 * sin(t * 0.22);
  float loadC = sin(t * 1.7) * 0.86; // connecting loader sweep position (-1..1)

  float fi = (q.x + A) / spacing; // fractional bar index at this pixel
  float fill = 0.0;
  float glow = 0.0;
  vec3 col = vec3(0.0);

  for (int k = -3; k <= 3; k++) {
    float i = floor(fi + 0.5) + float(k);
    if (i < 0.0 || i > N - 1.0) continue;

    float bx = -A + i * spacing;
    float nx = bx / A; // -1..1

    // --- three distinct per-bar motion patterns (0..1) ---
    // reactive: drifting multi-sine bell  (listening / speaking)
    float bellR = exp(-pow((nx - center) * 1.25, 2.0));
    float amp = 0.5 + 0.5 * barAmp(i, t);
    float hReact = (0.18 + 0.82 * bellR) * (0.30 + 0.6 * amp);
    // flow: a sine ripple travelling across the row  (thinking)
    float bellF = exp(-pow(nx * 1.1, 2.0));
    float hFlow = bellF * (0.30 + 0.55 * (0.5 + 0.5 * sin(i * 0.6 - t * 3.2)));
    // load: a localized bump bouncing across like a loader  (connecting)
    float hLoad = exp(-pow((nx - loadC) / 0.16, 2.0));

    // Blend by state pattern weights over a low resting baseline.
    float dyn = uReact * hReact + uFlow * hFlow + uLoad * hLoad;
    float hh = clamp(0.10 + uLevel * dyn, 0.04, 1.0);
    float halfH = maxH * hh * (0.9 + 0.1 * breath);

    // Vertical capsule SDF -> rounded caps.
    float cy = clamp(q.y, -halfH, halfH);
    float dseg = length(vec2(q.x - bx, q.y - cy));
    float sdf = dseg - radius;

    float f = 1.0 - smoothstep(-aa, aa, sdf);
    if (f > fill) {
      fill = f;
      // Vertical gradient: darker top -> lighter bottom (vivid palette).
      float g = clamp((q.y / halfH) * 0.5 + 0.5, 0.0, 1.0); // 1 top, 0 bottom
      vec3 topC = vivid(uHue) * 0.55;
      vec3 botC = mix(vivid(uHue), vivid(uHue1), clamp(uCount - 1.0, 0.0, 1.0));
      col = mix(botC, topC, g);
    }
    glow += exp(-pow(max(dseg - radius, 0.0) * 8.5, 1.4)) * (0.45 + 0.55 * hh);
  }

  glow = clamp(glow, 0.0, 1.0);
  vec3 glowCol = mix(vivid(uHue), vivid(uHue1), clamp(uCount - 1.0, 0.0, 1.0));
  // Soft central band so the colour bleeds into the white around the bars,
  // tightened vertically so the bars stay crisp rather than hazy.
  float band = exp(-pow(q.y / 0.20, 2.0)) * exp(-pow(q.x / 0.46, 2.0));
  float haloA = clamp(glow * 0.36 + band * 0.09, 0.0, 0.6);

  // State saturation.
  col = desat(col, uSat);
  glowCol = desat(glowCol, uSat);

  vec4 outc = vec4(glowCol, haloA);
  outc.rgb = mix(outc.rgb, col, fill);
  outc.a = outc.a + fill * (1.0 - outc.a);

  // State presence.
  float a = clamp(outc.a * uBright, 0.0, 1.0);
  gl_FragColor = vec4(outc.rgb * a, a);
}
`;

/* ------------------------------------------------------------------ */
/* PULSE — staggered expanding rings + breathing center dot.           */
/* ------------------------------------------------------------------ */
export const PULSE_FRAGMENT = HEADER + COORDS + /* glsl */ `
#define K 3

void main() {
  vec2 q = coords();
  float t = uTime;
  float d = length(q);
  float breath = 0.5 + 0.5 * sin(t * (TAU / 3.6));
  float aa = 1.6 / min(uResolution.x, uResolution.y);

  float ang = atan(q.y, q.x);

  // State energy pushes the rings out a little further.
  float maxR = 0.42 * (0.82 + 0.3 * uLevel);
  float period = 3.6;

  vec3 ringCol = mix(vivid(uHue), vivid(uHue1), clamp(uCount - 1.0, 0.0, 1.0));
  float ringSum = 0.0;
  float glowSum = 0.0;

  // --- expanding rings (idle / listening / speaking) ---
  // Suppressed when connecting (loader) or thinking (spinner) take over.
  float ringsW = clamp(1.0 - uLoad - uFlow, 0.0, 1.0);
  for (int k = 0; k < K; k++) {
    // Stagger phase so 2-3 rings are always visible at different radii.
    float phase = fract(t / period + float(k) / float(K));
    float r = phase * maxR;
    float thick = mix(0.020, 0.004, phase); // thins as it grows
    float ring = 1.0 - smoothstep(thick, thick + aa + 0.004, abs(d - r));
    // Eased opacity in & out so rings never pop.
    float op = smoothstep(0.0, 0.14, phase) * (1.0 - smoothstep(0.62, 1.0, phase));
    ringSum += ring * op * ringsW;
    glowSum += exp(-pow((d - r) / 0.055, 2.0)) * op * 0.22 * ringsW;
  }

  // --- rotating spinner (thinking) ---
  // A comet head sweeping around a fixed ring, so it reads as "processing".
  float spinR = 0.17;
  float spinBand = exp(-pow((d - spinR) / 0.05, 2.0));
  float comet = pow(0.5 + 0.5 * sin(ang - t * 3.0), 3.0);
  float spinner = spinBand * comet * uFlow;
  ringSum += spinner;
  glowSum += spinner * 0.4;

  // --- in-place pulsing ring (connecting) ---
  // A ring at a fixed radius breathing in opacity — hesitant, "not live yet".
  float loadR = 0.16;
  float loadPulse = exp(-pow((d - loadR) / 0.022, 2.0))
                  * (0.35 + 0.65 * (0.5 + 0.5 * sin(t * 2.4))) * uLoad;
  ringSum += loadPulse;
  glowSum += loadPulse * 0.4;

  ringSum = clamp(ringSum, 0.0, 1.0);

  // Center dot with its own breath + internal gradient.
  float dotR = 0.052 * (0.82 + 0.26 * breath);
  float dotMask = 1.0 - smoothstep(dotR - aa, dotR + aa, d);
  vec3 dotAccent = mix(vivid(uHue), vivid(uHue1), clamp(uCount - 1.0, 0.0, 1.0));
  vec3 dotCol = mix(dotAccent, deepHue(uHue), smoothstep(0.0, dotR, d));
  float dotGlow = exp(-pow(d / (dotR * 3.0), 2.0)) * (0.6 + 0.4 * breath);

  vec3 haloCol = mix(vivid(uHue), vivid(uHue1), clamp(uCount - 1.0, 0.0, 1.0));
  float haloA = clamp(glowSum + dotGlow * 0.5, 0.0, 0.7);

  // State saturation.
  ringCol = desat(ringCol, uSat);
  dotCol = desat(dotCol, uSat);
  haloCol = desat(haloCol, uSat);

  vec4 outc = vec4(haloCol, haloA);
  outc.rgb = mix(outc.rgb, ringCol, ringSum);
  outc.a = outc.a + ringSum * 0.85 * (1.0 - outc.a);
  outc.rgb = mix(outc.rgb, dotCol, dotMask);
  outc.a = outc.a + dotMask * (1.0 - outc.a);

  // State presence.
  float a = clamp(outc.a * uBright, 0.0, 1.0);
  gl_FragColor = vec4(outc.rgb * a, a);
}
`;
