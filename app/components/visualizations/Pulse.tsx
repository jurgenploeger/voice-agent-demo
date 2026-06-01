import ShaderCanvas from "./ShaderCanvas";
import { PULSE_FRAGMENT } from "./shaders";
import { AgentState } from "./states";

export default function Pulse({
  hues,
  running,
  state,
  dark,
}: {
  hues: number[];
  running: boolean;
  state: AgentState;
  dark: boolean;
}) {
  return (
    <ShaderCanvas
      fragment={PULSE_FRAGMENT}
      hues={hues}
      running={running}
      state={state}
      dark={dark}
    />
  );
}
