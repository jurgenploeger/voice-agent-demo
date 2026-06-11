// The agent's conversational STATE — independent of the visual STYLE
// (Orb/Wave/Pulse). Driven by a single value so the real agent can set it
// programmatically; the manual control is demo-only.
export type AgentState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

// NOTE: presentation-only maps (status labels, button labels, display order)
// are intentionally NOT here — they're demo concerns, not engine concerns. See
// app/components/stateLabels.ts.

// Scalar drivers fed to every shader as uniforms (lerped on the JS side so
// state changes ease in). Each visualization reads what's relevant to it.
//
// Intensity scalars:
//   level  — motion amplitude / expand-contract energy
//   speed  — time multiplier for all motion
//   bright — overall opacity / presence (low = muted, "not ready")
//   sat    — color saturation (low = desaturated "busy", not "active")
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
  load: number;
  flow: number;
  react: number;
};

// Colours stay FULL across the conversational states — sat and bright are
// pinned to 1.0 so the palette never dims or desaturates; those states differ
// purely by ANIMATION (the speed/level + load/flow/react motion-pattern weights
// below), not by tone. ERROR is the single deliberate exception: a monochrome,
// stalled treatment (desaturated + dimmed + near-still) so "not alive" reads
// through the customer's palette without a reserved alarm colour.
export const STATE_PARAMS: Record<AgentState, StateParams> = {
  // calm + slow, barely-there shimmer — resting but ready (full colour)
  idle:       { level: 0.2,  speed: 0.4,  bright: 1.0, sat: 1.0,  load: 0.0, flow: 0.0, react: 0.12 },
  // a bouncing loader sweep with a pulsing opacity breath — "not ready yet"
  connecting: { level: 0.6,  speed: 1.0,  bright: 1.0, sat: 1.0,  load: 1.0, flow: 0.0, react: 0.0 },
  // gentle responsive expand-contract
  listening:  { level: 0.6,  speed: 0.9,  bright: 1.0, sat: 1.0,  load: 0.0, flow: 0.0, react: 0.45 },
  // fast churning vortex — "busy" via MOTION, not a dull tint
  thinking:   { level: 0.6,  speed: 1.25, bright: 1.0, sat: 1.0,  load: 0.0, flow: 1.0, react: 0.0 },
  // strong reactive amplitude, natural speaking pace
  speaking:   { level: 1.25, speed: 1.25, bright: 1.0, sat: 1.0,  load: 0.0, flow: 0.0, react: 1.0 },
  // monochrome + stalled — desaturated, dimmed, near-still ("not alive")
  error:      { level: 0.1,  speed: 0.15, bright: 0.6, sat: 0.15, load: 0.0, flow: 0.0, react: 0.0 },
};
