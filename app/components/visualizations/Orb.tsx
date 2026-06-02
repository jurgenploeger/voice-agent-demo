import ShaderCanvas, { VisualizationProps } from "./ShaderCanvas";
import { ORB_FRAGMENT } from "./shaders";

export default function Orb(props: VisualizationProps) {
  return <ShaderCanvas fragment={ORB_FRAGMENT} {...props} />;
}
