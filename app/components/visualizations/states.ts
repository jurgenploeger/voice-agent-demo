// The agent's conversational STATE — independent of the visual STYLE
// (Orb/Wave/Pulse). Driven by a single value so the real agent can set it
// programmatically; the manual control is demo-only.
//
// NOTE: "error" / "disconnected" is intentionally deferred. To add it later:
//   - extend AgentState + the maps below
//   - give it a monochrome treatment (desaturated + stalled), or introduce a
//     red alarm exception if the design rules change.
export type AgentState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

// Order shown in the manual control + the natural call lifecycle.
export const STATE_ORDER: AgentState[] = [
  "idle",
  "connecting",
  "listening",
  "thinking",
  "speaking",
];

// Status-line text under the title (kept lowercase to match the original look).
export const STATE_LABEL: Record<AgentState, string> = {
  idle: "ready",
  connecting: "connecting",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
};

// Labels for the State control buttons.
export const STATE_TAB_LABEL: Record<AgentState, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

// Scalar drivers fed to every shader as uniforms (lerped on the JS side so
// state changes ease in). Each visualization reads what's relevant to it.
//
// Intensity scalars:
//   level  — motion amplitude / expand-contract energy
//   speed  — time multiplier for all motion
//   bright — overall opacity / presence (low = muted, "not ready")
//   sat    — color saturation (low = desaturated "busy", not "active")
//   orbit  — rotational / orbiting motion (mainly the orb's light)
//
// Motion-PATTERN weights (LiveKit-style: each state is a different animation,
// not just a louder version of the same one). Exactly one is ~1 per state and
// the rest ~0; lerping between them crossfades the patterns:
//   load   — bouncing/sequenced "loader" sweep        → connecting
//   flow   — traveling ripple / rotating spinner       → thinking
//   react  — reactive multi-sine amplitude             → listening (gentle) /
//                                                         speaking (strong)
export type StateParams = {
  level: number;
  speed: number;
  bright: number;
  sat: number;
  orbit: number;
  load: number;
  flow: number;
  react: number;
};

export const STATE_PARAMS: Record<AgentState, StateParams> = {
  // calm, dim, slow, barely-there shimmer — resting but ready
  idle:       { level: 0.2,  speed: 0.4,  bright: 0.55, sat: 0.78, orbit: 0.0, load: 0.0, flow: 0.0, react: 0.12 },
  // a bouncing loader sweep, muted + pulsing opacity — "not ready yet"
  connecting: { level: 0.6,  speed: 1.0,  bright: 0.5,  sat: 0.45, orbit: 0.0, load: 1.0, flow: 0.0, react: 0.0 },
  // gentle responsive expand-contract, full saturated color
  listening:  { level: 0.6,  speed: 0.9,  bright: 1.0,  sat: 1.0,  orbit: 0.0, load: 0.0, flow: 0.0, react: 0.45 },
  // fast churning vortex, clearly desaturated — "busy" not "active"
  thinking:   { level: 0.6,  speed: 1.25, bright: 0.92, sat: 0.4,  orbit: 0.0, load: 0.0, flow: 1.0, react: 0.0 },
  // strong reactive amplitude, natural speaking pace
  speaking:   { level: 1.25, speed: 1.25, bright: 1.0,  sat: 1.0,  orbit: 0.0, load: 0.0, flow: 0.0, react: 1.0 },
};
