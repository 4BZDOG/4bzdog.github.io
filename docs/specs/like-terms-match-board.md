# Spec: Neon term board (Like Terms Match)

**Target repo:** `like-terms-match` · **Reference implementation:** [`src/js/scenes/terms.js`](../../src/js/scenes/terms.js) and the `.lt-*` rules in [`src/css/site.css`](../../src/css/site.css)

## Purpose

Bring the portfolio plate's look into the game: a crisp, readable, glowing term grid that tilts toward the player, colour-codes like terms, and *shows the simplification* every time a line clears. Today the game teaches matching; this makes every match also show the algebra (`3x − x + 5x = 7x`).

Use it in three places:

1. **Attract mode** on the start screen, behind the vocab cards, where the board plays itself.
2. **The equation readout** during play, on every match.
3. **Scaffolding fade**: the colour coding is the scaffold, and it fades with level.

## Visual

| Token | Value | Use |
|---|---|---|
| `--bg` | `#020206` | Board background |
| `x` | `#00f0c8` (cyan) | Terms in *x* |
| `y` | `#ff4df0` (magenta) | Terms in *y* |
| `x²` | `#ffe24d` (yellow) | Terms in *x²* |
| constant | `#7fa8ff` (blue) | Numbers |
| Equation result | `#ffe24d` | The simplified term |

**Tile.** Rounded 5px square inset 7% inside its cell. It has a 1px border in the group colour at 70%, a fill of the group colour at 10% over `#020206`, and text in the group colour with an 8px glow of the same colour. Font: JetBrains Mono 600, sized at about 42% of the tile height.

**Board.** A 6×6 grid with a faint 1px grid of `rgba(0,240,200,.06)` behind the tiles. The outer frame has a 1px cyan border at 35%, a 24px outer glow and a 30px inset glow.

**3D.** The board sits in a `perspective: 900px` stage and is rotated with `rotateX(var(--rx)) rotateY(var(--ry)) rotateZ(calc(var(--ry) * -0.4))`. At rest, `rx = 26deg` and `ry = -8deg`.

- *Pointer tilt:* `rx = clamp(26 − py·30, 6, 44)` and `ry = clamp(px·36, −22, 22)`, where `px` and `py` are the pointer offsets from the centre (−0.5 to 0.5). Ease the change with a 0.5s transition.
- *Idle drift:* after 2.5s with no pointer movement, sway `rx = 26 + 6·sin(n·0.9)` and `ry = 12·sin(n·0.55)`, stepping `n` every 700ms.
- In the real game, keep the existing right-drag rotate and use this tilt only when idle and in attract mode.

**HUD** (mono, uppercase, letter-spaced 0.12em):
- Top row: `SCORE 00420` (score in magenta), `LEVEL 2`, `SHIELDS ◆◆◆`.
- Bottom centre: the equation. It is white with a cyan glow, and the result term after `=` is yellow.
- Top right: `COMBO ×2` in yellow, shown only on cascades.

## Behaviour

States of a tile: `idle → sel → hit → gone`, plus `falling` for new tiles.

| Step | What happens | Timing |
|---|---|---|
| Select | The first tile gets `.sel`: a stronger fill and a glow in the group colour. The second tile follows. | 320ms, then 260ms |
| Swap | Both tiles translate to each other's cell using `cubic-bezier(.3,1.3,.5,1)` (a slight overshoot). | 360ms |
| Match | Every tile in a run of 3 or more gets `.hit`: scale 1.12, a solid colour fill, dark text and a double glow. The equation fades up. | Hold 620ms |
| Clear | `.gone`: scale to 0 and fade out with ease-in. | 280ms |
| Gravity | Surviving tiles slide down. New tiles start above row 0 at opacity 0, then drop into place. | 30ms setup, then 520ms |
| Cascade | Repeat Match → Gravity while runs exist. From the second pass on, show `COMBO ×n`. | – |

Positioning: each tile is absolutely positioned with `transform: translate(calc(col*100%), calc(row*100%)) scale(var(--s,1))`. Moves come from changing `--row` and `--col`, never from rebuilding the DOM.

### The equation

For a run of terms with coefficients `c₁…cₙ` in group `g`:

- Write the first term as-is, then ` + |cᵢ|g` or ` − |cᵢ|g` for each term after it.
- Hide a coefficient of 1 (`x`, not `1x`).
- Use a true minus sign (U+2212), not a hyphen.
- The result is `Σcᵢ` followed by `g`, or `0` if the sum is zero. A zero result is a good teaching moment; consider a small "They cancel!" callout.
- When several runs clear at once, show the longest.

### Scaffolding fade

Tie it to level, as the game's intro text promises:

| Level | Colour coding |
|---|---|
| 1–2 | Full colours |
| 3–4 | Group colours at 50% saturation. Borders stay coloured, text goes white. |
| 5+ | Every tile uses the neutral cyan. The student must read the pronumeral itself. |

Keep the equation readout at every level. It is the feedback loop.

## Accessibility

- Honour `prefers-reduced-motion`: no drift and no overshoot. Tiles move with 150ms linear fades instead, and attract mode shows one static board with an example equation.
- Colour is never the only cue: the pronumeral is always printed on the tile.
- Announce each simplification in an `aria-live="polite"` region, for example "3x minus x plus 5x equals 7x".

## Acceptance

- [ ] Attract mode plays itself on the start screen using real swaps (a real move finder, not scripted moves).
- [ ] Every clear shows a correct equation, including negatives and a zero result.
- [ ] Cascades show a combo counter, and the board never ends up with gaps or overlapping tiles, even when paused mid-cascade (see `tidy` at the start of the script in `terms.js`).
- [ ] Colours fade per the level table.
- [ ] The board is readable at 375px wide, with tile text no smaller than 9px.
