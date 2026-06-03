// Public entry point for the voice-agent visualization set.
//
// Drop these into any React app with `ogl` installed — no Next.js, no global
// CSS, no fonts, no build-time shader loaders. Give the parent an explicit size
// (or pass `style`/`className`); the component carries no intrinsic dimensions.
//
//   import { Orb, type AgentState } from ".../visualizations";
//   <div style={{ width: 320, height: 320 }}>
//     <Orb hues={[252]} running state="speaking" dark={false} />
//   </div>

export { default as Orb } from "./Orb";
export { default as Sphere } from "./Sphere";
export { default as Wave } from "./Wave";
export { default as Aura } from "./Aura";

// Lower-level engine + driver tables, for consumers who want to add a style.
export { default as ShaderCanvas, type VisualizationProps } from "./ShaderCanvas";
export {
  type AgentState,
  type StateParams,
  STATE_PARAMS,
} from "./states";
