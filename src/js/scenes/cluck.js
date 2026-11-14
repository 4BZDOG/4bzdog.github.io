// Cluckwork Valley as a pixel-art valley on a day/night cycle. Chicken Co Tower's elevator
// climbs to whichever floor you click, the Iron Golem's eyes follow the pointer and glow at
// night, and the free-range CEO chicken (in a hard hat) earns a Cluckcoin when you poke it.

import { createLoop, makeCanvas, mulberry32, hashString, clamp, lerp } from '../lib.js';

const COLS = 64, ROWS = 40;            // logical pixel grid, 16:10 like the host
const GROUND = 32;                     // grass row, dirt below
const FLOORS = 30;
const FLOOR_H = 26 / FLOORS;           // the tower spans rows 6 to 32
const CYCLE = 36;                      // seconds for one full day
const TX0 = 40, TX1 = 52, SHAFT0 = 44, SHAFT1 = 48;
const NAMES = { 17: 'EGG ACCOUNTING', 30: 'PROMOTION' };
const LINES = [
  'Bawk! +1 Cluckcoin.', 'Productivity is up 12 eggs!', 'Have you met the golem? Nice guy.',
  'Floor 17 is Egg Accounting.', 'Observer says: still watching.',
];

const EGG = [255, 248, 231], BEAK = [255, 150, 40], RED = [217, 52, 43], INK = [14, 12, 10];
const GRASS = [92, 176, 60], GRASS_D = [61, 125, 38], CANE = [132, 208, 98];
const DIRT = [139, 90, 43], DIRT_D = [104, 66, 30];
const IRON = [196, 204, 210], IRON_D = [128, 140, 150], GLASS = [38, 52, 110], DARK = [27, 33, 71];
const NIGHT_WALL = [120, 124, 150], DIM_EYE = [70, 80, 100];
const SKY_NIGHT = [[8, 11, 30], [22, 28, 64]];
const SKY_DAY = [[40, 86, 140], [96, 150, 196]];
const CHICKEN = ['..HHH.', '.HHHHH', '..WkY.', '.WWWWW', 'WWWWWW', '.Y..Y.'];

const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mixc = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

export default function cluck(host, { reduced, accent, seed }) {
  const gold = accent || '#f6c431';
  const rand = mulberry32(hashString(seed));
  const view = makeCanvas(host, () => { if (!loop.running) draw(); });
  const { ctx, canvas } = view;

  // Fixed scenery, drawn from the seed so every repo gets its own valley.
  const stars = Array.from({ length: 34 }, () => [rand() * COLS, rand() * 20, rand() * 6]);
  const lit = Array.from({ length: FLOORS + 1 }, () => [rand() < 0.55, rand() < 0.55]);
  const cane = Array.from({ length: 9 }, (_, i) => ({ x: 22 + i * 2, ph: rand() * 6, h: 4 + rand() * 4 }));
  const specks = Array.from({ length: 60 }, () => [rand() * COLS, GROUND + 1 + rand() * (ROWS - GROUND - 1)]);

  const chick = { x: 24, y: 26, dir: 1, walk: 0, idle: 1 };
  const golem = { look: 0.5 };
  const elev = { f: reduced ? 17 : 1, label: 17, target: null, wait: 1.5, ding: reduced ? 1.8 : 0 };
  let time = CYCLE * 0.85;                       // start at night: lamps on, stars out
  let coins = 0, pops = [], lineIdx = 1;
  let speech = { text: LINES[0], t: reduced ? 99 : 0 };
  let px = 1, py = 1, W = 0, H = 0;
  const ptr = { x: null, y: null };

  const floorY = (f) => GROUND - (f - 0.5) * FLOOR_H;
  const daylight = () => 0.5 - 0.5 * Math.cos((time / CYCLE) * Math.PI * 2);

  /** One "pixel": a rectangle on the logical grid, snapped so neighbours never seam. */
  function R(x, y, w, h, col) {
    const x0 = Math.floor(x * px), y0 = Math.floor(y * py);
    ctx.fillStyle = typeof col === 'string' ? col : rgb(col);
    ctx.fillRect(x0, y0, Math.ceil((x + w) * px) - x0, Math.ceil((y + h) * py) - y0);
  }
  function disc(cx, cy, r, col) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) R(cx + dx, cy + dy, 1, 1, col);
    }
  }
  function sprite(rows, x, y, pal) {
    rows.forEach((row, r) => [...row].forEach((ch, c) => { if (pal[ch]) R(x + c, y + r, 1, 1, pal[ch]); }));
  }

  // ------------------------------------------------------------ simulation

  function update(dt) {
    time += dt;
    elev.ding = Math.max(0, elev.ding - dt);

    // The lift obeys a click; otherwise it hops between random floors like a busy shift.
    if (elev.target != null) {
      const gap = elev.target - elev.f, step = 7 * dt;
      elev.f = Math.abs(gap) <= step ? elev.target : elev.f + Math.sign(gap) * step;
      if (elev.f === elev.target) {
        elev.label = elev.target;
        elev.target = null;
        elev.ding = 1.8;
        elev.wait = 2.5 + rand() * 2.5;
      }
    } else if ((elev.wait -= dt) <= 0) {
      elev.target = 1 + Math.floor(rand() * FLOORS);
    }

    // The free-range chicken wanders, then pauses.
    if (chick.walk > 0) {
      chick.walk -= dt;
      chick.x = clamp(chick.x + chick.dir * 2.2 * dt, 22, 33);
      chick.y = 26 - Math.abs(Math.sin(time * 12)) * 0.5;
      if (chick.walk <= 0) chick.idle = 1.5 + rand() * 2.5;
    } else {
      chick.y = 26;
      if ((chick.idle -= dt) <= 0) {
        chick.walk = 2 + rand() * 2;
        chick.dir = chick.x > 28 ? -1 : chick.x < 26 ? 1 : rand() < 0.5 ? -1 : 1;
      }
    }

    // The golem's eyes follow the pointer, or the chicken when nobody is looking.
    const aim = ptr.x != null ? ptr.x : chick.x + 3;
    golem.look = lerp(golem.look, clamp((aim - 11.5) / 8, -1, 1), 1 - Math.exp(-dt * 5));

    speech.t -= dt;
    pops = pops.filter((p) => (p.t += dt) < 0.9);
  }

  // ------------------------------------------------------------ drawing

  function drawSky(d, fs) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, rgb(mixc(SKY_NIGHT[0], SKY_DAY[0], d)));
    sky.addColorStop(1, rgb(mixc(SKY_NIGHT[1], SKY_DAY[1], d)));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const night = clamp((0.5 - d) * 3, 0, 1);
    for (const [sx, sy, tw] of stars) {
      ctx.globalAlpha = night * (0.5 + 0.5 * Math.sin(time * 2 + tw));
      R(sx, sy, 1, 1, EGG);
    }
    ctx.globalAlpha = 1;

    // Sun and moon travel opposite each other on an arc; whichever is below the ground is hidden.
    const th = ((time / CYCLE) % 1 - 0.25) * Math.PI * 2;
    disc(32 - Math.cos(th) * 30, 30 - Math.sin(th) * 26, 2, [255, 214, 110]);
    disc(32 + Math.cos(th) * 30, 30 + Math.sin(th) * 26, 2, [214, 224, 255]);
  }

  function drawValley() {
    for (let c = 0; c < COLS; c++) R(c, GROUND, 1, 1, (c * 37) % 7 < 2 ? GRASS_D : GRASS);
    R(0, GROUND + 1, COLS, ROWS - GROUND - 1, DIRT);
    for (const [sx, sy] of specks) R(sx, sy, 1, 1, DIRT_D);
    for (const c of cane) {
      const h = Math.floor(c.h * (0.7 + 0.3 * Math.sin(time * 0.6 + c.ph)));
      for (let r = 1; r <= h; r++) R(c.x, GROUND - r, 1, 1, r % 3 ? CANE : GRASS_D);
    }
  }

  function drawTower(d) {
    const wall = mixc(NIGHT_WALL, EGG, clamp(d * 1.5, 0, 1));
    R(TX0 - 1, 4.5, TX1 - TX0 + 2, 1.2, RED);
    for (let f = 1; f <= FLOORS; f++) {
      const top = floorY(f) - FLOOR_H / 2;
      R(TX0, top, TX1 - TX0, FLOOR_H, wall);
      R(TX0, top + FLOOR_H - 0.15, TX1 - TX0, 0.15, mixc(wall, INK, 0.25));
      R(SHAFT0, top, SHAFT1 - SHAFT0, FLOOR_H, DARK);
      R(TX0 + 1, top + 0.2, 2, FLOOR_H - 0.5, lit[f][0] ? gold : GLASS);
      R(TX1 - 3, top + 0.2, 2, FLOOR_H - 0.5, lit[f][1] ? gold : GLASS);
    }
    // The lift cabin and its rope.
    const cy = floorY(elev.f) - 0.45;
    R(SHAFT0 + 1.9, 6, 0.2, cy - 6, [150, 160, 190]);
    R(SHAFT0 + 0.5, cy, 3, 0.9, gold);
  }

  function drawGolem(d) {
    R(9, 12, 6, 5, IRON);   R(9, 16, 6, 1, IRON_D);            // head
    R(6, 17, 12, 9, IRON);  R(6, 25, 12, 1, IRON_D);           // torso
    R(3, 18, 3, 8, IRON);   R(18, 18, 3, 8, IRON);             // arms
    R(3, 25, 3, 1, IRON_D); R(18, 25, 3, 1, IRON_D);
    R(8, 26, 3, 6, IRON);   R(13, 26, 3, 6, IRON);             // legs
    R(8, 31, 3, 1, IRON_D); R(13, 31, 3, 1, IRON_D);
    const eye = d < 0.5 ? gold : DIM_EYE;
    const ex = golem.look * 0.8;
    ctx.shadowColor = gold;
    ctx.shadowBlur = d < 0.5 ? 10 : 0;
    R(10 + ex, 14, 1, 1, eye);
    R(13 + ex, 14, 1, 1, eye);
    ctx.shadowBlur = 0;
  }

  function drawChicken() {
    sprite(CHICKEN, chick.x, chick.y, { H: gold, W: EGG, k: INK, Y: BEAK });
  }

  function drawLabels(fs, font) {
    ctx.font = font;
    ctx.textBaseline = 'middle';

    // Elevator announcement, pinned to the tower's left wall beside the floor it reached.
    if (elev.ding > 0) {
      const f = elev.label;
      const text = `DING! FLOOR ${f}${NAMES[f] ? ' · ' + NAMES[f] : ''}`;
      const bw = ctx.measureText(text).width + fs * 1.2, bh = fs * 1.9;
      const bx = Math.max(4, TX0 * px - bw - 8), by = floorY(f) * py - bh / 2;
      ctx.globalAlpha = clamp(elev.ding, 0, 1);
      ctx.fillStyle = rgb(INK);
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = gold;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
      ctx.fillStyle = gold;
      ctx.fillText(text, bx + fs * 0.6, by + bh / 2);
      ctx.globalAlpha = 1;
    }

    // Chicken speech bubble.
    if (speech.t > 0) {
      const bw = ctx.measureText(speech.text).width + fs * 1.2, bh = fs * 1.9;
      const bx = clamp((chick.x + 3) * px - bw / 2, 6, W - bw - 6);
      const by = (chick.y - 2.6) * py - bh;
      ctx.globalAlpha = clamp(speech.t, 0, 1);
      ctx.fillStyle = rgb(INK);
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = gold;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
      ctx.fillStyle = rgb(EGG);
      ctx.fillText(speech.text, bx + fs * 0.6, by + bh / 2);
      ctx.globalAlpha = 1;
    }

    // Cluckcoin pops rise and fade.
    for (const p of pops) {
      ctx.globalAlpha = 1 - p.t / 0.9;
      ctx.fillStyle = gold;
      ctx.fillText(p.text, p.x * px, (p.y - p.t * 4) * py);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud(fs, font) {
    ctx.font = font;
    ctx.textBaseline = 'top';
    const pre = 'CLUCKWORK VALLEY · CLUCKCOINS ';
    const num = String(coins).padStart(3, '0');
    const pad = fs * 0.5, y = 8;
    const w1 = ctx.measureText(pre).width, w2 = ctx.measureText(num).width;
    ctx.fillStyle = 'rgba(9,11,18,0.72)';
    ctx.fillRect(8, y, w1 + w2 + pad * 2, fs * 1.8);
    ctx.fillStyle = 'rgba(220,225,245,0.85)';
    ctx.fillText(pre, 8 + pad, y + fs * 0.4);
    ctx.fillStyle = gold;
    ctx.fillText(num, 8 + pad + w1, y + fs * 0.4);
    ctx.font = `500 ${fs * 0.8}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(220,225,245,0.6)';
    ctx.textBaseline = 'bottom';
    ctx.fillText('CHICKEN CO · 30F', TX0 * px, 4 * py - 4);
  }

  function draw() {
    W = view.w; H = view.h;
    if (!W || !H) return;
    px = W / COLS; py = H / ROWS;
    const d = daylight();
    const fs = clamp(W * 0.02, 9, 13);
    const font = `500 ${fs}px "JetBrains Mono", monospace`;

    drawSky(d, fs);
    drawValley();
    drawTower(d);
    drawGolem(d);
    drawChicken();
    drawLabels(fs, font);
    drawHud(fs, font);
  }

  // ------------------------------------------------------------ pointer

  /** Pointer position in logical grid units, relative to the canvas (not the page). */
  function locate(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * COLS, y: ((e.clientY - r.top) / r.height) * ROWS };
  }
  const overChick = (p) => p.x >= chick.x - 0.5 && p.x <= chick.x + 6.5 && p.y >= chick.y - 0.5 && p.y <= chick.y + 6.5;
  const inTower = (p) => p.x >= TX0 - 1 && p.x <= TX1 + 1 && p.y >= 4 && p.y <= GROUND;

  function onMove(e) {
    const p = locate(e);
    ptr.x = p.x; ptr.y = p.y;
    canvas.style.cursor = overChick(p) || inTower(p) ? 'pointer' : 'default';
  }
  function onLeave() { ptr.x = null; ptr.y = null; }

  function onClick(e) {
    const p = locate(e);
    if (overChick(p)) {
      coins++;
      speech = { text: LINES[lineIdx++ % LINES.length], t: 2.6 };
      pops.push({ x: chick.x + 3, y: chick.y, t: 0, text: '+1' });
    } else if (inTower(p)) {
      // Floor 1 is the bottom of the tower, floor 30 the top.
      elev.target = clamp(Math.round((GROUND - p.y) / FLOOR_H + 0.5), 1, FLOORS);
      if (reduced) {
        elev.f = elev.target; elev.label = elev.target; elev.target = null; elev.ding = 1.8;
      }
    }
    if (!loop.running) draw();
  }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);

  const loop = createLoop((dt) => { update(dt); draw(); });

  draw();
  return {
    start() { if (reduced) { draw(); return; } loop.start(); },
    stop() { loop.stop(); },
  };
}
