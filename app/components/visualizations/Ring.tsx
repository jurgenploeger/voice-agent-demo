import ShaderCanvas, { VisualizationProps } from "./ShaderCanvas";
import { RING_FRAGMENT } from "./shaders";

export default function Ring(props: VisualizationProps) {
  return <ShaderCanvas fragment={RING_FRAGMENT} {...props} />;
}
