# Voice Agents

A single-page demo of a voice-agent UI with seven WebGL visualizer styles built on [OGL](https://github.com/oframe/ogl). The repo splits into two layers:

- **Engine** (`app/components/visualizations/`): the seven visualizers, a shared shader-canvas renderer, the conversational state model, and the full-HSV colour model. Self-contained and portable: it needs only `react` and `ogl`, with no dependency on Next.js, global CSS, fonts, or build-time shader loaders.
- **Demo shell** (the rest of `app/`): a simulated iPhone or resizable desktop window, a lightweight chat and voice flow, and a settings panel for trying every parameter.

For the full specification (parameter API, state model, animation catalog, and native runtime paths for iOS, Android, Flutter, and React Native), see [docs/voice-agent-handoff.md](docs/voice-agent-handoff.md).

## Visualizers

- **Glow**: a soft, airy globe with slow waves drifting inside; the background shows through. Selected first on load.
- **Orb**: a flat disc of flowing, domain-warped liquid colour (Siri-style) with a soft sheen and tight halo. A single colour lets the background breathe through.
- **Sphere**: a glossy liquid sphere, bump-mapped with flowing colour that ripples and bulges for a 3D feel when speaking. Drag or swipe to spin it.
- **Ring**: a circle whose rim breaks into travelling peaks that grow when the agent speaks.
- **Bars**: eight fixed bars that rest as dots when quiet and rise with a flowing gradient when the agent speaks.
- **Aura**: overlapping colour strands that flow and stretch, blurred by depth for a layered, 3D look.
- **Wave**: a single waveform line that fades out at each edge, flatlining when idle and peaking (with natural pauses) when speaking.

Every visualizer is driven from the outside by the same props: a conversational **state** (ready, connecting, listening, thinking, speaking), a palette of up to five full-HSV **colors**, an **expressivity** multiplier for how lively the motion is, a **dark** theme flag, and live **tap / hover / mic / drag** inputs. Size belongs to the host: the components fill their parent and stay centred at any size.

## Embedding the engine

Copy `app/components/visualizations/` plus `app/components/color.ts` (the folder imports it) into any React app and install `ogl`:

```bash
npm install ogl
```

The components carry no intrinsic size; give the parent explicit dimensions.

```tsx
import { Orb } from "./components/visualizations";

<div style={{ width: 320, height: 320 }}>
  <Orb colors={[{ h: 252, s: 0.88, v: 1 }]} running state="speaking" dark={false} />
</div>
```

See [app/components/visualizations/README.md](app/components/visualizations/README.md) for the prop table, and [docs/voice-agent-handoff.md](docs/voice-agent-handoff.md) for how every prop maps to shader uniforms.

## The demo shell

- **Chat**: sending a message drops into a message view; the visualizer shrinks to a compact presence at the top, the agent thinks for a moment and types its reply, and a pencil button starts a new conversation. Messages fade into frosted gradients as they scroll.
- **Voice**: tapping the mic switches the composer to a live, WhatsApp-style scrolling waveform driven by the microphone (with a procedural fallback when no mic is available, e.g. on an insecure origin). The active visualizer reacts to the real mic level.
- **Colour**: full HSV end to end, so any brand colour, including muted, pastel, or dark tones, renders true rather than being forced vivid. Each swatch opens a picker with a hue wheel, a saturation/value square, a hex input, and preset swatches (ten evenly spaced hues plus black and white); a popover on desktop, an iOS-style sheet on mobile. **Shuffle** generates a harmonised palette from classic colour schemes. The default colour is Stream blue (`#005FFF`).
- **Themes and frames**: light and dark themes that follow the OS, with a manual toggle that a later OS change overrides; everything cross-fades on toggle. A desktop/mobile preview toggle with a resizable desktop window; on desktop the controls live in a collapsible left side panel with live style thumbnails. An iOS-style settings sheet on mobile, revealed by scrolling. Respects `prefers-reduced-motion`.

## Run

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build
npm start      # serve the production build
```

No environment variables are required. The included `vercel.json` makes a default Vercel project deploy with zero configuration.

Built with Next.js (App Router), React, the Geist font, and Phosphor icons.
