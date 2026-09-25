// TrussCraft: a Pratt truss on springs. A truck crosses it; each member is coloured by
// the axial force it carries (blue tension, red compression). Joints can be dragged.

import { createLoop, makeCanvas, clamp, lerp } from '../lib.js';

const TENSION = [77, 163, 255];
const COMPRESSION = [255, 90, 78];
const NEUTRAL = [150, 162, 186];
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;

export default function truss(host, { reduced }) {
  const view = makeCanvas(host, () => { setup(); if (!loop.running) draw(); });
  const { ctx, canvas } = view;

  const WW = 100;              // world width in "metres"
  const PANELS = 8;
  const K = 6000;              // axial stiffness (EA)
  const C = 22;                // axial damping
  const G = 3;                 // self-weight per joint
  const TRUCK = 52;            // truck load
  const CAPACITY = 240;        // force that counts as 100% "stress"

  let s = 1, WH = 60, deckY = 34, gx0 = 14, gx1 = 86, panel = 9;
  let nodes = [], members = [], stars = [];
  let truck = { x: -14, wait: 0 };
  let drag = null, hover = null, peak = 0, time = 0;

  function setup() {
    s = view.w / WW;
    WH = view.h / s;
    deckY = WH * 0.56;
    panel = (gx1 - gx0) / PANELS;
    const h = Math.min(panel * 1.05, WH * 0.21);
    nodes = []; members = [];
    const node = (x, y, fixed = false) => (nodes.push({ x, y, vx: 0, vy: 0, fx: 0, fy: 0, fixed, load: 0 }), nodes.length - 1);
    const deck = [], top = [];
    for (let i = 0; i <= PANELS; i++) deck.push(node(gx0 + i * panel, deckY, i === 0 || i === PANELS));
    for (let i = 1; i < PANELS; i++) top[i] = node(gx0 + i * panel, deckY - h);
    const member = (a, b, kind) => {
      const A = nodes[a], B = nodes[b];
      members.push({ a, b, kind, rest: Math.hypot(B.x - A.x, B.y - A.y), force: 0 });
    };
    for (let i = 0; i < PANELS; i++) member(deck[i], deck[i + 1], 'road');
    for (let i = 1; i < PANELS - 1; i++) member(top[i], top[i + 1], 'steel');
    for (let i = 1; i < PANELS; i++) member(deck[i], top[i], 'timber');
    member(deck[0], top[1], 'steel');
    member(deck[PANELS], top[PANELS - 1], 'steel');
    const mid = PANELS / 2;
    for (let i = 1; i < mid; i++) member(top[i], deck[i + 1], 'timber');
    for (let i = mid + 1; i < PANELS; i++) member(top[i], deck[i - 1], 'timber');
    nodes.deck = deck;

    stars = Array.from({ length: 40 }, () => [Math.random() * WW, Math.random() * WH * 0.45, Math.random()]);
    // Let it settle under its own weight before anyone sees it.
    for (let i = 0; i < 240; i++) physics(1 / 480);
  }

  function applyTruckLoad() {
    for (const n of nodes) n.load = 0;
    const x = truck.x;
    if (x < gx0 || x > gx1) return;
    const f = (x - gx0) / panel;
    const i = Math.min(PANELS - 1, Math.floor(f));
    const t = f - i;
    nodes[nodes.deck[i]].load += TRUCK * (1 - t);
    nodes[nodes.deck[i + 1]].load += TRUCK * t;
  }

  function physics(dt) {
    for (const n of nodes) { n.fx = 0; n.fy = G + n.load; }
    for (const m of members) {
      const A = nodes[m.a], B = nodes[m.b];
      const dx = B.x - A.x, dy = B.y - A.y;
      const L = Math.hypot(dx, dy) || 1e-6;
      const ux = dx / L, uy = dy / L;
      const f = (K * (L - m.rest)) / m.rest;
      const rv = (B.vx - A.vx) * ux + (B.vy - A.vy) * uy;
      const total = f + C * rv;
      m.force = f;
      A.fx += total * ux; A.fy += total * uy;
      B.fx -= total * ux; B.fy -= total * uy;
    }
    if (drag) {
      const n = nodes[drag.node];
      // Capped, so a hard yank strains the truss rather than turning it to rubber.
      n.fx += clamp((drag.x - n.x) * 60, -200, 200) - n.vx * 6;
      n.fy += clamp((drag.y - n.y) * 60, -200, 200) - n.vy * 6;
    }
    for (const n of nodes) {
      if (n.fixed) continue;
      n.vx = (n.vx + n.fx * dt) * (1 - 0.6 * dt);
      n.vy = (n.vy + n.fy * dt) * (1 - 0.6 * dt);
      n.x += n.vx * dt;
      n.y += n.vy * dt;
    }
  }

  function deckYAt(x) {
    if (x <= gx0 || x >= gx1) return deckY;
    const f = (x - gx0) / panel;
    const i = Math.min(PANELS - 1, Math.floor(f));
    return lerp(nodes[nodes.deck[i]].y, nodes[nodes.deck[i + 1]].y, f - i);
  }

  function update(dt) {
    time += dt;
    if (truck.wait > 0) truck.wait -= dt;
    else {
      truck.x += dt * 11;
      if (truck.x > WW + 14) { truck.x = -14; truck.wait = 0.9; }
    }
    applyTruckLoad();
    const sub = 8;
    for (let i = 0; i < sub; i++) physics(dt / sub);
    peak = lerp(peak, Math.max(...members.map((m) => Math.abs(m.force))) / CAPACITY, 0.1);
  }

  // ------------------------------------------------------------ drawing

  function cliff(side) {
    const edge = side < 0 ? gx0 : gx1;
    const outer = side < 0 ? -2 : WW + 2;
    const j = (k) => edge - side * k;
    ctx.beginPath();
    ctx.moveTo(outer * s, deckY * s);
    ctx.lineTo(edge * s, deckY * s);
    ctx.lineTo(j(0.8) * s, (deckY + 4) * s);
    ctx.lineTo(j(-0.6) * s, (deckY + 9) * s);
    ctx.lineTo(j(1.8) * s, (deckY + 14) * s);
    ctx.lineTo(j(0.4) * s, (deckY + 22) * s);
    ctx.lineTo(j(2.6) * s, WH * s);
    ctx.lineTo(outer * s, WH * s);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, deckY * s, 0, WH * s);
    g.addColorStop(0, '#26314a');
    g.addColorStop(1, '#141b2a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,180,215,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#39445e';
    ctx.fillRect(Math.min(outer, edge) * s, deckY * s - 1.5, Math.abs(edge - outer) * s, 3);
  }

  function draw() {
    const W = view.w, H = view.h;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0b1322');
    sky.addColorStop(1, '#101a2c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Blueprint grid, like the game's build grid.
    ctx.strokeStyle = 'rgba(120,160,230,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = 0; gx <= WW; gx += panel / 2) { ctx.moveTo(gx * s + 0.5, 0); ctx.lineTo(gx * s + 0.5, H); }
    for (let gy = deckY % (panel / 2); gy <= WH; gy += panel / 2) { ctx.moveTo(0, gy * s + 0.5); ctx.lineTo(W, gy * s + 0.5); }
    ctx.stroke();
    for (const [sx, sy, tw] of stars) {
      ctx.fillStyle = `rgba(220,230,255,${0.2 + 0.3 * Math.sin(time * 1.3 + tw * 9) ** 2})`;
      ctx.fillRect(sx * s, sy * s, 1.5, 1.5);
    }

    // Water.
    const wy = WH * 0.9;
    ctx.fillStyle = '#0d2236';
    ctx.fillRect(0, wy * s, W, H - wy * s);
    ctx.strokeStyle = 'rgba(110,180,255,0.25)';
    ctx.beginPath();
    for (let row = 0; row < 3; row++) {
      const y0 = (wy + 0.8 + row * 1.6) * s;
      for (let x = 0; x <= W; x += 6) {
        const y = y0 + Math.sin(x * 0.05 + time * (1.5 + row * 0.4) + row) * 1.5;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    cliff(-1);
    cliff(1);

    // Members: a soft glow pass, then the core.
    for (const pass of [0, 1]) {
      for (const m of members) {
        const A = nodes[m.a], B = nodes[m.b];
        // Square-root scale so light self-weight forces still tint the members.
        const t = clamp(Math.sqrt(Math.abs(m.force) / (CAPACITY * 0.5)), 0, 1);
        const c = mix(NEUTRAL, m.force >= 0 ? TENSION : COMPRESSION, t);
        const base = m.kind === 'road' ? 1.25 : m.kind === 'steel' ? 0.85 : 0.7;
        ctx.strokeStyle = c;
        ctx.globalAlpha = pass === 0 ? 0.18 * t : 1;
        ctx.lineWidth = (pass === 0 ? base * 3.2 : base) * s * (m === hover ? 1.5 : 1);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(A.x * s, A.y * s);
        ctx.lineTo(B.x * s, B.y * s);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Joints and anchors.
    for (const [i, n] of nodes.entries()) {
      if (n.fixed) {
        ctx.fillStyle = '#9fb2d4';
        ctx.beginPath();
        ctx.moveTo(n.x * s, n.y * s);
        ctx.lineTo((n.x - 1.4) * s, (n.y + 2) * s);
        ctx.lineTo((n.x + 1.4) * s, (n.y + 2) * s);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(n.x * s, n.y * s, Math.max(2.2, 0.5 * s), 0, Math.PI * 2);
      ctx.fillStyle = drag?.node === i ? '#ffd166' : '#0c1424';
      ctx.fill();
      ctx.strokeStyle = '#d6dff0';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    if (drag) {
      const n = nodes[drag.node];
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255,209,102,0.8)';
      ctx.beginPath();
      ctx.moveTo(n.x * s, n.y * s);
      ctx.lineTo(drag.x * s, drag.y * s);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawTruck();
    drawHud();
  }

  function drawTruck() {
    const x = truck.x;
    const back = deckYAt(x - 3), front = deckYAt(x + 3);
    const y = (back + front) / 2;
    const ang = Math.atan2(front - back, 6);
    ctx.save();
    ctx.translate(x * s, y * s);
    ctx.rotate(ang);
    ctx.scale(s, s);
    ctx.fillStyle = '#e8b64a';
    ctx.fillRect(-3.8, -4.1, 5.6, 3.2);           // box
    ctx.fillStyle = '#f4d27a';
    ctx.fillRect(2.1, -3.3, 1.9, 2.4);            // cab
    ctx.fillStyle = '#9ad0ff';
    ctx.fillRect(2.8, -3, 0.95, 1);               // window
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-3.8, -1.3, 5.6, 0.4);
    ctx.fillStyle = '#10151f';
    for (const wx of [-2.6, 0.2, 3]) {
      ctx.beginPath();
      ctx.arc(wx, -0.8, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHud() {
    const fs = Math.max(9, view.w * 0.017);
    ctx.font = `500 ${fs}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';
    const pad = view.w * 0.035;
    ctx.fillStyle = 'rgba(214,223,240,0.75)';
    ctx.fillText('LOAD TEST · THE SIMPLE SPAN', pad, pad);
    const pct = Math.round(peak * 100);
    ctx.fillStyle = pct > 80 ? '#ff8a7e' : '#8fc4ff';
    let line2 = `TRUCK 6.5 t   PEAK STRESS ${String(pct).padStart(2, ' ')}%`;
    if (hover && !drag) {
      const kn = Math.abs(hover.force).toFixed(1);
      line2 = `${hover.kind.toUpperCase()} · ${hover.force >= 0 ? 'TENSION' : 'COMPRESSION'} ${kn} kN`;
      ctx.fillStyle = hover.force >= 0 ? '#8fc4ff' : '#ff9a8e';
    }
    ctx.fillText(line2, pad, pad + fs * 1.6);

    // Legend.
    const ly = view.h - pad - fs;
    const legend = [['TENSION', TENSION], ['COMPRESSION', COMPRESSION]];
    let lx = view.w - pad;
    ctx.textAlign = 'right';
    for (const [label, c] of legend.reverse()) {
      ctx.fillStyle = 'rgba(214,223,240,0.7)';
      ctx.fillText(label, lx, ly);
      const w = ctx.measureText(label).width;
      ctx.strokeStyle = `rgb(${c})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lx - w - fs * 2.2, ly + fs * 0.5);
      ctx.lineTo(lx - w - fs * 0.6, ly + fs * 0.5);
      ctx.stroke();
      lx -= w + fs * 4;
    }
    ctx.textAlign = 'left';
  }

  // ------------------------------------------------------------ interaction

  const toWorld = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * WW, ((e.clientY - r.top) / r.height) * WH];
  };
  function nearestNode(x, y, within) {
    let best = -1, bd = within;
    nodes.forEach((n, i) => {
      if (n.fixed) return;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function nearestMember(x, y, within) {
    let best = null, bd = within;
    for (const m of members) {
      const A = nodes[m.a], B = nodes[m.b];
      const dx = B.x - A.x, dy = B.y - A.y;
      const t = clamp(((x - A.x) * dx + (y - A.y) * dy) / (dx * dx + dy * dy), 0, 1);
      const d = Math.hypot(A.x + dx * t - x, A.y + dy * t - y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = toWorld(e);
    const i = nearestNode(x, y, 4.5);
    if (i < 0) return;
    drag = { node: i, x, y };
    canvas.setPointerCapture(e.pointerId);
    loop.start();
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = toWorld(e);
    if (drag) { drag.x = x; drag.y = y; return; }
    hover = nearestMember(x, y, 2.2);
    canvas.style.cursor = nearestNode(x, y, 4.5) >= 0 ? 'grab' : 'default';
    if (!loop.running) draw();
  });
  const release = () => { drag = null; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { hover = null; });

  const loop = createLoop((dt) => {
    if (reduced && !drag) {
      for (let i = 0; i < 8; i++) physics(dt / 8);
      draw();
      return;
    }
    update(dt);
    draw();
  });

  setup();
  if (reduced) {
    truck.x = (gx0 + gx1) / 2;
    applyTruckLoad();
    for (let i = 0; i < 600; i++) physics(1 / 480);
    peak = Math.max(...members.map((m) => Math.abs(m.force))) / CAPACITY;
    draw();
  }

  return {
    start() { if (reduced) { draw(); return; } loop.start(); },
    stop() { loop.stop(); },
  };
}
