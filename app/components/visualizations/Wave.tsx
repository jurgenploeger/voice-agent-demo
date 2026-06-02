import ShaderCanvas, { VisualizationProps } from "./ShaderCanvas";
import { WAVE_FRAGMENT } from "./shaders";

export default function Wave(props: VisualizationProps) {
  return <ShaderCanvas fragment={WAVE_FRAGMENT} {...props} />;
}
