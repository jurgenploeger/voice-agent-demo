# Voice Agents

A single-page demo of a voice-agent UI inside a simulated iPhone (or a resizable
desktop window), with six WebGL visualizer styles built on
[OGL](https://github.com/oframe/ogl), plus a lightweight chat and voice flow.

- **Glow**: a soft, airy globe with rounded edges and slow waves drifting
  inside, the background showing through.
- **Orb**: a flat disc filled with a flowing, domain-warped liquid colour
  gradient (Siri-style) with a soft sheen and a tight halo. A single-colour orb
  opens its interior up so the background gently breathes through.
- **Sphere**: a glossy liquid sphere, a fixed circle bump-mapped with flowing
  colour, whose ripples bulge out over the surface for a 3D feel when speaking.
- **Ring**: a circle whose rim breaks into a few bespoke travelling peaks that
  grow when the agent speaks.
- **Aura**: a fluid band of overlapping colour strands that flow and stretch,
  each blurred by its depth for a layered, 3D look.
- **Wave**: a single waveform line that fades into the background at each edge.
  It flatlines when idle and peaks (with natural pauses) when speaking.

Each visualizer reacts to a conversational **state** (ready, connecting,
listening, thinking, speaking), a palette of up to three colours, and a **size**
control. The visual stays centred on the screen at any size. Glow is selected
first on load.

## Chat & voice

- Sending a message drops into a **message view**: the visualizer morphs into a
  compact presence at the top, the agent replies, and a pencil button starts a
  new conversation. Messages fade into frosted gradients as they scroll under
  the agent and behind the composer.
- Tapping the mic puts the composer into a **voice mode** with a live,
  WhatsApp-style scrolling waveform driven by the microphone (with a procedural
  fallback when no mic is available, e.g. on an insecure origin).

## Colour

Colours are full **HSV** (hue, saturation, and lightness), so any brand colour,
including muted, pastel, or dark tones, renders true instead of being forced to
a fixed vivid version. Each colour is a **swatch**; tapping one opens a colour
picker with a hue wheel, a saturation/value square, a hex input, and a row of
preset swatches (ten evenly spaced hues plus black and white). The picker is a
popover on desktop and a stacked, iOS-style sheet on mobile. **Shuffle**
generates a harmonised palette.

## Other

- Light and dark themes that follow the OS, with a manual toggle; a later OS
  change always takes back over. Light mode uses a slate palette (a slate/50
  page behind a white device screen). Everything cross-fades together on toggle.
- A desktop / mobile preview toggle, with a resizable desktop window.
- An iOS-style settings sheet on mobile, revealed by scrolling.
- Respects `prefers-reduced-motion`.

The visualizers are self-contained and portable: drop any of them into a plain
React app that has `ogl` installed (no Next.js, global CSS, or fonts required).

```tsx
import { Orb } from "./components/visualizations";

<div style={{ width: 320, height: 320 }}>
  <Orb colors={[{ h: 252, s: 0.88, v: 1 }]} running state="speaking" dark={false} />
</div>
```

Built with Next.js (App Router), React, the Geist font, and Phosphor icons.

```bash
npm install
npm run dev
```
