# Voice Agents

A single-page demo of a voice-agent UI inside a simulated iPhone, with five
WebGL visualizer styles built on [OGL](https://github.com/oframe/ogl).

- **Orb**: a fixed glassy circle with a flowing, domain-warped colour mesh
  (Siri-style), a translucent light-source spot, and a tight halo.
- **Glow**: a soft, airy globe with rounded edges and slow waves drifting
  inside, the background showing through.
- **Ring**: a circle whose rim breaks into a few bespoke travelling peaks that
  grow when the agent speaks.
- **Aura**: a fluid U-shaped glow pooling at the bottom of the screen, behind
  the composer.
- **Wave**: a single waveform line that fades into the background at each edge.
  It flatlines when idle and peaks (with natural pauses) when speaking.

Each visualizer reacts to a conversational **state** (ready, connecting,
listening, thinking, speaking), a palette of up to three colours, and a **size**
control. The visual stays centred on the screen at any size.

## Colour

Colours are full **HSV** (hue, saturation, and lightness), so any brand colour,
including muted, pastel, or dark tones, renders true instead of being forced to
a fixed vivid version. Each colour is a **swatch**; tapping one opens a colour
picker with a hue wheel, a saturation/value square, a hex input, and a row of
preset swatches (ten evenly spaced hues plus black and white). The picker is a
popover on desktop and a stacked, iOS-style sheet on mobile. **Shuffle**
generates a harmonised palette.

## Other

- Light and dark themes that follow the OS and can be toggled manually. Light
  mode uses a slate palette (a slate/50 page behind a white device screen).
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
