// Presentation-only state metadata for THIS demo's UI (status line + the State
// control). Kept out of the reusable engine (visualizations/states.ts) so the
// publishable component set carries no demo-specific copy.
import { AgentState } from "./visualizations/states";

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
