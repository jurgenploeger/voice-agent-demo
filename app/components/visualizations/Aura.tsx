import ShaderCanvas from "./ShaderCanvas";
import { AURA_FRAGMENT } from "./shaders";
import { AgentState } from "./states";

export default function Aura({
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
      fragment={AURA_FRAGMENT}
      hues={hues}
      running={running}
      state={state}
      dark={dark}
    />
  );
}
