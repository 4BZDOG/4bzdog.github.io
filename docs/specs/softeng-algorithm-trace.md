# Spec: Algorithm trace diagrams (HSC Software Engineering Notes)

**Target repo:** `HSC_SoftwareEngineering` · **Reference implementation:** [`src/js/scenes/softeng.js`](../../src/js/scenes/softeng.js)

## Purpose

The notes already draw flowcharts in Mermaid, but they are static. This spec adds a reusable **trace** component: the flowchart, the NESA-style pseudocode and the data all step together, so students can watch an algorithm run. It goes alongside the existing Mermaid diagrams on the Programming Fundamentals and Software Automation pages rather than replacing them.

Algorithms to ship first:
1. linear search
2. binary search
3. bubble sort
4. a counting loop with an accumulator

## Anatomy

```
┌───────────────────────────┬──────────────────────────┐
│  Flowchart (SVG)          │  Pseudocode (pre)        │
│  token moves along edges  │  current line highlighted│
├───────────────────────────┴──────────────────────────┤
│  Data strip: array cells, pointer, variables, result │
└──────────────────────────────────────────────────────┘
│  Controls: ◀ Step · ▶ Play/Pause · Step ▶ · Reset · target input │
```

Below a container width of 480px, hide the pseudocode panel and let the flowchart take the full width. Use container queries, not viewport media queries, so the component works in the sidebar layout too.

## Visual

This matches the site's "written to be read" paper style.

| Token | Value |
|---|---|
| Paper | `#efe7d6` |
| Node fill | `#fbf7ee` |
| Ink | `#1c1a17`, strokes 1.4px, edges 1.2px with filled arrow markers |
| Active node / line / cell | `#d9d1ff`, code highlight `#5b4bdb` with white text |
| Yes / found | `#bff0cf` node, `#8fe0ad` cell |
| No / not found | `#ffd2cf` |
| Visited cell | `#ebe3d2` with muted text `#8a8273` |
| Token | A 5px circle in `#5b4bdb` with a 4px glow of the same colour |
| Edge labels | *yes* / *no* in Fraunces italic, `#6c6558` |

**Shapes** follow the NESA flowchart conventions:
- Terminators are stadiums (radius h/2).
- Processes are rectangles (radius 3).
- Decisions are diamonds.
- Node text is JetBrains Mono 12px, centred.
- Loop-back edges go out to the left margin and re-enter the decision from the left.

**Pseudocode** follows NESA style: `BEGIN`/`END`, `WHILE … ENDWHILE`, `IF … THEN … ENDIF`, `RETURN`. Keywords are in lavender `#c9b8ff` on the dark `#1c1a17` panel.

## Data model

The component is driven entirely by data, so a new algorithm needs no new code:

```js
{
  nodes: { id: { x, y, w, h, shape: 'stadium'|'rect'|'diamond', text, line } }, // line = pseudocode index
  edges: { 'from-to': 'SVG path d' },
  labels: [['yes', x, y], …],
  code: [['BEGIN', ' linearSearch(A, target)'], …],   // keyword tokens are ALL CAPS strings
  data: { A: [7, 3, 9, 4, 12, 5], target: 4 },
  // A generator that yields one step at a time.
  *run(data) {
    yield { node: 'start' };
    yield { node: 'init', vars: { i: 0 } };
    // …
    yield { node: 'found', tone: 'yes', cells: { 3: 'hit' }, result: 'RETURN 3' };
  }
}
```

Each yielded step may set:
- `node`: the node to highlight; its `line` also highlights the pseudocode.
- `tone`: `on`, `yes` or `no`.
- `cells`: a map from index to `on`, `seen` or `hit`.
- `vars`: variables to show in the data strip, such as `i = 2`.
- `result`: the text for the result pill.

The token travels along `edges[prev-next]` before each step, over about 22ms per 9px of path, using `getPointAtLength`.

## Controls and behaviour

- **Autoplay** is on when the diagram scrolls into view (IntersectionObserver) and pauses when it leaves the screen or the tab is hidden. Default pacing: 420–600ms per step, with a 2s hold on the result.
- **Step back** needs history: keep an array of `{step, stateSnapshot}` and replay it. Step back is essential for revision, so students can ask "why did it go *no* there?".
- **Target input:** students type a value and the trace restarts. Include an absent value in the examples so the `RETURN −1` path gets seen.
- **Keyboard:** `←` / `→` step, `Space` plays or pauses, `R` resets. Every control is a real `<button>` with a label.
- **Counters:** show a comparison counter (`Comparisons: 4`). It is the bridge to the Big-O discussion in the notes.

## Accessibility

- The SVG is `aria-hidden`. A visually hidden `aria-live="polite"` region narrates each step, for example "Compare A[2] = 9 with target 4: no. Increment i."
- Under `prefers-reduced-motion`: no token travel. Highlights jump between nodes and autoplay is off by default (the step buttons still work).
- Highlight contrast must be at least 4.5:1 for the text inside it. `#5b4bdb` with white passes.

## Acceptance

- [ ] Linear search, binary search, bubble sort and the accumulator loop all run from data alone, with no algorithm-specific rendering code.
- [ ] The flowchart node, the pseudocode line and the data strip are always in sync, including after stepping back.
- [ ] It works at 360px wide, with the pseudocode hidden and the flowchart text at 8px or larger.
- [ ] No Mermaid dependency is needed at runtime for traced diagrams; the static Mermaid diagrams stay as they are.
