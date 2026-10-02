import { reducedMotion, createLoop, clamp } from './lib.js';

const reduced = reducedMotion.matches;

/* ==========================================================================
   Hero: the handle drawn in dots, each on a spring back to its home pixel.
   ========================================================================== */

function hueOf(color) {
  const hsl = color.match(/hsl\(\s*([\d.]+)/i);
  if (hsl) return Number(hsl[1]);
  const m = color.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return 0;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

async function initHero() {
  const stage = document.querySelector('.hero-stage');
  const canvas = stage?.querySelector('.hero-canvas');
  if (!stage || !canvas) return;
  const ctx = canvas.getContext('2d');
  const word = stage.querySelector('.hero-word').textContent.trim();
  const palette = (stage.dataset.accents || '#ece6d8').split(',').filter(Boolean);
  palette.sort((a, b) => hueOf(a) - hueOf(b));

  // Wait (briefly) for the display face so the dots trace the real letterforms.
  try {
    await Promise.race([
      document.fonts.load('800 200px "Bricolage Grotesque"', word),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* system serif is fine */ }

  let W = 0, H = 0, dpr = 1, size = 3;
  let n = 0;
  let hx, hy, x, y, vx, vy, col;
  const groups = palette.map(() => []);
  const pointer = { x: -1e4, y: -1e4, px: 0, py: 0, vx: 0, vy: 0, active: false, last: 0 };
  let energy = 1;
  let radius = 90;

  function build(intro) {
    const r = canvas.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fit the word inside the stage box, then rasterise it off-screen.
    const boxW = sr.width * 0.98, boxH = sr.height * 0.92;
    const off = document.createElement('canvas');
    off.width = Math.ceil(W); off.height = Math.ceil(H);
    const o = off.getContext('2d', { willReadFrequently: true });
    let fs = boxH;
    o.font = `800 ${fs}px "Bricolage Grotesque", Impact, sans-serif`;
    const mw = o.measureText(word).width;
    if (mw > boxW) fs *= boxW / mw;
    o.font = `800 ${fs}px "Bricolage Grotesque", Impact, sans-serif`;
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.fillStyle = '#fff';
    const cx = sr.left - r.left + sr.width / 2;
    const cy = sr.top - r.top + sr.height / 2 + fs * 0.04;
    o.fillText(word, cx, cy);

    const gap = clamp(Math.round(fs / 34), 3, 9);
    size = Math.max(2, gap * 0.64);
    radius = clamp(fs * 0.42, 50, 140);
    const data = o.getImageData(0, 0, off.width, off.height).data;
    const pts = [];
    const textW = Math.min(mw * (fs / (boxH || 1)), boxW);
    const left = cx - textW / 2;
    for (let py = 0; py < off.height; py += gap) {
      for (let px = 0; px < off.width; px += gap) {
        if (data[(py * off.width + px) * 4 + 3] > 140) pts.push(px, py);
      }
    }
    n = pts.length / 2;
    hx = new Float32Array(n); hy = new Float32Array(n);
    x = new Float32Array(n); y = new Float32Array(n);
    vx = new Float32Array(n); vy = new Float32Array(n);
    col = new Uint8Array(n);
    groups.forEach((g) => (g.length = 0));
    for (let i = 0; i < n; i++) {
      hx[i] = pts[i * 2]; hy[i] = pts[i * 2 + 1];
      const t = (hx[i] - left) / textW;
      const c = clamp(Math.floor(t * palette.length + (Math.random() - 0.5) * 1.5), 0, palette.length - 1);
      col[i] = c;
      groups[c].push(i);
      if (intro) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.max(W, H) * (0.3 + Math.random() * 0.5);
        x[i] = cx + Math.cos(a) * d;
        y[i] = cy + Math.sin(a) * d * 0.5;
      } else {
        x[i] = hx[i]; y[i] = hy[i];
      }
    }
    stage.classList.add('is-live');
    energy = 1;
  }

  function impulse(px, py, strength, reach) {
    for (let i = 0; i < n; i++) {
      const dx = x[i] - px, dy = y[i] - py;
      const d = Math.hypot(dx, dy) || 1;
      if (d > reach) continue;
      const f = (1 - d / reach) * strength;
      vx[i] += (dx / d) * f;
      vy[i] += (dy / d) * f;
    }
    energy = 1;
    loop.start();
  }

  function step(dt) {
    const k = 0.05, damp = 0.86;
    const steps = Math.max(1, Math.round(dt * 60));
    const R = radius, R2 = R * R;
    let e = 0;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < n; i++) {
        if (pointer.active) {
          const dx = x[i] - pointer.x, dy = y[i] - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 1;
            const f = (1 - d / R) ** 2 * 5.5;
            vx[i] += (dx / d) * f + pointer.vx * 0.04 * f;
            vy[i] += (dy / d) * f + pointer.vy * 0.04 * f;
          }
        }
        vx[i] = (vx[i] + (hx[i] - x[i]) * k) * damp;
        vy[i] = (vy[i] + (hy[i] - y[i]) * k) * damp;
        x[i] += vx[i];
        y[i] += vy[i];
      }
    }
    for (let i = 0; i < n; i += 7) e += Math.abs(vx[i]) + Math.abs(vy[i]) + Math.abs(hx[i] - x[i]) * 0.1;
    energy = e / Math.max(1, n / 7);
    pointer.vx *= 0.8; pointer.vy *= 0.8;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let c = 0; c < groups.length; c++) {
      ctx.fillStyle = palette[c];
      const g = groups[c];
      for (let j = 0; j < g.length; j++) {
        const i = g[j];
        const sp = Math.min(1.4, (Math.abs(vx[i]) + Math.abs(vy[i])) * 0.06);
        const s = size * (1 + sp);
        ctx.fillRect(x[i] - s / 2, y[i] - s / 2, s, s);
      }
    }
  }

  const loop = createLoop((dt) => {
    step(dt);
    draw();
    // Sleep when everything has settled and nobody is poking it.
    if (energy < 0.02 && !pointer.active) loop.stop();
  });

  build(!reduced);
  if (reduced) draw(); else loop.start();

  let resizeT = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { build(false); draw(); }, 120);
  }).observe(stage);

  const toLocal = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  stage.addEventListener('pointermove', (e) => {
    const [px, py] = toLocal(e);
    if (pointer.active) { pointer.vx = px - pointer.x; pointer.vy = py - pointer.y; }
    pointer.x = px; pointer.y = py; pointer.active = true; pointer.last = performance.now();
    loop.start();
  });
  stage.addEventListener('pointerleave', () => { pointer.active = false; pointer.x = pointer.y = -1e4; });
  stage.addEventListener('pointerdown', (e) => {
    const [px, py] = toLocal(e);
    impulse(px, py, 22, radius * 2.4);
  });

  // An occasional ripple so the letters feel alive even when nobody is touching them.
  let heroVisible = true;
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    if (!heroVisible) loop.stop(); else if (energy > 0.02) loop.start();
  }).observe(stage);
  if (!reduced) {
    setInterval(() => {
      if (!heroVisible || document.hidden || performance.now() - pointer.last < 4000 || !n) return;
      const i = Math.floor(Math.random() * n);
      impulse(hx[i], hy[i], 6, radius * 1.6);
    }, 6500);
  }
}

/* ==========================================================================
   Project scenes: loaded lazily, and only animated while on screen.
   ========================================================================== */

const KNOWN_SCENES = new Set(['truss', 'terms', 'noise', 'band6', 'maths', 'puzzle', 'softeng', 'entcomp', 'constellation']);
const instances = new Map();
const visible = new Set();

async function mountScene(host) {
  if (instances.has(host)) return instances.get(host);
  const name = KNOWN_SCENES.has(host.dataset.scene) ? host.dataset.scene : 'constellation';
  const promise = import(`./scenes/${name}.js`).then((mod) => {
    const accent = getComputedStyle(host).getPropertyValue('--accent').trim();
    return mod.default(host, { reduced, accent, seed: host.dataset.seed || name });
  });
  instances.set(host, promise);
  return promise;
}

function initScenes() {
  const hosts = document.querySelectorAll('[data-scene]');
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const host = entry.target;
        if (entry.isIntersecting) {
          visible.add(host);
          mountScene(host).then((s) => visible.has(host) && !document.hidden && s.start());
        } else {
          visible.delete(host);
          instances.get(host)?.then((s) => s.stop());
        }
      }
    },
    { rootMargin: '120px 0px' },
  );
  hosts.forEach((h) => io.observe(h));

  document.addEventListener('visibilitychange', () => {
    for (const host of visible) instances.get(host)?.then((s) => (document.hidden ? s.stop() : s.start()));
  });
}

/* ==========================================================================
   Plate tilt + holographic sheen.
   ========================================================================== */

function initTilt() {
  if (reduced) return;
  for (const frame of document.querySelectorAll('[data-tilt]')) {
    frame.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = frame.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      frame.classList.add('tilting');
      frame.style.setProperty('--ry', `${((px - 0.5) * 6).toFixed(2)}deg`);
      frame.style.setProperty('--rx', `${((0.5 - py) * 4).toFixed(2)}deg`);
      frame.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      frame.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      frame.style.setProperty('--glare', '1');
    });
    frame.addEventListener('pointerleave', () => {
      frame.classList.remove('tilting');
      frame.style.setProperty('--rx', '0deg');
      frame.style.setProperty('--ry', '0deg');
      frame.style.setProperty('--glare', '0');
    });
  }
}

/* ==========================================================================
   Page chrome: reveal on scroll, sticky header, active nav, HUD count-up.
   ========================================================================== */

function initReveal() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
  );
  document.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n));
}

function initTopbar() {
  const bar = document.querySelector('.topbar');
  const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const links = new Map([...bar.querySelectorAll('nav a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const link = links.get(e.target.id);
        if (link) link.classList.toggle('active', e.isIntersecting);
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  for (const id of links.keys()) {
    const section = document.getElementById(id);
    if (section) io.observe(section);
  }
}

function initCountUp() {
  if (reduced) return;
  for (const dd of document.querySelectorAll('.hud dd')) {
    const raw = dd.dataset.count || '';
    if (!/^[\d,]+$/.test(raw)) continue;
    const target = Number(raw.replace(/,/g, ''));
    const width = raw.length;
    const padded = /^0\d/.test(raw);
    const t0 = performance.now();
    const dur = 1400;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const v = Math.round(target * (1 - (1 - t) ** 3));
      dd.textContent = padded ? String(v).padStart(width, '0') : v.toLocaleString('en-AU');
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

initReveal();
initTopbar();
initTilt();
initScenes();
initCountUp();
initHero();
