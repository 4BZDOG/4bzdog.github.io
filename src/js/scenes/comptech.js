// CompTech Notes: Input → Process → Output, acted out by a small robot (mechatronics).
// Each tick it reads its sensor, picks a branch of its pseudocode and drives its motors
// towards a flag. Visitors can drop walls on the grid; the robot re-plans with a
// breadth-first search, and the IPO chart and code light up in step with it.

import { createLoop, makeCanvas, el, mulberry32, hashString, randInt, clamp, lerp } from '../lib.js';

const COLS = 10, ROWS = 7, N = COLS * ROWS;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];          // east, south, west, north
const QUARTER = Math.PI / 2, TAU = Math.PI * 2;
const CORAL = '#ff7a59', TEAL = '#3ecfd9', AMBER = '#ffc857', SHELL = '#f2ebe6', DARK = '#1b1c24';
const CONFETTI = [CORAL, TEAL, AMBER, SHELL];
const T = { sense: 0.17, decide: 0.15, move: 0.36, turn: 0.28, think: 0.8, party: 2.4, swap: 1 };
const CODE = [
  ['WHILE', ' ', 'NOT', ' atGoal'], ['  read sensor'], ['  ', 'IF', ' map changed ', 'THEN'], ['    replan route'],
  ['  ', 'ELSEIF', ' wall ', 'OR', ' bend ', 'THEN'], ['    turn to route'], ['  ', 'ELSE'], ['    move forward'],
  ['  ', 'ENDIF'], ['ENDWHILE'], ['beep'],
];
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export default function comptech(host, { reduced, seed }) {
  // The plate now holds a control, so it is a labelled group rather than a plain image.
  host.setAttribute('role', 'group');
  const rand = mulberry32(hashString(String(seed)));
  const HINT = `${window.matchMedia('(hover: none)').matches ? 'Tap' : 'Click'} the grid to place a wall`;

  // ------------------------------------------------------------ DOM: chart, code, stage
  const wrap = el('div', 'ct-wrap');
  const ipo = el('div', 'ct-ipo');
  const boxes = ['Input', 'Process', 'Output'].map((name, i) => {
    const b = el('div', `ct-box ct-box-${i}`), v = el('span', null, '–');
    return b.append(el('b', null, name), v), { b, v };
  });
  const arrows = [el('i', 'ct-arrow'), el('i', 'ct-arrow')];
  ipo.append(boxes[0].b, arrows[0], boxes[1].b, arrows[1], boxes[2].b);
  const code = el('pre', 'ct-code');
  const lines = CODE.map((parts) => {
    const ln = el('span', 'ln');
    for (const p of parts) ln.append(/^[A-Z]{2,}$/.test(p) ? el('span', 'kw', p) : p);
    return code.append(ln), ln;
  });
  for (const n of [ipo, code]) n.setAttribute('aria-hidden', 'true');
  const stage = el('div', 'ct-stage'), foot = el('div', 'ct-foot');
  const hint = el('span', 'ct-hint', HINT), hud = el('span', 'ct-tick', 'Tick 0000 · Goals 0');
  const live = el('span', 'ct-sr');
  live.setAttribute('aria-live', 'polite');
  foot.append(hint, hud);
  wrap.append(ipo, code, stage, foot, live);
  host.append(wrap);
  const view = makeCanvas(stage, () => { fit(); if (!loop.running) draw(); });
  const { ctx, canvas } = view;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Robot grid, 10 columns by 7 rows. Arrow keys move the cursor; Enter or Space places or removes a wall.');

  let litBox = -1, litLine = -1;
  function light(box, line, text) {
    if (text != null) boxes[box].v.textContent = text;
    if (reduced) return;
    if (box !== litBox) {
      boxes.forEach((b, i) => b.b.classList.toggle('on', i === box));
      arrows.forEach((a, i) => a.classList.toggle('on', box === i + 1));
      code.dataset.phase = litBox = box;
    }
    if (line !== litLine) { lines[litLine]?.classList.remove('on'); lines[line]?.classList.add('on'); litLine = line; }
  }
  const alertInput = () => !reduced && boxes[0].b.animate(
    [{ boxShadow: `0 0 0 2px ${CORAL}, 0 0 24px ${CORAL}` }, { boxShadow: '0 0 0 0 transparent' }],
    { duration: 520, easing: 'ease-out' },
  );
  const showHud = () => (hud.textContent = `Tick ${String(ticks).padStart(4, '0')} · Goals ${goals}`);

  // ------------------------------------------------------------ world: grid, BFS, layouts
  const walls = new Uint8Array(N);       // 0 empty, 1 layout wall, 2 visitor's wall
  const kind = new Uint8Array(N);        // kept after removal, so a wall fades out in its own colour
  const wallT = new Float32Array(N), trail = new Float32Array(N);
  const dist = new Int16Array(N);        // BFS from the goal: the route
  const flood = new Int16Array(N);       // BFS from the robot: the 'thinking' ripple
  const queue = new Int16Array(N), route = new Int16Array(N);
  let routeLen = 0, goal = 0, floodMax = 1;
  const bot = { c: 0, prev: -1, dir: 0, next: 0, x: 0.5, y: 0.5, ang: 0, x0: 0, y0: 0, x1: 0, y1: 0, a0: 0, a1: 0, alpha: 1, tread: 0 };

  const step = (i, d) => {
    const x = (i % COLS) + DX[d], y = ((i / COLS) | 0) + DY[d];
    return x < 0 || y < 0 || x >= COLS || y >= ROWS ? -1 : y * COLS + x;
  };
  const label = (i) => `${'ABCDEFGHIJ'[i % COLS]}${((i / COLS) | 0) + 1}`;
  function range(c, d) {                 // clear cells ahead, up to 3
    let r = 0;
    for (let j = step(c, d); r < 3 && j >= 0 && !walls[j]; j = step(j, d)) r++;
    return r;
  }
  function bfs(src, out) {
    out.fill(-1);
    out[src] = 0; queue[0] = src;
    for (let head = 0, tail = 1; head < tail;) {
      const i = queue[head++];
      for (let d = 0; d < 4; d++) {
        const j = step(i, d);
        if (j >= 0 && !walls[j] && out[j] < 0) { out[j] = out[i] + 1; queue[tail++] = j; }
      }
    }
  }
  function nextDir(c, pref) {            // downhill on the distance field, keeping straight if it can
    for (let k = 0; k < 4; k++) {
      const d = (pref + k) % 4, j = step(c, d);
      if (j >= 0 && dist[j] >= 0 && dist[j] === dist[c] - 1) return d;
    }
    return -1;
  }
  function buildRoute() {
    routeLen = 0;
    if (dist[bot.c] >= 0) for (let c = bot.c, d = bot.dir; c !== goal && routeLen < N;) { d = nextDir(c, d); c = step(c, d); route[routeLen++] = c; }
  }
  function snapBot() {
    bot.x = (bot.c % COLS) + 0.5; bot.y = ((bot.c / COLS) | 0) + 0.5;
    bot.ang = bot.dir * QUARTER; bot.prev = -1;
  }
  function newLayout() {
    for (let attempt = 0; attempt < 40; attempt++) {
      walls.fill(0);
      const start = randInt(rand, 0, ROWS - 1) * COLS + randInt(rand, 0, 1);
      goal = randInt(rand, 0, ROWS - 1) * COLS + randInt(rand, COLS - 2, COLS - 1);
      for (let s = randInt(rand, 5, 8); s > 0; s--) {
        const d = rand() < 0.5 ? 0 : 1;
        for (let i = randInt(rand, 0, N - 1), k = randInt(rand, 2, 4); k > 0 && i >= 0; k--, i = step(i, d)) {
          if (i !== start && i !== goal) { walls[i] = 1; kind[i] = 1; }
        }
      }
      bfs(goal, dist);
      if (dist[start] >= COLS + 1 || attempt === 39) {
        if (dist[start] < 0) walls.fill(0);
        bot.c = start; bot.dir = 0;
        return snapBot();
      }
    }
  }

  // ------------------------------------------------------------ the sense → decide → act cycle
  let phase = 'think', pt = 0, pdur = T.think, branch = '', time = 0;
  let ticks = 0, goals = 0, stuck = 0, mapDirty = false, swapped = false;
  let floodA = 0, flashCell = -1, flashDir = 0, flashT = 0;
  const go = (p, d) => { phase = p; pt = 0; pdur = d; };

  function sense() {
    ticks++; showHud(); go('sense', T.sense);
    const r = range(bot.c, bot.dir);
    if (mapDirty) light(0, 1, 'map: changed');
    else if (r > 0) light(0, 1, `ahead: ${r === 3 ? '3+' : r} clear`);
    else { light(0, 1, 'ahead: WALL'); alertInput(); flashCell = bot.c; flashDir = bot.dir; flashT = 1; }
  }
  function decide() {
    go('decide', T.decide);
    if (mapDirty) { branch = 'replan'; light(1, 2, 'map changed'); return; }
    if (dist[bot.c] < 0) { branch = 'stuck'; light(1, 2, 'no route…'); return; }
    bot.next = nextDir(bot.c, bot.dir);
    if (bot.next === bot.dir) { branch = 'move'; light(1, 6, 'clear → move'); return; }
    branch = range(bot.c, bot.dir) === 0 ? 'wall' : 'bend';
    light(1, 4, `${branch} → turn`);
  }
  function act() {
    if (mapDirty || branch === 'replan' || branch === 'stuck') { think(); return; }
    if (branch === 'move') {
      bot.prev = bot.c; bot.c = step(bot.c, bot.dir); trail[bot.prev] = 1;
      bot.x0 = bot.x; bot.y0 = bot.y; bot.x1 = (bot.c % COLS) + 0.5; bot.y1 = ((bot.c / COLS) | 0) + 0.5;
      go('act', T.move);
      return light(2, 7, 'motors: forward');
    }
    const delta = (bot.next - bot.dir + 4) % 4;            // 1 right, 3 left, 2 about-face
    bot.a0 = bot.ang; bot.a1 = bot.ang + (delta === 3 ? -1 : delta) * QUARTER; bot.dir = bot.next;
    go('act', delta === 2 ? T.turn * 1.6 : T.turn);
    const word = delta === 1 ? '⟳ right' : delta === 3 ? '⟲ left' : '⟲ about';
    light(2, 5, branch === 'wall' ? `♪ beep, ${word}` : `turn ${word}`);
    if (branch === 'wall') blip(bot.x, bot.y);
  }
  function think() {
    if (branch === 'stuck') stuck++;
    mapDirty = false; floodA = floodMax = 1;
    bfs(goal, dist); bfs(bot.c, flood); buildRoute();
    for (let i = 0; i < N; i++) floodMax = Math.max(floodMax, flood[i]);
    go('think', T.think);
    boxes[2].v.textContent = 'motors: hold';
    light(1, 3, dist[bot.c] >= 0 ? `BFS: ${dist[bot.c]} steps` : 'BFS: no route');
  }
  function party() {
    goals++; showHud(); go('party', T.party);
    boxes[0].v.textContent = 'ahead: flag';
    boxes[1].v.textContent = 'atGoal → stop';
    light(2, 10, '♪ ♪ ♪ goal!');
    for (let k = 0; k < PN; k++) spawn(k, bot.x, bot.y);
    blip(bot.x, bot.y);
  }
  function advance() {
    if (phase === 'sense') decide();
    else if (phase === 'decide') act();
    else if (phase === 'act') { snapBot(); buildRoute(); if (bot.c === goal) party(); else sense(); }
    else if (phase === 'think' && !(dist[bot.c] < 0 && stuck >= 4)) sense();
    else if (phase === 'swap') { bot.alpha = 1; stuck = 0; think(); }
    else {                               // after a party, or after giving up on a walled-in flag
      go('swap', T.swap); light(1, 0, 'new map');
      walls.fill(0); swapped = false; routeLen = 0;
    }
  }

  // Confetti and beep rings live in fixed pools: nothing is allocated per frame.
  const PN = 44, BN = 4;
  const px = new Float32Array(PN), py = new Float32Array(PN), pvx = new Float32Array(PN), pvy = new Float32Array(PN), plife = new Float32Array(PN);
  const bx = new Float32Array(BN), by = new Float32Array(BN), bt = new Float32Array(BN).fill(1);
  let bNext = 0;
  function spawn(k, x, y) {
    const a = rand() * TAU, s = 2 + rand() * 4;
    px[k] = x; py[k] = y; pvx[k] = Math.cos(a) * s; pvy[k] = Math.sin(a) * s - 4; plife[k] = 1 + rand() * 0.8;
  }
  function blip(x, y) { bx[bNext] = x; by[bNext] = y; bt[bNext] = 0; bNext = (bNext + 1) % BN; }

  function update(dt) {
    time += dt; pt += dt;
    const k = Math.min(1, pt / pdur), grow = Math.min(1, dt * 12);
    for (let i = 0; i < N; i++) {
      wallT[i] += ((walls[i] ? 1 : 0) - wallT[i]) * grow;
      if (trail[i] > 0) trail[i] = Math.max(0, trail[i] - dt * 0.22);
    }
    if (phase !== 'think') floodA = Math.max(0, floodA - dt * 1.6);
    flashT = Math.max(0, flashT - dt * 1.8);
    if (phase === 'act') {
      const e = ease(k);
      if (branch === 'move') { bot.x = lerp(bot.x0, bot.x1, e); bot.y = lerp(bot.y0, bot.y1, e); bot.tread += dt * 10; }
      else { bot.ang = lerp(bot.a0, bot.a1, e); bot.tread += dt * 5; }
    } else if (phase === 'swap') {
      bot.alpha = Math.abs(1 - 2 * k);
      if (k >= 0.5 && !swapped) { swapped = true; newLayout(); }
    }
    for (let p = 0; p < PN; p++) if (plife[p] > 0) { plife[p] -= dt; pvy[p] += 14 * dt; px[p] += pvx[p] * dt; py[p] += pvy[p] * dt; }
    for (let b = 0; b < BN; b++) bt[b] = Math.min(1, bt[b] + dt * 1.6);
    if (pt >= pdur) advance();
  }

  // ------------------------------------------------------------ drawing
  let cs = 20, ox = 0, oy = 0, hover = -1, cursor = -1, focused = false;
  const dash = [4, 5], solid = [];
  function fit() {
    cs = Math.max(8, Math.floor(Math.min((view.w - 8) / COLS, (view.h - 8) / ROWS)));
    ox = Math.round((view.w - cs * COLS) / 2); oy = Math.round((view.h - cs * ROWS) / 2);
    dash[0] = cs * 0.12; dash[1] = cs * 0.16;
  }
  const sxOf = (i) => ox + ((i % COLS) + 0.5) * cs;
  const syOf = (i) => oy + (((i / COLS) | 0) + 0.5) * cs;
  const tile = (x, y, s, r) => { ctx.beginPath(); ctx.roundRect(x - s / 2, y - s / 2, s, s, r); };

  function draw() {
    const W = cs * COLS, H = cs * ROWS;
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(6, 6, 10, 0.6)';
    ctx.beginPath(); ctx.roundRect(ox - 3, oy - 3, W + 6, H + 6, 8); ctx.fill();
    ctx.strokeStyle = focused ? AMBER : 'rgba(255, 122, 89, 0.25)'; ctx.lineWidth = focused ? 2 : 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(ox + x * cs + 0.5, oy); ctx.lineTo(ox + x * cs + 0.5, oy + H); }
    for (let y = 1; y < ROWS; y++) { ctx.moveTo(ox, oy + y * cs + 0.5); ctx.lineTo(ox + W, oy + y * cs + 0.5); }
    ctx.stroke();
    if (floodA > 0) {                    // the BFS ripple, spreading out from the robot as it thinks
      const front = (phase === 'think' ? Math.min(1, pt / (pdur * 0.7)) : 1) * (floodMax + 2);
      ctx.fillStyle = TEAL;
      for (let i = 0; i < N; i++) {
        if (flood[i] < 0 || flood[i] > front) continue;
        ctx.globalAlpha = floodA * (0.05 + 0.3 * clamp(1 - (front - flood[i]) / 2.5, 0, 1));
        ctx.fillRect(ox + (i % COLS) * cs + 1, oy + ((i / COLS) | 0) * cs + 1, cs - 1, cs - 1);
      }
    }
    ctx.fillStyle = CORAL;
    for (let i = 0; i < N; i++) {
      if (trail[i] <= 0) continue;
      ctx.globalAlpha = trail[i] * 0.7;
      ctx.beginPath(); ctx.arc(sxOf(i), syOf(i), cs * 0.06, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const shown = phase === 'think' ? Math.ceil(routeLen * clamp((pt / pdur - 0.3) / 0.6, 0, 1)) : routeLen;
    if (shown > 0) {                     // the planned route, marching towards the flag
      ctx.save();
      ctx.strokeStyle = ctx.shadowColor = TEAL; ctx.shadowBlur = 8;
      ctx.lineWidth = Math.max(1.5, cs * 0.06); ctx.lineCap = ctx.lineJoin = 'round';
      ctx.setLineDash(dash); ctx.lineDashOffset = -time * cs * 0.8;
      ctx.beginPath(); ctx.moveTo(ox + bot.x * cs, oy + bot.y * cs);
      for (let r = 0; r < shown; r++) ctx.lineTo(sxOf(route[r]), syOf(route[r]));
      ctx.stroke(); ctx.restore();
    }
    drawGoal();
    for (let i = 0; i < N; i++) {        // walls; the visitor's own are outlined in coral
      if (wallT[i] < 0.02) continue;
      const s = cs * 0.86 * wallT[i], x = sxOf(i), y = syOf(i);
      ctx.fillStyle = '#2b2d3c'; tile(x, y, s, cs * 0.12); ctx.fill();
      if (kind[i] === 2) { ctx.strokeStyle = CORAL; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.fillStyle = '#3c4054';
      ctx.beginPath(); ctx.roundRect(x - s / 2, y - s / 2, s, s * 0.3, cs * 0.12); ctx.fill();
    }
    if (flashT > 0) {                    // the wall (or board edge) the sensor just hit
      const j = step(flashCell, flashDir), dx = DX[flashDir], dy = DY[flashDir];
      ctx.globalAlpha = flashT * 0.85; ctx.fillStyle = CORAL;
      if (j >= 0) { tile(sxOf(j), syOf(j), cs * 0.86, cs * 0.12); ctx.fill(); }
      else ctx.fillRect(sxOf(flashCell) + dx * cs * 0.5 - (dy ? cs * 0.45 : 2), syOf(flashCell) + dy * cs * 0.5 - (dx ? cs * 0.45 : 2), dy ? cs * 0.9 : 4, dx ? cs * 0.9 : 4);
      ctx.globalAlpha = 1;
    }
    drawGhost(hover, false);
    if (focused) drawGhost(cursor, true);
    drawSensor();
    drawBot();
    ctx.strokeStyle = AMBER; ctx.lineWidth = 2;
    for (let b = 0; b < BN; b++) {
      if (bt[b] >= 1) continue;
      ctx.globalAlpha = 1 - bt[b];
      ctx.beginPath(); ctx.arc(ox + bx[b] * cs, oy + by[b] * cs, cs * (0.3 + bt[b] * 0.9), 0, TAU); ctx.stroke();
    }
    for (let p = 0; p < PN; p++) {
      if (plife[p] <= 0) continue;
      ctx.globalAlpha = Math.min(1, plife[p] * 1.5); ctx.fillStyle = CONFETTI[p % 4];
      ctx.fillRect(ox + px[p] * cs, oy + py[p] * cs, cs * 0.09, cs * 0.05 + Math.abs(Math.sin(time * 9 + p)) * cs * 0.06);
    }
    ctx.globalAlpha = 1;
  }

  function drawGoal() {
    const gx = sxOf(goal), gy = syOf(goal), wave = phase === 'party' ? 14 : 5, fade = phase === 'swap' ? bot.alpha : 1;
    ctx.globalAlpha = fade * (0.45 + 0.25 * Math.sin(time * 3)); ctx.strokeStyle = TEAL; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(gx, gy, cs * (0.34 + 0.04 * Math.sin(time * 3)), 0, TAU); ctx.stroke();
    ctx.globalAlpha = fade;
    const pole = gx - cs * 0.13, top = gy - cs * 0.3;
    ctx.strokeStyle = SHELL; ctx.lineWidth = Math.max(1.2, cs * 0.04);
    ctx.beginPath(); ctx.moveTo(pole, gy + cs * 0.28); ctx.lineTo(pole, top); ctx.stroke();
    ctx.fillStyle = CORAL; ctx.beginPath(); ctx.moveTo(pole, top);
    ctx.quadraticCurveTo(pole + cs * 0.17, top + Math.sin(time * wave) * cs * 0.06, pole + cs * 0.36, top + cs * 0.1 + Math.sin(time * wave + 1) * cs * 0.04);
    ctx.lineTo(pole, top + cs * 0.22); ctx.fill();
    ctx.globalAlpha = 1;
  }

  const blocked = (i) => i === bot.c || i === bot.prev || i === goal || phase === 'swap' || phase === 'party';
  function drawGhost(i, isCursor) {      // a preview of what a click would do there
    if (i < 0) return;
    const x = sxOf(i), y = syOf(i), no = blocked(i);
    if (!no && !walls[i]) { ctx.globalAlpha = 0.28; ctx.fillStyle = CORAL; tile(x, y, cs * 0.86, cs * 0.12); ctx.fill(); }
    ctx.globalAlpha = 0.9; ctx.lineWidth = isCursor ? 2 : 1.5;
    ctx.strokeStyle = isCursor ? AMBER : no ? '#ff5a4e' : walls[i] ? SHELL : CORAL;
    ctx.setLineDash(isCursor ? solid : dash); tile(x, y, cs - 4, cs * 0.14); ctx.stroke(); ctx.setLineDash(solid);
    if (walls[i] && !no) {               // a cross: clicking here takes the wall away
      const m = cs * 0.18;
      ctx.beginPath(); ctx.moveTo(x - m, y - m); ctx.lineTo(x + m, y + m); ctx.moveTo(x + m, y - m); ctx.lineTo(x - m, y + m); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawSensor() {
    if (bot.alpha < 0.05) return;
    const d = ((Math.round(bot.ang / QUARTER) % 4) + 4) % 4;
    const r = range(Math.floor(bot.y) * COLS + Math.floor(bot.x), d);
    const len = (r + 0.5) * cs - cs * 0.28, sensing = phase === 'sense' ? 1 - pt / pdur : 0;
    ctx.save();
    ctx.translate(ox + bot.x * cs, oy + bot.y * cs); ctx.rotate(bot.ang); ctx.translate(cs * 0.28, 0);
    ctx.fillStyle = ctx.strokeStyle = r === 0 ? CORAL : TEAL;
    ctx.globalAlpha = bot.alpha * (0.06 + 0.1 * sensing);
    for (let k = 1; k <= 3; k++) {       // stacked wedges fake a soft falloff
      const l = (len * k) / 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(l, -l * 0.42); ctx.lineTo(l, l * 0.42); ctx.fill();
    }
    if (sensing > 0) {                   // the ping travelling out to whatever it hits
      ctx.globalAlpha = bot.alpha * sensing; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, len * (1 - sensing) + 2, -0.4, 0.4); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBot() {
    const hop = phase === 'party' ? Math.abs(Math.sin(pt * 9)) * 0.16 * (1 - pt / pdur) : 0;
    const sx = ox + bot.x * cs, sy = oy + (bot.y - hop) * cs;
    ctx.save(); ctx.globalAlpha = bot.alpha;
    ctx.translate(sx, sy); ctx.rotate(bot.ang); ctx.scale(cs, cs);
    ctx.fillStyle = DARK;                // wheels, with treads that roll as it drives
    ctx.fillRect(-0.27, -0.37, 0.54, 0.12); ctx.fillRect(-0.27, 0.25, 0.54, 0.12);
    ctx.strokeStyle = '#555869'; ctx.lineWidth = 0.025; ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const tx = -0.25 + ((j * 0.11 + bot.tread * 0.06) % 0.55);
      ctx.moveTo(tx, -0.36); ctx.lineTo(tx, -0.26); ctx.moveTo(tx, 0.26); ctx.lineTo(tx, 0.36);
    }
    ctx.stroke();
    ctx.shadowColor = CORAL; ctx.shadowBlur = cs * 0.5; ctx.fillStyle = SHELL;
    ctx.beginPath(); ctx.roundRect(-0.28, -0.26, 0.56, 0.52, 0.12); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = CORAL;
    ctx.beginPath(); ctx.roundRect(-0.2, -0.17, 0.3, 0.34, 0.07); ctx.fill();
    const beeping = phase === 'think' || phase === 'party' || (phase === 'act' && branch === 'wall');
    ctx.fillStyle = beeping && Math.sin(time * 18) > 0 ? AMBER : '#5a2a20';
    ctx.beginPath(); ctx.arc(-0.05, 0, 0.055, 0, TAU); ctx.fill();
    ctx.fillStyle = DARK;                // sensor head and its two eyes
    ctx.beginPath(); ctx.roundRect(0.16, -0.13, 0.14, 0.26, 0.05); ctx.fill();
    ctx.fillStyle = ctx.shadowColor = range(bot.c, bot.dir) === 0 && phase !== 'act' ? CORAL : TEAL; ctx.shadowBlur = cs * 0.3;
    ctx.beginPath(); ctx.arc(0.24, -0.055, 0.035, 0, TAU); ctx.arc(0.24, 0.055, 0.035, 0, TAU); ctx.fill();
    ctx.restore();
    if (phase !== 'think') return;
    ctx.fillStyle = AMBER;               // thinking dots, kept upright above the robot
    for (let j = 0; j < 3; j++) {
      ctx.globalAlpha = 0.25 + 0.75 * Math.max(0, Math.sin(time * 9 - j * 0.9));
      ctx.beginPath(); ctx.arc(sx + (j - 1) * cs * 0.15, sy - cs * 0.6, Math.max(1.5, cs * 0.05), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ interaction
  function toggle(i) {
    if (i < 0) return;
    if (blocked(i)) { live.textContent = `${label(i)} can't take a wall right now.`; return; }
    walls[i] = walls[i] ? 0 : 2;
    if (walls[i]) kind[i] = 2;
    live.textContent = `Wall ${walls[i] ? 'placed' : 'removed'} at ${label(i)}. The robot re-plans its route.`;
    boxes[0].v.textContent = `map: ${walls[i] ? '+' : '−'}wall ${label(i)}`;
    alertInput(); stuck = 0;
    if (!reduced) { if (phase === 'think') think(); else mapDirty = true; return; }
    wallT[i] = walls[i] ? 1 : 0;         // reduced motion: re-plan on the spot, no animation
    bfs(goal, dist); buildRoute();
    boxes[1].v.textContent = dist[bot.c] >= 0 ? `BFS: ${dist[bot.c]} steps` : 'BFS: no route';
  }
  const cellAt = (e) => {
    const x = Math.floor((e.offsetX - ox) / cs), y = Math.floor((e.offsetY - oy) / cs);
    return x < 0 || y < 0 || x >= COLS || y >= ROWS ? -1 : y * COLS + x;
  };
  const redraw = () => { if (!loop.running) draw(); };
  const setFocus = (on) => { focused = on; hint.textContent = on ? 'Arrows move · Enter places a wall' : HINT; redraw(); };
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    hover = cellAt(e);
    canvas.style.cursor = hover < 0 ? 'default' : blocked(hover) ? 'not-allowed' : 'pointer';
    redraw();
  });
  canvas.addEventListener('pointerleave', () => { hover = -1; redraw(); });
  // click rather than pointerdown, so a finger scrolling the page never drops a wall.
  canvas.addEventListener('click', (e) => { toggle(cellAt(e)); redraw(); });
  canvas.addEventListener('focus', () => { if (cursor < 0) cursor = bot.c; setFocus(canvas.matches(':focus-visible')); });
  canvas.addEventListener('blur', () => setFocus(false));
  canvas.addEventListener('keydown', (e) => {
    const d = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].indexOf(e.key);
    if (d >= 0) {
      const j = step(cursor, d);
      if (j >= 0) cursor = j;
      live.textContent = `${label(cursor)}${walls[cursor] ? ', wall' : cursor === goal ? ', flag' : cursor === bot.c ? ', robot' : ''}`;
    } else if (e.key === 'Enter' || e.key === ' ') toggle(cursor);
    else return;
    e.preventDefault();
    if (!focused) setFocus(true); else redraw();
  });

  // ------------------------------------------------------------ boot
  const loop = createLoop((dt) => { update(dt); draw(); });
  fit(); newLayout(); think();
  if (reduced) {
    // Run the robot forward until it meets a wall, then freeze that moment as the still.
    for (let n = 0; n < 900 && phase !== 'party'; n++) {
      update(1 / 30);
      if (phase === 'act' && branch === 'wall' && pt > pdur * 0.4) break;
    }
    wallT.set(walls); floodA = 0; flashT = 0.6; code.dataset.phase = 1;
    boxes.forEach((b) => b.b.classList.add('on'));
    lines[4].classList.add('on');
  }
  draw();

  return {
    start() { if (reduced) draw(); else loop.start(); },
    stop() { loop.stop(); },
  };
}
