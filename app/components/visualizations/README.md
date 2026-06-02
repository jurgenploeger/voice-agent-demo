# Voice-agent visualizations

Three self-contained WebGL visualizations for a voice agent's conversational
state — **Orb** (liquid sphere), **Wave** (reactive bars), and **Aura** (bottom
glow). They're driven entirely from the outside: you set the state and palette,
the component renders.

## Install

```bash
npm install ogl
```

`react` and `ogl` are the only runtime dependencies. There is **no** dependency
on Next.js, global CSS, fonts, or build-time shader loaders — every shader is an
inline string in `shaders.ts`, and the simplex-noise routine is pasted inline.

## Usage

```tsx
import { Orb, type AgentState } from "./visualizations";

function Example({ state }: { state: AgentState }) {
  return (
    // The component fills its parent and has NO intrinsic size — give the
    // parent explicit dimensions (or pass `style`/`className`).
    <div style={{ width: 320, height: 320 }}>
      <Orb hues={[252]} running state={state} dark={false} />
    </div>
  );
}
```

`Wave` and `Aura` take the identical props.

## Props (`VisualizationProps`)

| Prop        | Type                | Notes                                                            |
| ----------- | ------------------- | ---------------------------------------------------------------- |
| `hues`      | `number[]`          | 1–3 hues in degrees (0–360). Lerped internally for smoothness.   |
| `running`   | `boolean`           | Animate (RAF on) vs. hold the last frame. Only the visible one.  |
| `state`     | `AgentState`        | `"idle" \| "connecting" \| "listening" \| "thinking" \| "speaking"`. |
| `dark`      | `boolean`           | Theme flag — tunes the halo (clean on light, glow on dark).      |
| `className` | `string?`           | Forwarded to the wrapper, for sizing/positioning.                |
| `style`     | `CSSProperties?`    | Forwarded to the wrapper; overrides the `100%/100%` fill default.|
| `fallback`  | `ReactNode?`        | Rendered if WebGL is unavailable. Defaults to a short message.   |

### Driving state from your agent

`state` is a plain prop — wire it to your agent's lifecycle (e.g. a Stream call
state) and the visualization crossfades between motion patterns automatically.
The motion/appearance for each state lives in `STATE_PARAMS` (`states.ts`); the
human-readable labels used by the demo's controls are **not** bundled here (they
live in the demo's `stateLabels.ts`).

## Notes

- `ShaderCanvas.tsx` carries a `"use client"` directive for Next.js App Router.
  It's an inert string literal in plain React / Vite, so it does no harm there.
- All three share one engine (`ShaderCanvas`); copy the whole folder, not a
  single file.
- If you publish this as a package, declare `react` and `ogl` as
  `peerDependencies`.
