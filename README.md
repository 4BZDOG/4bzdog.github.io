# 4bzdog.github.io

The landing page for everything on [github.com/4BZDOG](https://github.com/4BZDOG): a catalogue of the games, classroom tools and study guides, each with its own live, interactive plate.

**Live:** https://4bzdog.github.io/

## How it works

```
projects.json          hand-written copy for each project (title, blurb, features, accent colour, scene)
data/stats-snapshot.json   last known GitHub numbers, used if the API can't be reached
scripts/build.mjs      merges the two, renders src/index.html → dist/
src/                   the page: HTML template, CSS, JS, one scene module per project
.github/workflows/     builds and deploys to GitHub Pages
```

The build is plain Node (20+) with no dependencies. It pulls each repo's commit count, start date and last push from the GitHub API and writes them into the page, so the page never goes stale by hand.

GitHub Actions rebuilds and deploys the site:

- on every push to `main`
- early every morning (Sydney time), so the stats stay current
- whenever you press **Run workflow** on the Actions tab

**New repos show up by themselves.** Any public repo that isn't in `projects.json` appears in a *Lab* chapter with its GitHub description and a generated constellation. To give it a proper plate, add an entry to `projects.json`.

> GitHub pauses scheduled workflows in a public repo after 60 days with no commits. If the daily rebuild stops, push any change (or run the workflow by hand) to restart it.

## Editing

| To change… | Edit |
|---|---|
| A project's words, colour, order or button text | `projects.json` |
| Chapter titles and blurbs (Play / Work / Lab) | `groups` in `projects.json` |
| The hero line, About section or footer | `src/index.html` |
| Look and feel | `src/css/site.css` |
| A project's animated plate | `src/js/scenes/<scene>.js` |

To hide a repo from the page completely, add its name to `exclude` in `projects.json`.

Each project entry looks like this:

```json
{
  "repo": "trusscraft",
  "group": "play",
  "title": "TrussCraft",
  "kind": "Game",
  "subject": "Physics · Statics",
  "scene": "truss",
  "accent": "#5aa9ff",
  "tagline": "Build a bridge. Run the load test. Watch the forces.",
  "description": "…",
  "features": ["…"],
  "stack": ["Vanilla JS", "Canvas"],
  "cta": "Play TrussCraft",
  "caption": "What the animated plate is showing.",
  "alt": "A text description of the plate for screen readers."
}
```

`url` is optional. It defaults to the repo's GitHub Pages address.

### Scenes

Every plate is a small module in `src/js/scenes/` that exports `(host, { reduced, accent, seed }) => ({ start, stop })`. The page loads a scene only when its plate scrolls near the screen, and pauses it again when it scrolls away or the tab is hidden. When the visitor prefers reduced motion, `reduced` is `true` and every scene draws a single still frame instead of animating.

| Scene | Plate |
|---|---|
| `truss` | Spring-mass Pratt truss with a truck crossing it; members coloured by axial force; draggable joints |
| `terms` | A working match-three engine on a tilting 3D board, simplifying each line of like terms |
| `noise` | Gauge, creature and spectrum ring on a simulated classroom, with opt-in live microphone |
| `band6` | A typed HSC answer marked in red pen, capped at Band 3, then rewritten to Band 5 |
| `maths` | Seeded worksheet generator with a rolling seed odometer and SVG diagrams |
| `puzzle` | Word search generated from a vocab list, then solved word by word |
| `softeng` | Linear search traced through a flowchart, NESA pseudocode and an array |
| `constellation` | Default for new repos: a constellation seeded from the repo name |

## Local preview

```bash
npm run dev          # build from the snapshot (no network) and serve at http://localhost:8080
npm run build        # build with live GitHub stats
npm run snapshot     # build with live stats and refresh data/stats-snapshot.json
```

No `npm install` is needed. The scripts use only Node's standard library.
