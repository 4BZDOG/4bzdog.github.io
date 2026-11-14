// Probabil-Yatzy plate: five dice roll, hold and settle while a read-out of the odds
// updates. The odds are exact (enumerated, not sampled): for each target, the best
// achievable chance from the current dice with the rerolls left, using the game's
// own scoring rules. Click a die to hold it; click the table to reroll.

import { createLoop, makeCanvas, mulberry32, hashString, clamp } from '../lib.js';

const N = 5;
const PROGRAM = [['turn', 1.4], ['hold', 0.9], ['reroll', 1.4], ['hold', 0.9], ['reroll', 2.8]];
const IDLE_RESUME = 7;
const PIPS = [[4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
const RUN = (c) => { let best = 0, run = 0; for (const n of c) { run = n > 0 ? run + 1 : 0; best = Math.max(best, run); } return best; };
const TARGETS = [
  { label: 'Sm. Straight', hit: (c) => RUN(c) >= 4 },
  { label: 'Lg. Straight', hit: (c) => RUN(c) >= 5 },
  { label: 'Full House', hit: (c) => (c.includes(3) && c.includes(2)) || c.includes(5) },
  { label: 'YAHTZEE', hit: (c) => c.includes(5) },
];

// ---MATH-START
// Exact best-play odds. State = face counts (c[0..5] for faces 1..6). Holding a
// sub-multiset h and rerolling the other k dice gives each count vector d with
// probability k!/(prod d_i!)/6^k. best(c, r) = max over holds of the expected best(h+d, r-1).
const FACT = [1, 1, 2, 6, 24, 120];
function compositions(k) {
  const out = [];
  const rec = (face, left, acc) => {
    if (face === 5) { out.push([...acc, left]); return; }
    for (let n = 0; n <= left; n++) rec(face + 1, left - n, [...acc, n]);
  };
  rec(0, k, []);
  return out.map((d) => ({ d, p: FACT[k] / d.reduce((p, n) => p * FACT[n], 1) / 6 ** k }));
}
const COMPS = [0, 1, 2, 3, 4, 5].map(compositions);
const counts = (values) => { const c = [0, 0, 0, 0, 0, 0]; for (const v of values) c[v - 1]++; return c; };
const sum = (a) => a.reduce((p, n) => p + n, 0);
function subMultisets(c) {
  const out = [];
  const rec = (i, acc) => {
    if (i === 6) { out.push(acc); return; }
    for (let n = 0; n <= c[i]; n++) rec(i + 1, [...acc, n]);
  };
  rec(0, []);
  return out;
}
const memo = new Map();
function best(t, c, r) {
  if (r === 0) return TARGETS[t].hit(c) ? 1 : 0;
  const key = `${t}|${r}|${c.join('')}`;
  let v = memo.get(key);
  if (v === undefined) {
    v = 0;
    for (const h of subMultisets(c)) v = Math.max(v, expect(t, h, r));
    memo.set(key, v);
  }
  return v;
}
function expect(t, h, r) {
  let e = 0;
  for (const { d, p } of COMPS[N - sum(h)]) e += p * best(t, h.map((n, i) => n + d[i]), r - 1);
  return e;
}
function adviseHold(t, values, r) {
  const c = counts(values);
  let bestV = -1, bestH = null, bestSize = -1;
  for (const h of subMultisets(c)) {
    const v = expect(t, h, r), size = sum(h);
    if (v > bestV + 1e-12 || (Math.abs(v - bestV) <= 1e-12 && size > bestSize)) { bestV = v; bestH = h; bestSize = size; }
  }
  const need = [...bestH];
  return values.map((x) => { if (need[x - 1] > 0) { need[x - 1]--; return true; } return false; });
}
const chartValues = (values, r) => { const c = counts(values); return TARGETS.map((_, t) => best(t, c, r)); };
// ---MATH-END

const pct = (v) => (v >= 0.9995 ? '100%' : `${(v * 100).toFixed(1)}%`);

export default function yatzy(host, { reduced, accent, seed }) {
  const ACC = accent || '#ff2d6f';
  const demoRand = mulberry32(hashString(seed));
  const mono = '"JetBrains Mono", ui-monospace, monospace';
  const serif = 'Fraunces, Georgia, serif';

  let dice = [1, 2, 3, 4, 5], held = Array(N).fill(false), rolls = 2;
  let aim = 0, turn = 0, stamp = '';
  let want = [0, 0, 0, 0], shown = [0, 0, 0, 0];
  let manual = false, idle = 0, time = 0, stepIdx = 0, stepT = 0;
  let tStart = Array(N).fill(0), tEnd = Array(N).fill(0);
  let geo = null;

  const view = makeCanvas(host, () => { layout(); if (!loop.running) draw(); });
  const { ctx } = view;
  const loop = createLoop((dt) => { advance(dt); draw(); });

  const tumbling = () => tEnd.some((t) => t > time);
  const keepIdx = () => [0, 1, 2, 3, 4];

  function layout() {
    const W = view.w, H = view.h;
    const s = Math.min(W * 0.15, H * 0.3), gap = s * 0.22;
    const x0 = (W - (N * s + (N - 1) * gap)) / 2;
    geo = {
      s,
      dice: Array.from({ length: N }, (_, i) => ({ x: x0 + i * (s + gap), y: H * 0.34 })),
      fs: clamp(Math.min(W * 0.03, H * 0.058), 8, 13),
      rowTop: H * 0.7,
      rowH: H * 0.065,
    };
  }

  function rollDice(idx, rng) {
    idx.forEach((i, k) => {
      dice[i] = 1 + Math.floor(rng() * 6);
      tStart[i] = time;
      tEnd[i] = reduced ? time : time + 0.5 + 0.08 * k;
    });
  }

  function refresh() { want = chartValues(dice, rolls); }

  function newTurn(rng) {
    aim = turn % TARGETS.length;
    turn++;
    held = Array(N).fill(false);
    stamp = '';
    rolls = 2; // the opening roll uses one of the three rolls in a turn
    rollDice(keepIdx(), rng);
    refresh();
  }

  function reroll(rng) {
    rollDice(keepIdx().filter((i) => !held[i]), rng);
    rolls--;
    if (rolls === 0) stamp = TARGETS[aim].hit(counts(dice)) ? 'HIT' : 'MISS';
    refresh();
  }

  function holdAdvice() {
    held = adviseHold(aim, dice, rolls);
    refresh();
  }

  function act(name) {
    if (name === 'turn') newTurn(demoRand);
    else if (name === 'hold') holdAdvice();
    else reroll(demoRand);
  }

  function advance(dt) {
    time += dt;
    if (manual) {
      idle += dt;
      if (idle > IDLE_RESUME && !tumbling()) { manual = false; stepIdx = 0; stepT = 0; }
    } else {
      stepT -= dt;
      while (stepT <= 0) {
        const [name, wait] = PROGRAM[stepIdx];
        act(name);
        stepIdx = (stepIdx + 1) % PROGRAM.length;
        stepT += wait;
      }
    }
    for (let t = 0; t < TARGETS.length; t++) {
      const d = want[t] - shown[t];
      shown[t] = Math.abs(d) < 1e-3 ? want[t] : shown[t] + d * Math.min(1, dt * 5);
    }
  }

  function onPointer(e) {
    const rect = view.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !geo) return;
    const x = (e.clientX - rect.left) * (view.w / rect.width);
    const y = (e.clientY - rect.top) * (view.h / rect.height);
    manual = true;
    idle = 0;
    const i = geo.dice.findIndex((d) => x >= d.x && x <= d.x + geo.s && y >= d.y && y <= d.y + geo.s);
    if (i >= 0) {
      if (rolls > 0) { held[i] = !held[i]; refresh(); }
    } else if (!tumbling()) {
      if (rolls > 0) reroll(Math.random);
      else newTurn(Math.random);
    }
    if (!loop.running) draw();
  }

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawDie(x, y, s, face, isHeld, lift, angle) {
    const h = s / 2;
    ctx.save();
    ctx.translate(x + h, y + h + lift);
    ctx.rotate(angle);
    rrect(-h, -h, s, s, s * 0.18);
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = s * 0.22;
    ctx.shadowOffsetY = s * 0.08;
    const g = ctx.createRadialGradient(-h * 0.6, -h * 0.6, 0, 0, 0, h * 2);
    g.addColorStop(0, '#263047');
    g.addColorStop(1, '#0c101a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    if (isHeld) {
      ctx.shadowColor = ACC;
      ctx.shadowBlur = s * 0.3;
      ctx.strokeStyle = ACC;
      ctx.lineWidth = Math.max(1.5, s * 0.035);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
    }
    ctx.stroke();
    ctx.shadowBlur = s * 0.08;
    ctx.shadowColor = isHeld ? ACC : 'rgba(255,255,255,0.6)';
    ctx.fillStyle = isHeld ? ACC : '#e2e8f0';
    for (const idx of PIPS[face - 1]) {
      ctx.beginPath();
      ctx.arc(-h + s * (0.25 + 0.25 * (idx % 3)), -h + s * (0.25 + 0.25 * Math.floor(idx / 3)), s * 0.075, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    const W = view.w, H = view.h;
    if (!W || !H || !geo) return;
    const { s, fs, rowTop, rowH } = geo;
    ctx.clearRect(0, 0, W, H);

    const g = ctx.createRadialGradient(W * 0.35, H * 0.3, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#16203a');
    g.addColorStop(0.6, '#0a0e19');
    g.addColorStop(1, '#05070e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W, 0, 0, W, 0, W * 0.6);
    rg.addColorStop(0, ACC);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    const step = Math.max(18, W * 0.07);
    ctx.fillStyle = 'rgba(120,140,190,0.05)';
    for (let x = step; x < W; x += step) ctx.fillRect(Math.round(x), 0, 1, H);
    for (let y = step; y < H; y += step) ctx.fillRect(0, Math.round(y), W, 1);

    ctx.textBaseline = 'alphabetic';
    const top = H * 0.07;
    ctx.font = `600 ${fs}px ${mono}`;
    ctx.fillStyle = 'rgba(226,232,240,0.75)';
    ctx.fillText('PROBABIL-YATZY', W * 0.06, top + fs);
    ctx.font = `500 ${fs * 0.9}px ${mono}`;
    ctx.fillStyle = 'rgba(226,232,240,0.45)';
    ctx.fillText(`REROLLS LEFT ${rolls}  ·  ODDS PER TARGET, BEST PLAY`, W * 0.06, top + fs * 2.55);
    if (stamp) {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = `italic 600 ${fs * 2}px ${serif}`;
      ctx.fillStyle = stamp === 'HIT' ? ACC : 'rgba(148,163,184,0.7)';
      ctx.fillText(stamp, W * 0.94, top + fs * 2.55);
      ctx.restore();
    }

    geo.dice.forEach((d, i) => {
      const rolling = time < tEnd[i];
      // Positive modulo: the first rAF timestamp can sit a hair before performance.now().
      const face = rolling ? (((Math.floor(time * 16) + i * 2) % 6 + 6) % 6) + 1 : dice[i];
      let lift = 0, angle = 0;
      if (rolling) {
        const p = clamp((time - tStart[i]) / Math.max(1e-3, tEnd[i] - tStart[i]), 0, 1);
        lift = -Math.sin(p * Math.PI) * s * 0.25;
        angle = (1 - p) * Math.sin(p * Math.PI * 3) * 0.3;
      }
      drawDie(d.x, d.y, s, face, held[i], lift, angle);
      if (held[i]) {
        ctx.save();
        ctx.font = `700 ${fs * 0.8}px ${mono}`;
        const tw = ctx.measureText('HOLD').width + fs * 0.9, th = fs * 1.2;
        const tx = d.x + s / 2 - tw / 2, ty = d.y - th * 0.55 - 2;
        rrect(tx, ty, tw, th, th / 2);
        ctx.fillStyle = ACC;
        ctx.fill();
        ctx.fillStyle = '#05070e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HOLD', tx + tw / 2, ty + th / 2);
        ctx.restore();
      }
    });

    const bx = W * 0.37, bw = W * 0.43, bh = rowH * 0.42;
    TARGETS.forEach((T, t) => {
      const cy = rowTop + rowH * (t + 0.5);
      const isAim = t === aim;
      ctx.font = `${isAim ? 700 : 500} ${fs * 0.95}px ${mono}`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isAim ? ACC : 'rgba(226,232,240,0.6)';
      ctx.fillText(T.label.toUpperCase(), W * 0.06, cy);
      rrect(bx, cy - bh / 2, bw, bh, bh / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fill();
      const v = clamp(shown[t], 0, 1);
      if (v > 0.002) {
        rrect(bx, cy - bh / 2, Math.max(bh, bw * v), bh, bh / 2);
        ctx.fillStyle = isAim ? ACC : 'rgba(148,163,184,0.6)';
        ctx.shadowColor = isAim ? ACC : 'transparent';
        ctx.shadowBlur = isAim ? bh : 0;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = isAim ? '#f8fafc' : 'rgba(226,232,240,0.6)';
      ctx.fillText(pct(v), W * 0.95, cy);
      ctx.textAlign = 'left';
    });
  }

  layout();
  // Opening frame: one reroll and a hold in, so the still shows a mid-turn state.
  newTurn(demoRand);
  holdAdvice();
  reroll(demoRand);
  holdAdvice();
  shown = [...want];
  draw();

  return {
    start() {
      view.canvas.addEventListener('pointerdown', onPointer);
      view.canvas.style.cursor = 'pointer';
      view.canvas.style.touchAction = 'manipulation';
      if (reduced) { draw(); return; }
      loop.start();
    },
    stop() {
      loop.stop();
      view.canvas.removeEventListener('pointerdown', onPointer);
    },
  };
}
