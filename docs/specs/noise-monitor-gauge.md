# Spec: Creature gauge (Classroom Noise Monitor)

**Target repo:** `classroom-noise-monitor` · **Reference implementation:** [`src/js/scenes/noise.js`](../../src/js/scenes/noise.js)

## Purpose

Replace the current meter's centrepiece with a single instrument that reads from across the room:

- a 270° level arc
- a spectrum ring around it
- a creature that reacts to the noise
- a big dB number

Around the main instrument sit a thermometer and a 10-second history sparkline. It is designed for **Wall / Projector Display** first; the standard view is the same instrument, smaller.

## Layout

Everything scales from `R = min(width, height) × 0.33`, centred at `(w/2, h/2)`.

| Element | Geometry |
|---|---|
| Spectrum ring | 72 radial bars around the full circle, starting at `1.12R`. Each is `0.06R + amp·0.42R` long and `max(1.5px, 0.028R)` wide, with round caps. |
| Gauge track | Arc of radius `R` from 135° to 405°, line width `0.075R`, stroke `rgba(255,255,255,.07)` |
| Level arc | Same arc, drawn to the current level, in the zone colour with a 16px glow of the same colour |
| Threshold ticks | Short radial marks at 0.86R–0.93R for the Quiet (amber) and Alert (red) thresholds |
| Creature | Circle of radius `0.44R`, centred `0.14R` above the middle |
| dB number | JetBrains Mono 600 at `0.26R`, placed `0.68R` below the centre, with a smaller "dB" suffix at 60% opacity |
| Status | Mono 600, in the zone colour, at `1.0R` below the centre: `NICE AND CALM`, `GETTING LOUD` or `TOO LOUD!` |
| Thermometer | At the left edge. Only shown when the width is over 380px. |
| Sparkline | At the top right: the last 10s sampled at 16 Hz, with a dashed alert line. Only shown when the width is over 480px. |

## Colour

| Zone | Level | RGB |
|---|---|---|
| Quiet | below the Quiet threshold | `123,228,149` |
| Warning | between the thresholds | `255,200,87` |
| Alert | at or above the Alert threshold | `255,107,107` |

Background: a radial gradient from `#1a2233` to `#0c111c`. Each spectrum bar takes the zone colour of its *own* amplitude, so the ring shows warm tips even while the overall level is calm.

## The creature

Draw it all with canvas paths; no image assets.

- **Body:** a radial gradient from the zone colour +60 at the top-left to the zone colour ×0.7 at the edge, with a glow of the zone colour at 60% and blur `0.5r`.
- **Antennae:** two quadratic curves ending in balls of radius `0.1r`. Their sway is `sin(t·3 ± 1) × 0.08r × (1 + level·2)`, so they wiggle more as the room gets louder.
- **Eyes:** white ellipses. The pupils wander as `look = 0.8·sin(0.7t) + 0.2·sin(1.9t)`. The creature blinks for 140ms every 2.2–5s.
- **Expression by zone:**
  - Quiet: a smile arc and pink cheeks.
  - Warning: a flat line.
  - Alert: an open "O" mouth that grows with level, smaller pupils, eyes open wider (×1.2), and the whole body shaking at `sin(40t)·0.03r`.
- **Bob:** `sin(2.4t)·0.04r` at all times.

## Motion and signal

- **Level smoothing:** fast attack, slow release: `level += (target − level) · clamp(dt·(rising ? 7 : 2.5))`. This avoids flicker while still catching sudden noise.
- **Spectrum smoothing:** each bar moves toward its target at `dt·12`.
- **Alert wash:** after 0.3s continuously at or above Alert, draw a red radial vignette at alpha `0.18 + 0.1·sin(10t)`.
- **Microphone:**
  - Level: take the RMS of the time-domain data (`fftSize 512`, smoothing 0.6) and map it to `clamp(100 + 20·log10(rms), 20, 120)`. This matches the app's relative 20–120 scale.
  - Bars: bar `i` reads frequency bin `floor((i/72)^1.6 × bins × 0.7)`. This log-ish spacing keeps the bars around the voice range busy.

## Reuse in the app

- The gauge is a pure draw function of `(level, bars[], history[], thresholds, time)`. Feed it the app's existing analyser and threshold state. It must not own the microphone.
- Take the zone thresholds from the active preset, not hard-coded 60/75.
- **Demo mode**, for the app's landing screen before the mic is allowed:
  - A murmur of `47 + 7sin(0.23t) + 4sin(0.71t+1.3) + 3sin(2.3t)`.
  - A burst of +30 dB lasting 1.2–2.6s, every 5–10s.
  - This lets teachers see the tool working before granting microphone access.
- Render loop: run only while visible, pause on `visibilitychange`, and cap the canvas DPR at 2.

## Accessibility and privacy

- Under `prefers-reduced-motion`: no shake, bob or antenna sway, and no vignette pulse (use a steady tint instead). The level arc and number still update.
- Mirror the status text into an `aria-live="polite"` region, but only when the zone changes.
- Keep the existing promise: audio is analysed in memory and never recorded. Release the mic tracks whenever monitoring stops or the view is hidden.

## Acceptance

- [ ] At 3m from a projector, the zone is readable from the colour and the creature's face alone.
- [ ] The level arc, spectrum and creature agree on the zone at all times.
- [ ] The thermometer and sparkline hide gracefully on narrow screens.
- [ ] The whole instrument runs at 60fps on a school Chromebook (profile it: one canvas, no per-frame allocations).
