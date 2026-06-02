import ShaderCanvas, { VisualizationProps } from "./ShaderCanvas";
import { AURA_FRAGMENT } from "./shaders";

export default function Aura(props: VisualizationProps) {
  return <ShaderCanvas fragment={AURA_FRAGMENT} {...props} />;
}
