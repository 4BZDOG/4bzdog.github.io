// The toybox: every project is a block in a tiny 2D rigid-body world. Drag them, fling
// them, shake the box, or tap one to jump to its plate.
//
// Engine: oriented boxes, SAT with reference/incident face clipping for contact points,
// sequential impulses with warm starting (Box2D-lite style), Baumgarte position
// correction, and a soft mouse joint for dragging. The floor, walls and ceiling are just
// thick static boxes. The whole world sleeps once it is calm, which stops the loop.
//
// Touch and scrolling: the stage has `touch-action: pan-y`, so the browser always owns
// vertical swipes and the page scrolls normally, even when a swipe starts on a block. A
// touch on a block only becomes a drag when (a) its first real movement is mostly
// horizontal (pan-y means the browser will not scroll that gesture anyway), or (b) the
// finger rests on the block for a moment first (a long press). Once a drag has begun, a
// non-passive touchmove listener calls preventDefault so the page stays put. A touch on
// empty stage space is ignored entirely. Mouse and pen grab straight away.
import { createLoop, clamp, makeCanvas, el } from './lib.js';

const G = 2600;                 // gravity, px/s²
const STEP = 1 / 120;           // fixed physics step
const ITERATIONS = 10;
const BETA = 0.25, SLOP = 0.5;  // position correction (split impulse)
const FRICTION = 0.55, BOUNCE = 0.22, BOUNCE_MIN = 140;
const IMPACT = 520;             // px/s of closing speed before sparks fly
const WALL = 400;               // thickness of the static walls
const CLICK_MOVE = 6, CLICK_MS = 350, LONG_PRESS = 230;

const ICONS = {
  shake: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5.5 4 3.5M2 10.5l2 2M14 5.5l-2-2M14 10.5l-2 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="5.5" y="4" width="5" height="8" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(-12 8 8)"/></svg>',
  reset: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5M4.4 2v2.8h2.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* ------------------------------------------------------------------ geometry */

let nextId = 1;
function makeBody(x, y, hw, hh, isStatic) {
  const b = { id: nextId++, x, y, a: 0, c: 1, s: 0, vx: 0, vy: 0, w: 0, bx: 0, by: 0, bw: 0, hw, hh, invM: 0, invI: 0, entered: isStatic, squash: 0, squashA: 0, cool: 0 };
  if (!isStatic) setSize(b, hw, hh);
  return b;
}
function setSize(b, hw, hh) {
  const m = hw * hh * 4 / 1000;
  b.hw = hw; b.hh = hh;
  b.invM = 1 / m;
  b.invI = 3 / (m * (hw * hw + hh * hh));
}
const setAngle = (b, a) => { b.a = a; b.c = Math.cos(a); b.s = Math.sin(a); };
// Half extents of the axis-aligned box around a rotated body.
const extX = (b) => Math.abs(b.c) * b.hw + Math.abs(b.s) * b.hh;
const extY = (b) => Math.abs(b.s) * b.hw + Math.abs(b.c) * b.hh;

// Corners run (-,-) (+,-) (+,+) (-,+), so face k (outward normals +x, +y, -x, -y in the
// body's frame) spans corners k+1 and k+2.
const CX = [-1, 1, 1, -1], CY = [-1, -1, 1, 1];
function corners(b, out) {
  for (let i = 0; i < 4; i++) {
    const ex = CX[i] * b.hw, ey = CY[i] * b.hh;
    out[i * 2] = b.x + b.c * ex - b.s * ey;
    out[i * 2 + 1] = b.y + b.s * ex + b.c * ey;
  }
}
const nX = (b, k) => (k === 0 ? b.c : k === 1 ? -b.s : k === 2 ? -b.c : b.s);
const nY = (b, k) => (k === 0 ? b.s : k === 1 ? b.c : k === 2 ? -b.s : -b.c);
const ext = (b, k) => (k & 1 ? b.hh : b.hw);

const CA = new Float64Array(8), CB = new Float64Array(8);
let faceSep = 0, faceIdx = 0;
// Largest separation of `pts` along any face normal of `b` (SAT for one box's axes).
function bestFace(b, pts) {
  faceSep = -Infinity;
  for (let k = 0; k < 4; k++) {
    const nx = nX(b, k), ny = nY(b, k);
    let min = Infinity;
    for (let i = 0; i < 8; i += 2) min = Math.min(min, (pts[i] - b.x) * nx + (pts[i + 1] - b.y) * ny);
    const sep = min - ext(b, k);
    if (sep > faceSep) { faceSep = sep; faceIdx = k; }
  }
}

/** Box-box contacts: SAT, then clip the incident edge against the reference face. */
function collide(A, B, out) {
  corners(A, CA); corners(B, CB);
  bestFace(A, CB); const sA = faceSep, fA = faceIdx;
  if (sA > 0) return;
  bestFace(B, CA); const sB = faceSep, fB = faceIdx;
  if (sB > 0) return;
  // Prefer A's face unless B's is clearly better, so the choice does not flicker.
  const flip = sB > 0.95 * sA + 0.5;
  const R = flip ? B : A, I = flip ? A : B, f = flip ? fB : fA, CI = flip ? CA : CB;
  const nx = nX(R, f), ny = nY(R, f), tx = -ny, ty = nx;
  let kI = 0, minD = Infinity;
  for (let k = 0; k < 4; k++) {
    const d = nX(I, k) * nx + nY(I, k) * ny;
    if (d < minD) { minD = d; kI = k; }
  }
  const i1 = ((kI + 1) % 4) * 2, i2 = ((kI + 2) % 4) * 2;
  const x1 = CI[i1], y1 = CI[i1 + 1], x2 = CI[i2], y2 = CI[i2 + 1];
  const fx = R.x + nx * ext(R, f), fy = R.y + ny * ext(R, f);
  const side = ext(R, f + 1);
  const s1 = (x1 - fx) * tx + (y1 - fy) * ty, s2 = (x2 - fx) * tx + (y2 - fy) * ty;
  let u0 = 0, u1 = 1;
  const ds = s2 - s1;
  if (Math.abs(ds) < 1e-9) {
    if (s1 < -side || s1 > side) return;
  } else {
    const ua = (-side - s1) / ds, ub = (side - s1) / ds;
    u0 = Math.max(0, Math.min(ua, ub)); u1 = Math.min(1, Math.max(ua, ub));
    if (u0 > u1) return;
  }
  const sgn = flip ? -1 : 1;
  for (let e = 0; e < 2; e++) {
    const u = e ? u1 : u0;
    const px = x1 + (x2 - x1) * u, py = y1 + (y2 - y1) * u;
    const sep = (px - fx) * nx + (py - fy) * ny;
    if (sep > 0.5) continue;
    out.push({ A, B, nx: nx * sgn, ny: ny * sgn, px, py, depth: -sep, key: `${A.id}:${B.id}:${+flip}${f}${kI}${e}`, pn: 0, pt: 0 });
  }
}

/* ------------------------------------------------------------------ colour */

const probe = document.createElement('canvas').getContext('2d');
function rgba(color, alpha) {
  probe.fillStyle = '#ece6d8';
  probe.fillStyle = color; // the browser normalises any CSS colour to #rrggbb
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(probe.fillStyle);
  const [r, g, b] = m ? m.slice(1).map((h) => parseInt(h, 16)) : [236, 230, 216];
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ------------------------------------------------------------------ the component */

export default async function toybox({ reduced }) {
  const stage = document.querySelector('.toybox-stage');
  if (!stage) return;
  let items = [];
  try { items = JSON.parse(stage.dataset.toybox || '[]'); } catch { return; }
  if (!items.length) return;

  // A real list of links for keyboard and screen-reader users; the canvas is decoration.
  const list = el('ul', 'toybox-links visually-quiet');
  list.setAttribute('aria-label', 'Projects in the toybox');
  items.forEach((it, i) => {
    const li = el('li');
    const a = el('a', null, `${it.title} (${it.kind})`);
    a.href = `#p-${it.repo}`;
    a.addEventListener('focus', () => { focused = i; poke(bodies[i]); draw(); });
    a.addEventListener('blur', () => { focused = -1; draw(); });
    li.appendChild(a); list.appendChild(li);
  });
  stage.appendChild(list);

  // Toolbar: a live readout plus Shake and Reset (physics only).
  const bar = el('div', 'toybox-bar');
  const readout = el('p', 'toybox-readout label');
  readout.setAttribute('aria-hidden', 'true');
  bar.appendChild(readout);
  const tools = el('div', 'toybox-tools');
  const button = (name, text, label, fn) => {
    const b = el('button', `toybox-btn toybox-${name}`);
    b.type = 'button'; b.setAttribute('aria-label', label);
    b.innerHTML = `${ICONS[name]}<span>${text}</span>`;
    b.addEventListener('click', fn);
    tools.appendChild(b);
  };
  if (!reduced) {
    button('shake', 'Shake', 'Shake the toybox', () => shake());
    button('reset', 'Reset', 'Reset the toybox and drop the blocks again', () => drop());
  }
  bar.appendChild(tools);
  stage.before(bar);
  stage.classList.toggle('is-reduced', !!reduced);

  const view = makeCanvas(stage, () => { clearTimeout(resizeT); resizeT = setTimeout(relayout, 90); });
  const { canvas, ctx } = view;
  canvas.className = 'toybox-canvas'; canvas.setAttribute('aria-hidden', 'true');
  let resizeT = 0;

  // Wait (briefly) for the page's faces so the labels are measured in the right font.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('400 20px "Fraunces"'),
        document.fonts.load('500 10px "JetBrains Mono"'),
      ]).then(() => document.fonts.ready),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* fallback faces are fine */ }

  /* ---------------------------------------------------------------- blocks */

  let W = view.w, H = view.h, floorY = H - 12, scale = 1, dpr = view.dpr;
  const bodies = items.map((it) => Object.assign(makeBody(0, -1e4, 40, 20, false), { item: it, sprites: null }));
  let statics = [];
  let focused = -1, hover = null;

  // Measure every label at scale s; returns the total block area.
  function measure(s, apply) {
    let area = 0;
    for (const b of bodies) {
      let k = s;
      for (let tries = 0; tries < 4; tries++) {
        const ts = Math.max(12, 19 * k), ks = Math.max(8, 9.5 * k);
        ctx.font = `400 ${ts}px Fraunces, Georgia, serif`;
        const tw = ctx.measureText(b.item.title).width;
        ctx.font = `500 ${ks}px "JetBrains Mono", ui-monospace, monospace`;
        const kw = ctx.measureText(b.item.kind.toUpperCase()).width * 1.12;
        const pad = 14 * k;
        const w = pad * 2 + 10 * k + 12 * k + Math.max(tw, kw) + 14 * k + 14 * k;
        const h = pad * 1.7 + ts * 1.15 + 4 * k + ks;
        if (w > W * 0.86 && tries < 3) { k *= (W * 0.86) / w; continue; }
        area += w * h;
        if (apply) { b.lay = { k, ts, ks, pad, w, h }; setSize(b, w / 2, h / 2); }
        break;
      }
    }
    return area;
  }
  function chooseScale() {
    let s = clamp(W / 1000, 0.7, 1);
    const area = measure(s, false);
    const budget = W * floorY * (W < 600 ? 0.36 : 0.32);
    if (area > budget) s *= Math.sqrt(budget / area);
    return Math.max(0.55, s);
  }

  // Each block is pre-rendered (with its glow) to a sprite, cool and hot, at device pixels.
  function sprite(b, hot) {
    const { k, ts, ks, pad, w, h } = b.lay;
    const accent = b.item.accent;
    const m = Math.ceil(30 * k);
    const c = document.createElement('canvas');
    c.width = Math.ceil((w + m * 2) * dpr); c.height = Math.ceil((h + m * 2) * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr); g.translate(m, m);
    const r = 12 * k;
    const shape = () => { g.beginPath(); g.roundRect(0, 0, w, h, r); };
    // Drop shadow, then the accent glow.
    shape(); g.fillStyle = '#0b0e16';
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 14 * k; g.shadowOffsetY = 6 * k; g.fill();
    g.shadowOffsetY = 0; g.shadowColor = rgba(accent, hot ? 0.55 : 0.2); g.shadowBlur = (hot ? 26 : 14) * k; g.fill();
    g.shadowColor = 'transparent';
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1b2131'); grad.addColorStop(1, '#10141e');
    shape(); g.fillStyle = grad; g.fill();
    g.fillStyle = rgba(accent, hot ? 0.14 : 0.07); g.fill();
    g.lineWidth = 1; g.strokeStyle = rgba(accent, hot ? 0.85 : 0.42);
    g.beginPath(); g.roundRect(0.5, 0.5, w - 1, h - 1, r); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.beginPath(); g.moveTo(r, 1.5); g.lineTo(w - r, 1.5); g.stroke();
    // Glowing swatch, like the catalogue index.
    const sw = 10 * k, sy = h / 2 - sw / 2;
    g.shadowColor = rgba(accent, 0.8); g.shadowBlur = (hot ? 16 : 10) * k;
    g.fillStyle = accent; g.beginPath(); g.roundRect(pad, sy, sw, sw, 3 * k); g.fill();
    g.shadowColor = 'transparent';
    // Title and kind.
    const tx = pad + sw + 12 * k;
    const top = (h - (ts * 1.15 + 4 * k + ks)) / 2;
    g.textBaseline = 'top';
    g.fillStyle = hot ? '#fff8ea' : '#ece6d8';
    g.font = `400 ${ts}px Fraunces, Georgia, serif`;
    g.fillText(b.item.title, tx, top);
    g.fillStyle = hot ? rgba(accent, 1) : '#8d8b98';
    g.font = `500 ${ks}px "JetBrains Mono", ui-monospace, monospace`;
    if ('letterSpacing' in g) g.letterSpacing = `${(ks * 0.12).toFixed(2)}px`;
    g.fillText(b.item.kind.toUpperCase(), tx, top + ts * 1.15 + 4 * k);
    // Group mark: play is a triangle, work a square, anything else a ring.
    const ix = w - pad - 7 * k, iy = h / 2, q = 5.5 * k;
    g.strokeStyle = rgba(accent, hot ? 1 : 0.7); g.lineWidth = 1.4 * k; g.lineJoin = 'round';
    g.beginPath();
    if (b.item.group === 'play') { g.moveTo(ix - q * 0.8, iy - q); g.lineTo(ix + q, iy); g.lineTo(ix - q * 0.8, iy + q); g.closePath(); }
    else if (b.item.group === 'work') g.rect(ix - q * 0.85, iy - q * 0.85, q * 1.7, q * 1.7);
    else g.arc(ix, iy, q, 0, Math.PI * 2);
    g.stroke();
    return { c, m };
  }
  function rebuildSprites() {
    for (const b of bodies) b.sprites = [sprite(b, false), sprite(b, true)];
  }

  function buildStatics() {
    const T = WALL;
    statics = [
      makeBody(W / 2, floorY + T / 2, W / 2 + T, T / 2, true),       // floor
      makeBody(-T / 2, floorY / 2 - 2000, T / 2, floorY / 2 + 2000 + T, true), // left
      makeBody(W + T / 2, floorY / 2 - 2000, T / 2, floorY / 2 + 2000 + T, true), // right
      Object.assign(makeBody(W / 2, -T / 2, W / 2 + T, T / 2, true), { ceiling: true }),
    ];
  }

  function relayout() {
    if (!view.w || !view.h) return;
    const oldW = W || view.w;
    W = view.w; H = view.h; floorY = H - 12;
    const s = chooseScale();
    if (Math.abs(s - scale) / scale > 0.03 || Math.abs(W - oldW) > oldW * 0.03 || view.dpr !== dpr || !bodies[0].lay) {
      scale = s; dpr = view.dpr;
      measure(scale, true);
      rebuildSprites();
    }
    buildStatics();
    if (reduced) { grid(); draw(); return; }
    if (!dropped) return;
    for (const b of bodies) b.x = clamp(b.x * (W / oldW), b.hw, W - b.hw);
    wake();
  }

  /* ---------------------------------------------------------------- reduced motion */

  // A tidy, centred, wrapped grid; the stage grows if the grid needs more room.
  function grid() {
    const gap = 14 * scale, padX = 20 * scale;
    const rows = [[]];
    let x = 0;
    for (const b of bodies) {
      const w = b.hw * 2;
      if (x && x + w > W - padX * 2) { rows.push([]); x = 0; }
      rows.at(-1).push(b); x += w + gap;
    }
    const rowH = rows.map((r) => Math.max(...r.map((b) => b.hh * 2)));
    const total = rowH.reduce((a, h) => a + h, 0) + gap * (rows.length - 1);
    if (total + 64 > floorY) { stage.style.height = `${Math.ceil(total + 76)}px`; return; }
    let y = (floorY - total) / 2;
    rows.forEach((r, i) => {
      const rw = r.reduce((a, b) => a + b.hw * 2, 0) + gap * (r.length - 1);
      let x0 = (W - rw) / 2;
      for (const b of r) { b.x = x0 + b.hw; b.y = y + rowH[i] / 2; setAngle(b, 0); x0 += b.hw * 2 + gap; }
      y += rowH[i] + gap;
    });
  }

  /* ---------------------------------------------------------------- simulation */

  let contacts = [], warm = new Map();
  let visible = false, dropped = false;
  const sparks = [];
  let awake = false, quiet = 0, lastPoke = 0, acc = 0;
  let joint = null; // { b, lx, ly, tx, ty, ix, iy, ... }
  const win = { t: 0, snap: new Float64Array(bodies.length * 3) };
  function snapshot() {
    win.t = 0;
    bodies.forEach((b, i) => { win.snap[i * 3] = b.x; win.snap[i * 3 + 1] = b.y; win.snap[i * 3 + 2] = b.a; });
  }

  function poke(b) {
    if (reduced || !b || !b.lay) return;
    b.vy -= 520; b.w += (Math.random() - 0.5) * 4;
    wake();
  }
  function wake() {
    if (reduced) return;
    awake = true; quiet = 0; lastPoke = performance.now(); snapshot();
    if (visible && !document.hidden) loop.start();
  }
  function drop() {
    const order = bodies.map((b, i) => [Math.random(), i]).sort((a, b) => a[0] - b[0]);
    let y = -40;
    for (const [, i] of order) {
      const b = bodies[i];
      b.x = b.hw + Math.random() * Math.max(1, W - b.hw * 2);
      y -= b.hh * 2 + 30 * scale;
      b.y = y; b.vx = (Math.random() - 0.5) * 120; b.vy = 0; b.w = (Math.random() - 0.5) * 3;
      setAngle(b, (Math.random() - 0.5) * 0.9);
      b.entered = false;
    }
    warm.clear(); status('Dropping'); wake();
  }
  function shake() {
    for (const b of bodies) {
      b.vx += (Math.random() - 0.5) * 1100;
      b.vy -= 700 + Math.random() * 900;
      b.w += (Math.random() - 0.5) * 12;
    }
    status('Shaking'); wake();
  }

  // Impulses act on real velocities, or (pseudo) on the ones that only fix overlap.
  const REAL = ['vx', 'vy', 'w'], PSEUDO = ['bx', 'by', 'bw'];
  function applyImpulse(c, px, py, pseudo) {
    const { A, B } = c, [vx, vy, w] = pseudo ? PSEUDO : REAL;
    A[vx] -= px * A.invM; A[vy] -= py * A.invM; A[w] -= A.invI * (c.rax * py - c.ray * px);
    B[vx] += px * B.invM; B[vy] += py * B.invM; B[w] += B.invI * (c.rbx * py - c.rby * px);
  }
  function relVel(c, pseudo) {
    const { A, B } = c, [vx, vy, w] = pseudo ? PSEUDO : REAL;
    return [B[vx] - B[w] * c.rby - A[vx] + A[w] * c.ray, B[vy] + B[w] * c.rbx - A[vy] - A[w] * c.rax];
  }

  function step(dt) {
    for (const b of bodies) {
      b.vy += G * dt;
      const damp = 1 - 0.15 * dt;
      b.vx *= damp; b.vy *= damp; b.w *= 1 - 0.6 * dt;
      b.cool = Math.max(0, b.cool - dt);
    }
    // Narrow phase on every pair whose bounding boxes overlap.
    contacts = [];
    const all = bodies.concat(statics);
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      const ax = extX(A), ay = extY(A);
      for (let j = i + 1; j < all.length; j++) {
        const B = all[j];
        if (B.ceiling && !A.entered) continue;
        if (Math.abs(A.x - B.x) > ax + extX(B) || Math.abs(A.y - B.y) > ay + extY(B)) continue;
        collide(A, B, contacts);
      }
    }
    // Prepare: effective masses, bias, restitution, warm start.
    const nextWarm = new Map();
    for (const c of contacts) {
      const { A, B, nx, ny } = c;
      c.rax = c.px - A.x; c.ray = c.py - A.y; c.rbx = c.px - B.x; c.rby = c.py - B.y;
      const rnA = c.rax * ny - c.ray * nx, rnB = c.rbx * ny - c.rby * nx;
      c.mn = 1 / (A.invM + B.invM + A.invI * rnA * rnA + B.invI * rnB * rnB);
      const tx = -ny, ty = nx;
      const rtA = c.rax * ty - c.ray * tx, rtB = c.rbx * ty - c.rby * tx;
      c.mt = 1 / (A.invM + B.invM + A.invI * rtA * rtA + B.invI * rtB * rtB);
      const [dvx, dvy] = relVel(c);
      const vn = dvx * nx + dvy * ny;
      c.target = vn < -BOUNCE_MIN ? -BOUNCE * vn : 0;
      c.bias = Math.min(600, (BETA / dt) * Math.max(0, c.depth - SLOP)); c.pb = 0;
      const prev = warm.get(c.key);
      if (prev) { c.pn = prev.pn; c.pt = prev.pt; } else if (-vn > IMPACT) impact(c, -vn);
      nextWarm.set(c.key, c);
    }
    // Warm start only after every closing speed is measured, or a stack's own weight
    // would read as an impact and make it bounce.
    for (const c of contacts) applyImpulse(c, c.pn * c.nx - c.pt * c.ny, c.pn * c.ny + c.pt * c.nx);
    warm = nextWarm;
    // Mouse joint: a soft spring-damper constraint (about 6 Hz) at the grab point.
    const j = joint;
    if (j) {
      const b = j.b, m = 1 / b.invM, om = 2 * Math.PI * 6, k = m * om * om, d = 2 * m * 0.75 * om;
      j.gamma = 1 / (dt * (d + dt * k));
      const beta = dt * k * j.gamma;
      j.rx = b.c * j.lx - b.s * j.ly; j.ry = b.s * j.lx + b.c * j.ly;
      const k11 = b.invM + b.invI * j.ry * j.ry + j.gamma, k12 = -b.invI * j.rx * j.ry, k22 = b.invM + b.invI * j.rx * j.rx + j.gamma;
      const det = 1 / (k11 * k22 - k12 * k12);
      j.m11 = k22 * det; j.m12 = -k12 * det; j.m22 = k11 * det;
      j.cx = (b.x + j.rx - j.tx) * beta; j.cy = (b.y + j.ry - j.ty) * beta;
      j.ix = j.iy = 0; j.max = m * G * 40 * dt;
      b.w *= 0.96;
    }
    for (let it = 0; it < ITERATIONS; it++) {
      if (j) {
        const b = j.b;
        const vx = b.vx - b.w * j.ry + j.cx + j.gamma * j.ix, vy = b.vy + b.w * j.rx + j.cy + j.gamma * j.iy;
        let ix = -(j.m11 * vx + j.m12 * vy), iy = -(j.m12 * vx + j.m22 * vy);
        const ox = j.ix, oy = j.iy;
        j.ix += ix; j.iy += iy;
        const mag = Math.hypot(j.ix, j.iy);
        if (mag > j.max) { j.ix *= j.max / mag; j.iy *= j.max / mag; }
        ix = j.ix - ox; iy = j.iy - oy;
        b.vx += ix * b.invM; b.vy += iy * b.invM; b.w += b.invI * (j.rx * iy - j.ry * ix);
      }
      for (const c of contacts) {
        const { nx, ny } = c, tx = -ny, ty = nx;
        let [dvx, dvy] = relVel(c);
        let dp = c.mn * (c.target - (dvx * nx + dvy * ny));
        const pn = Math.max(c.pn + dp, 0);
        dp = pn - c.pn; c.pn = pn;
        applyImpulse(c, nx * dp, ny * dp);
        // Overlap is pushed apart with pseudo-velocities that never become real motion.
        if (c.bias) {
          const [bx, by] = relVel(c, true);
          let db = c.mn * (c.bias - (bx * nx + by * ny));
          const pb = Math.max(c.pb + db, 0);
          db = pb - c.pb; c.pb = pb;
          applyImpulse(c, nx * db, ny * db, true);
        }
        [dvx, dvy] = relVel(c);
        let dt2 = c.mt * -(dvx * tx + dvy * ty);
        const lim = FRICTION * c.pn, pt = clamp(c.pt + dt2, -lim, lim);
        dt2 = pt - c.pt; c.pt = pt;
        applyImpulse(c, tx * dt2, ty * dt2);
      }
    }
    // Integrate, then make sure nothing has slipped out of the box.
    for (const b of bodies) {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 4000) { b.vx *= 4000 / sp; b.vy *= 4000 / sp; }
      b.w = clamp(b.w, -30, 30);
      b.x += (b.vx + b.bx) * dt; b.y += (b.vy + b.by) * dt; setAngle(b, b.a + (b.w + b.bw) * dt);
      b.bx = b.by = b.bw = 0;
      if (!b.entered && b.y - extY(b) > 0) b.entered = true;
      if (!Number.isFinite(b.x + b.y + b.a)) { b.x = W / 2; b.y = b.hh + 4; b.vx = b.vy = b.w = 0; setAngle(b, 0); }
      const ex = Math.min(extX(b), W / 2), ey = extY(b);
      if (b.x < ex) { b.x = ex; b.vx = Math.max(0, b.vx); }
      if (b.x > W - ex) { b.x = W - ex; b.vx = Math.min(0, b.vx); }
      if (b.y > floorY - ey + 2) { b.y = floorY - ey; b.vy = Math.min(0, b.vy); }
      if (b.entered && b.y < ey) { b.y = ey; b.vy = Math.max(0, b.vy); }
      b.squash *= Math.exp(-dt * 16);
    }
  }

  // A hard enough knock throws a few sparks and squashes the blocks for a moment.
  function impact(c, speed) {
    const hit = [c.A, c.B].filter((b) => b.invM && b.cool <= 0);
    if (!hit.length) return;
    const amt = Math.min(0.09, (speed - IMPACT) / 9000 + 0.025);
    for (const b of hit) { b.cool = 0.14; b.squash = amt; b.squashA = Math.atan2(c.ny, c.nx); }
    const color = hit[0].item.accent;
    const n = Math.min(6, 2 + Math.floor((speed - IMPACT) / 350));
    for (let i = 0; i < n && sparks.length < 80; i++) {
      const a = Math.atan2(-c.ny, -c.nx) + (Math.random() - 0.5) * 2.4;
      const v = 140 + Math.random() * 260 * Math.min(2, speed / 900);
      sparks.push({ x: c.px, y: c.py, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0, max: 0.25 + Math.random() * 0.25, color });
    }
  }

  /* ---------------------------------------------------------------- drawing */

  function drawBody(b) {
    const sp = b.sprites?.[b === hover || b === joint?.b || bodies[focused] === b ? 1 : 0];
    if (!sp) return;
    const lifted = b === joint?.b ? 1.05 : b === hover ? 1.025 : 1;
    ctx.save();
    ctx.translate(b.x, b.y - (lifted > 1 ? 3 : 0));
    if (b.squash > 0.002) {
      ctx.rotate(b.squashA); ctx.scale(1 - b.squash, 1 + b.squash * 0.7); ctx.rotate(-b.squashA);
    }
    // A box looks the same turned half a revolution, so labels are always drawn upright-ish.
    const a = Math.atan2(b.s, b.c);
    ctx.rotate(Math.abs(a) > Math.PI / 2 ? a - Math.sign(a) * Math.PI : a);
    ctx.scale(lifted, lifted);
    const w = sp.c.width / dpr, h = sp.c.height / dpr;
    ctx.drawImage(sp.c, -w / 2, -h / 2, w, h);
    if (bodies[focused] === b) {
      ctx.strokeStyle = b.item.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-b.hw - 5, -b.hh - 5, b.hw * 2 + 10, b.hh * 2 + 10, 15 * b.lay.k); ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    if (!W || !bodies[0].sprites) return;
    ctx.clearRect(0, 0, W, H);
    const top = [hover, bodies[focused], joint?.b].filter(Boolean);
    for (const b of bodies) if (!top.includes(b)) drawBody(b);
    for (const b of new Set(top)) drawBody(b);
    if (sparks.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round'; ctx.lineWidth = 2;
      for (const p of sparks) {
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.strokeStyle = p.color;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022); ctx.stroke();
      }
      ctx.restore();
    }
  }

  const status = (text) => { if (readout.textContent !== text) readout.textContent = text; };
  status(reduced ? `${items.length} blocks · tidied for reduced motion` : `${items.length} blocks`);

  const loop = createLoop((dt) => {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) { step(STEP); acc -= STEP; n++; }
    if (n === 6) acc = 0;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life += dt; p.vy += 1400 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life >= p.max) sparks.splice(i, 1);
    }
    draw();
    // Sleep once nothing has really moved for a couple of short windows. Measuring
    // displacement rather than speed ignores the solver's sub-pixel buzz in a resting stack.
    win.t += dt;
    if (win.t < 0.25) return;
    let moved = 0;
    bodies.forEach((b, i) => {
      moved = Math.max(moved, Math.hypot(b.x - win.snap[i * 3], b.y - win.snap[i * 3 + 1]) + Math.abs(b.a - win.snap[i * 3 + 2]) * b.hw);
    });
    snapshot();
    quiet = moved < 2 ? quiet + 1 : 0;
    const idle = performance.now() - lastPoke > 7000 && moved < 4;
    if (!joint && (quiet >= 2 || idle)) {
      if (awake) { for (const b of bodies) b.vx = b.vy = b.w = 0; awake = false; warm.clear(); status(`${items.length} blocks · at rest`); }
      if (!sparks.length) { draw(); loop.stop(); }
    }
  });

  /* ---------------------------------------------------------------- pointer */

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  function hitTest(px, py) {
    const order = [...bodies].reverse();
    if (joint) order.unshift(joint.b);
    for (const b of order) {
      const dx = px - b.x, dy = py - b.y;
      if (Math.abs(b.c * dx + b.s * dy) <= b.hw && Math.abs(-b.s * dx + b.c * dy) <= b.hh) return b;
    }
    return null;
  }
  function navigate(b) {
    const id = `p-${b.item.repo}`;
    const target = document.getElementById(id);
    if (location.hash === `#${id}`) target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    else location.hash = id; // html { scroll-behavior: smooth } makes this glide, and Back works
  }

  let press = null;
  function grab() {
    if (!press || press.grabbed) return;
    clearTimeout(press.timer);
    press.grabbed = true;
    if (reduced) return;
    const b = press.b, dx = press.x - b.x, dy = press.y - b.y;
    joint = { b, lx: b.c * dx + b.s * dy, ly: -b.s * dx + b.c * dy, tx: press.x, ty: press.y };
    // Keep the block on top of the pile while it is held.
    bodies.splice(bodies.indexOf(b), 1); bodies.push(b);
    focused = -1; canvas.classList.add('is-grabbing');
    status(`Holding ${b.item.title}`); wake();
  }
  function release(e, cancelled) {
    if (!press) return;
    clearTimeout(press.timer);
    const p = press;
    press = null; canvas.classList.remove('is-grabbing');
    if (joint) {
      // Fling: blend the block's own velocity with the pointer's recent velocity.
      const b = joint.b;
      if (!cancelled && performance.now() - p.vt < 90) {
        b.vx = (b.vx + clamp(p.vx, -3200, 3200)) / 2; b.vy = (b.vy + clamp(p.vy, -3200, 3200)) / 2;
      }
      joint = null; status(`${items.length} blocks`); wake();
    }
    if (!cancelled && e && p.moved < CLICK_MOVE && performance.now() - p.t0 < CLICK_MS) navigate(p.b);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || press) return;
    const [x, y] = local(e);
    const b = hitTest(x, y);
    if (!b) return; // empty space: leave the gesture to the browser
    press = { id: e.pointerId, b, x, y, x0: x, y0: y, t0: performance.now(), moved: 0, vx: 0, vy: 0, vt: 0, grabbed: false, touch: e.pointerType === 'touch' };
    if (press.touch) press.timer = setTimeout(grab, LONG_PRESS);
    else { e.preventDefault(); canvas.setPointerCapture(e.pointerId); grab(); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (press && e.pointerId === press.id) {
      const now = performance.now(), dt = Math.max(1, now - (press.vt || press.t0)) / 1000;
      press.vx = press.vx * 0.3 + ((x - press.x) / dt) * 0.7; press.vy = press.vy * 0.3 + ((y - press.y) / dt) * 0.7;
      press.vt = now; press.x = x; press.y = y;
      press.moved = Math.max(press.moved, Math.hypot(x - press.x0, y - press.y0));
      if (!press.grabbed && press.moved > CLICK_MOVE) {
        // Horizontal-first touches become drags; vertical ones are page scrolls.
        if (Math.abs(x - press.x0) > Math.abs(y - press.y0)) grab();
        else { clearTimeout(press.timer); press = null; return; }
      }
      if (joint) { joint.tx = clamp(x, 6, W - 6); joint.ty = clamp(y, 6, floorY - 6); wake(); }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const h = hitTest(x, y);
    canvas.style.cursor = h ? (reduced ? 'pointer' : 'grab') : '';
    if (h !== hover) { hover = h; if (!loop.running) draw(); }
  });
  canvas.addEventListener('pointerup', (e) => e.pointerId === press?.id && release(e, false));
  canvas.addEventListener('pointercancel', (e) => e.pointerId === press?.id && release(e, true));
  canvas.addEventListener('pointerleave', () => { if (hover) { hover = null; canvas.style.cursor = ''; if (!loop.running) draw(); } });
  canvas.addEventListener('touchmove', (e) => { if (joint && e.cancelable) e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => { if (press) e.preventDefault(); });

  /* ---------------------------------------------------------------- lifecycle */

  relayout();
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !dropped && !reduced) { dropped = true; drop(); }
    else if (visible && awake && !document.hidden) loop.start();
    else if (!visible) loop.stop();
  }, { threshold: 0.2 }).observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) loop.stop();
    else if (visible && (awake || sparks.length)) loop.start();
  });

  // Read-only hook for automated tests: where every block is, and whether the world sleeps.
  Object.defineProperty(stage, '__toybox', {
    value: { get awake() { return awake; }, get running() { return loop.running; }, size: () => ({ w: W, h: H, floorY }),
      bodies: () => bodies.map((b) => ({ repo: b.item.repo, x: b.x, y: b.y, a: b.a, hw: b.hw, hh: b.hh, entered: b.entered })) },
  });
}
