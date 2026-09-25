// Small helpers shared by the hero and the project scenes.

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Deterministic PRNG: the same seed always gives the same sequence. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
export const randInt = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** requestAnimationFrame loop with a clamped delta, which can be paused and resumed. */
export function createLoop(step) {
  let raf = 0;
  let last = 0;
  let running = false;
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt, now / 1000);
    if (running) raf = requestAnimationFrame(frame);
  };
  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    get running() { return running; },
  };
}

/**
 * A DPR-aware canvas that fills `host`. It is sized synchronously on creation;
 * `onResize` only fires for later size changes, so callers do their own first setup.
 */
export function makeCanvas(host, onResize) {
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const view = { canvas, ctx, w: 0, h: 0, dpr: 1 };
  const fit = (notify) => {
    // Layout size, not getBoundingClientRect: the plate's tilt transform would skew that.
    const r = { width: host.clientWidth, height: host.clientHeight };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width || !r.height) return;
    if (r.width === view.w && r.height === view.h && dpr === view.dpr) return;
    view.dpr = dpr;
    view.w = r.width;
    view.h = r.height;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (notify) onResize?.(view.w, view.h);
  };
  fit(false);
  new ResizeObserver(() => fit(true)).observe(host);
  return view;
}

/**
 * Timers that can all be cancelled at once. DOM scenes run their animation as an
 * async script; stop() makes every pending sleep() reject so the script unwinds.
 */
export function createScript(run) {
  let generation = 0;
  const STOP = Symbol('stop');
  return {
    start() {
      const id = ++generation;
      const sleep = (ms) =>
        new Promise((resolve, reject) => setTimeout(() => (id === generation ? resolve() : reject(STOP)), ms));
      const alive = () => id === generation;
      run({ sleep, alive }).catch((err) => {
        if (err !== STOP) console.error(err);
      });
    },
    stop() {
      generation++;
    },
  };
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
