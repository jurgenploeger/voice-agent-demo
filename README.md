# Voice Agents

A single-page demo of a voice-agent UI inside a simulated iPhone (or a resizable
desktop window), with seven WebGL visualizer styles built on
[OGL](https://github.com/oframe/ogl), plus a lightweight chat and voice flow.

- **Glow**: a soft, airy globe with slow waves drifting inside; the background
  shows through.
- **Orb**: a flat disc of flowing, domain-warped liquid colour (Siri-style) with
  a soft sheen and tight halo. A single colour lets the background breathe
  through.
- **Sphere**: a glossy liquid sphere, bump-mapped with flowing colour that
  ripples and bulges for a 3D feel when speaking.
- **Ring**: a circle whose rim breaks into travelling peaks that grow when the
  agent speaks.
- **Bars**: eight fixed bars that rest as dots when quiet and rise with a
  flowing gradient when the agent speaks.
- **Aura**: overlapping colour strands that flow and stretch, blurred by depth
  for a layered, 3D look.
- **Wave**: a single waveform line that fades out at each edge, flatlining when
  idle and peaking (with natural pauses) when speaking.

Each visualizer reacts to a conversational **state** (ready, connecting,
listening, thinking, speaking), a palette of up to five colours, a **size**
control, and an **expressivity** slider that scales how much the visual moves.
The visual stays centred at any size. Glow is selected first on load, and a
reset button appears whenever any setting differs from the defaults.

## Chat & voice

- Sending a message drops into a **message view**: the visualizer shrinks to a
  compact presence at the top, the agent thinks for a moment and types its
  reply, and a pencil button starts a new conversation. Messages fade into
  frosted gradients as they scroll.
- Tapping the mic switches the composer to **voice mode** with a live,
  WhatsApp-style scrolling waveform driven by the microphone (with a procedural
  fallback when no mic is available, e.g. on an insecure origin). The speaking
  animation reacts to the real mic level.

## Colour

Colours use full **HSV**, so any brand colour, including muted, pastel, or dark
tones, renders true rather than being forced vivid. Each colour is a **swatch**;
tapping one opens a picker with a hue wheel, a saturation/value square, a hex
input, and preset swatches (ten evenly spaced hues plus black and white). It is
a popover on desktop and an iOS-style sheet on mobile. **Shuffle** generates a
harmonised palette. The default colour is Stream blue (`#005FFF`).

## Other

- Light and dark themes that follow the OS, with a manual toggle that a later OS
  change overrides. Light mode uses a slate palette. Everything cross-fades on
  toggle.
- A desktop / mobile preview toggle, with a resizable desktop window. On
  desktop the controls live in a collapsible left side panel with live style
  thumbnails that track the current state, palette, and theme.
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
