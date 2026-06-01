import ShaderCanvas from "./ShaderCanvas";
import { ORB_FRAGMENT } from "./shaders";
import { AgentState } from "./states";

export default function Orb({
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
      fragment={ORB_FRAGMENT}
      hues={hues}
      running={running}
      state={state}
      dark={dark}
    />
  );
}
