import ShaderCanvas, { VisualizationProps } from "./ShaderCanvas";
import { SPHERE_FRAGMENT } from "./shaders";

export default function Sphere(props: VisualizationProps) {
  return <ShaderCanvas fragment={SPHERE_FRAGMENT} {...props} />;
}
