# Voice Agents

A single-page demo of a voice-agent UI inside a simulated iPhone, with three
WebGL visualizer styles (Orb / Wave / Pulse) built on [OGL](https://github.com/oframe/ogl).

- **Orb** — a fixed glassy circle with a flowing, domain-warped colour mesh
  (Siri-style), a translucent light-source spot, and a tight halo.
- **Wave** — rounded, summed-sine bars with a drifting envelope.
- **Pulse** — staggered expanding rings + a breathing centre dot.

Each visualizer reacts to a conversational **state** (ready, connecting,
listening, thinking, speaking) and a colour palette of up to three harmonised
hues. Light/dark themes, a hue + hex colour picker, and an iOS-style settings
sheet on mobile.

Built with Next.js (App Router), React, the Geist font, and Phosphor icons.

```bash
npm install
npm run dev
```
