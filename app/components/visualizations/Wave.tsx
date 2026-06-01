import ShaderCanvas from "./ShaderCanvas";
import { WAVE_FRAGMENT } from "./shaders";
import { AgentState } from "./states";

export default function Wave({
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
      fragment={WAVE_FRAGMENT}
      hues={hues}
      running={running}
      state={state}
      dark={dark}
    />
  );
}
