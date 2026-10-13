// Page-wide motion layer: scroll progress, a cursor spotlight, magnetic buttons,
// a scramble on the chapter headings, staggered entrances, a ticking marquee,
// a drifting atmosphere and a logo burst. Each part runs on its own, so one
// failure never takes down the rest, and the page is complete without any of it.

const FINE = '(hover: hover) and (pointer: fine)';
const SCRAMBLE_MS = 700;
const GLYPHS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz' };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const restore = (el, name, value) => (value === null ? el.removeAttribute(name) : el.setAttribute(name, value));

function part(name, fn) {
  try {
    fn();
  } catch (err) {
    // Drop the ready flag so nothing stays hidden if a part that relies on it has failed.
    document.documentElement.classList.remove('motion-ready');
    console.warn(`motion: ${name} unavailable`, err);
  }
}

export default function motion({ reduced } = {}) {
  const isReduced = Boolean(reduced) || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const palette = accents();

  // Entrance states are hidden only from here on, so if this module never runs, nothing stays hidden.
  if (!isReduced) document.documentElement.classList.add('motion-ready');

  part('scroll', () => initScroll(isReduced, palette));
  part('marquee', () => initMarquee(isReduced));
  part('indexes', initIndexes);
  if (!isReduced) {
    part('stagger', initStagger);
    part('scramble', initScramble);
    part('burst', () => initBurst(palette));
    if (window.matchMedia(FINE).matches) {
      part('spotlight', initSpotlight);
      part('magnetic', initMagnetic);
    }
  }
}

function accents() {
  const raw = document.querySelector('.hero-stage')?.dataset.accents || '';
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : ['#ece6d8'];
}

/* ==========================================================================
   Scroll progress, plus the scroll-linked drift and marquee speed.
   One rAF frame handles all three, and it only runs while something moves.
   ========================================================================== */

function initScroll(isReduced, palette) {
  const root = document.documentElement;
  const bar = document.createElement('div');
  bar.className = 'mo-progress';
  bar.setAttribute('aria-hidden', 'true');
  bar.style.background = `linear-gradient(90deg, ${palette.join(', ')})`;
  document.body.append(bar);

  const track = document.querySelector('.marquee-track');
  let anim = null, rate = 1, skew = 0;
  let queued = false, lastY = window.scrollY, vel = 0, drift = 0;

  const tuneMarquee = () => {
    if (!track) return;
    anim = anim || track.getAnimations()[0] || null;
    const still = Math.abs(vel) < 0.05;
    const r = still ? 1 : 1 + Math.min(2.5, Math.abs(vel) / 22);
    const s = still ? 0 : clamp(vel * 0.14, -5, 5);
    if (anim && rate !== r && (still || Math.abs(r - rate) > 0.004)) {
      rate = r;
      anim.playbackRate = r;
    }
    if (Math.abs(s - skew) > 0.05) {
      skew = s;
      track.style.setProperty('--mq-skew', `${s.toFixed(2)}deg`);
    }
  };

  const frame = () => {
    queued = false;
    const y = window.scrollY;
    const max = Math.max(1, root.scrollHeight - window.innerHeight);
    bar.style.transform = `scaleX(${clamp(y / max, 0, 1).toFixed(4)})`;
    if (!isReduced) {
      vel += (y - lastY - vel) * 0.25;
      // The grid repeats every 32px, so wrapping the offset keeps the drift seamless.
      const d = (y * 0.22) % 32;
      if (Math.abs(d - drift) > 0.05) {
        drift = d;
        root.style.setProperty('--drift', `${d.toFixed(2)}px`);
      }
      tuneMarquee();
      if (Math.abs(vel) > 0.05) kick();
    }
    lastY = y;
  };

  const kick = () => {
    if (!queued && !document.hidden) {
      queued = true;
      requestAnimationFrame(frame);
    }
  };

  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick, { passive: true });
  document.addEventListener('visibilitychange', () => {
    lastY = window.scrollY;
    vel = 0;
    kick();
  });
  kick();
}

/* ==========================================================================
   Marquee: the CSS animation does the sliding. Reduced motion gets one
   wrapped copy of each title instead of the looping ticker.
   ========================================================================== */

function initMarquee(isReduced) {
  const track = document.querySelector('.marquee-track');
  if (!track || !isReduced) return;
  const items = [...track.querySelectorAll('.mq-item')];
  items.slice(Math.ceil(items.length / 2)).forEach((el) => { el.hidden = true; });
}

/* ==========================================================================
   Stagger setup: each list item gets an index, and the animation keys off it.
   ========================================================================== */

function initIndexes() {
  for (const list of document.querySelectorAll('.ix-group ol, .features')) {
    [...list.children].forEach((li, i) => li.style.setProperty('--i', String(i)));
  }
  document.querySelectorAll('.plate-frame').forEach((frame, i) => frame.style.setProperty('--i', String(i)));
}

/* Catalogue index rows rise in when their group scrolls into view. Feature
   lists follow their exhibit's .in class in CSS, so they need no observer. */
function initStagger() {
  const groups = document.querySelectorAll('.ix-group');
  if (!('IntersectionObserver' in window)) {
    groups.forEach((g) => g.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { threshold: 0.2 },
  );
  groups.forEach((g) => io.observe(g));
}

/* ==========================================================================
   Scramble: the chapter headings resolve from random letters once they are
   on screen. Only letters change, so spaces and punctuation keep their
   place. The original markup is put back exactly when it finishes.
   ========================================================================== */

function initScramble() {
  const jobs = [...document.querySelectorAll('.chapter-head h2, .about h2')].map(prepare).filter(Boolean);
  if (!jobs.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const job = jobs.find((j) => j.el === e.target);
        if (job) start(job);
      }
    },
    { threshold: 0.3 },
  );
  jobs.forEach((j) => io.observe(j.el));
  // Printing must never capture half-scrambled text.
  window.addEventListener('beforeprint', () => jobs.forEach(finish));
}

function prepare(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  const letters = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const orig = node.nodeValue;
    const ni = nodes.push({ node, orig }) - 1;
    for (let ci = 0; ci < orig.length; ci++) {
      if (/[A-Za-z]/.test(orig[ci])) letters.push({ ni, ci, at: 0 });
    }
  }
  if (!letters.length) return null;
  // Letters lock in one after another, across the first 460ms, with some jitter.
  letters.forEach((l, k) => { l.at = (k / letters.length) * 460 + Math.random() * 200; });

  // Read the original attributes before touching them, so they can be put back exactly.
  const job = {
    el, nodes, letters, raf: 0, t0: 0, started: false, done: false,
    styleAttr: el.getAttribute('style'),
    label: el.getAttribute('aria-label'),
  };
  // Hold the height, so the scrambled lines cannot push the page around.
  el.style.minHeight = `${el.getBoundingClientRect().height}px`;
  el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  paint(job, -1);
  return job;
}

function paint(job, elapsed) {
  const out = job.nodes.map((n) => n.orig.split(''));
  for (const { ni, ci, at } of job.letters) {
    if (elapsed < at) {
      const ch = job.nodes[ni].orig[ci];
      const set = ch === ch.toUpperCase() ? GLYPHS.upper : GLYPHS.lower;
      out[ni][ci] = set[Math.floor(Math.random() * set.length)];
    }
  }
  job.nodes.forEach((n, i) => { n.node.nodeValue = out[i].join(''); });
}

function start(job) {
  if (job.started || job.done) return;
  job.started = true;
  const tick = (now) => {
    if (job.done) return;
    if (!job.t0) job.t0 = now;
    const elapsed = now - job.t0;
    if (elapsed >= SCRAMBLE_MS) {
      finish(job);
      return;
    }
    paint(job, elapsed);
    job.raf = requestAnimationFrame(tick);
  };
  job.raf = requestAnimationFrame(tick);
}

function finish(job) {
  if (job.done) return;
  job.done = true;
  cancelAnimationFrame(job.raf);
  job.nodes.forEach(({ node, orig }) => { node.nodeValue = orig; });
  restore(job.el, 'style', job.styleAttr);
  restore(job.el, 'aria-label', job.label);
}

/* ==========================================================================
   Logo burst: a few pixels fly out from the mark. The link still navigates.
   ========================================================================== */

function initBurst(palette) {
  const brand = document.querySelector('.brand');
  if (!brand || !brand.animate) return;
  const colours = [...palette, '#ece6d8'];
  brand.addEventListener('click', () => {
    const mark = brand.querySelector('svg') || brand;
    const r = mark.getBoundingClientRect();
    const host = document.createElement('div');
    host.className = 'mo-burst';
    host.setAttribute('aria-hidden', 'true');
    host.style.left = `${r.left + r.width / 2}px`;
    host.style.top = `${r.top + r.height / 2}px`;
    for (let i = 0; i < 26; i++) {
      const px = document.createElement('i');
      px.className = 'mo-px';
      px.style.background = colours[i % colours.length];
      host.append(px);
      const a = rand(0, Math.PI * 2);
      const d = rand(40, 120);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d - rand(20, 60);
      const spin = rand(-240, 240);
      px.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
          { transform: `translate(${x * 0.8}px, ${y * 0.8}px) rotate(${spin * 0.5}deg) scale(1)`, opacity: 1, offset: 0.4 },
          { transform: `translate(${x}px, ${y + 80}px) rotate(${spin}deg) scale(0.3)`, opacity: 0 },
        ],
        { duration: rand(800, 1100), easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'forwards' },
      );
    }
    document.body.append(host);
    setTimeout(() => host.remove(), 1200);
  });
}

/* ==========================================================================
   Cursor spotlight: a large soft glow that eases after the pointer, tinted by
   the accent of the row under it. Fine pointers only.
   ========================================================================== */

function initSpotlight() {
  const glow = document.createElement('div');
  glow.className = 'mo-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.prepend(glow);

  let x = 0, y = 0, tx = 0, ty = 0, raf = 0, live = false;
  const tick = () => {
    raf = 0;
    x += (tx - x) * 0.14;
    y += (ty - y) * 0.14;
    glow.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3) raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (!raf && !document.hidden) raf = requestAnimationFrame(tick);
  };

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    tx = e.clientX;
    ty = e.clientY;
    if (!live) {
      live = true;
      x = tx;
      y = ty;
      glow.classList.add('is-on');
    }
    const row = e.target instanceof Element ? e.target.closest('[style*="--accent"]') : null;
    const accent = row ? row.style.getPropertyValue('--accent').trim() : '';
    glow.style.setProperty('--mo-glow', accent || '#ece6d8');
    kick();
  }, { passive: true });

  document.addEventListener('pointerout', (e) => {
    if (e.relatedTarget) return;
    live = false;
    glow.classList.remove('is-on');
  }, { passive: true });
}

/* ==========================================================================
   Magnetic buttons: .btn and the top-bar links lean a few pixels toward the
   pointer within reach, then spring back. Offsets go in --mx-x / --mx-y, and
   motion.css turns them into `translate`, so each element's own transform
   still applies.
   ========================================================================== */

function initMagnetic() {
  const items = [...document.querySelectorAll('.btn, .topbar nav a')].map((el) => ({ el, x: 0, y: 0, tx: 0, ty: 0 }));
  if (!items.length) return;
  let raf = 0;

  const tick = () => {
    raf = 0;
    let moving = false;
    for (const it of items) {
      if (it.x === it.tx && it.y === it.ty) continue;
      it.x += (it.tx - it.x) * 0.2;
      it.y += (it.ty - it.y) * 0.2;
      if (Math.abs(it.tx - it.x) < 0.05) it.x = it.tx;
      if (Math.abs(it.ty - it.y) < 0.05) it.y = it.ty;
      it.el.style.setProperty('--mx-x', `${it.x.toFixed(2)}px`);
      it.el.style.setProperty('--mx-y', `${it.y.toFixed(2)}px`);
      if (it.x !== it.tx || it.y !== it.ty) moving = true;
    }
    if (moving) raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (!raf && !document.hidden) raf = requestAnimationFrame(tick);
  };

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    for (const it of items) {
      const r = it.el.getBoundingClientRect();
      if (!r.width) continue;
      // Measure from the centre without the current offset, so the pull cannot feed back on itself.
      const dx = e.clientX - (r.left + r.width / 2 - it.x);
      const dy = e.clientY - (r.top + r.height / 2 - it.y);
      const near = Math.abs(dx) < r.width / 2 + 60 && Math.abs(dy) < r.height / 2 + 60;
      it.tx = near ? clamp(dx * 0.22, -6, 6) : 0;
      it.ty = near ? clamp(dy * 0.22, -6, 6) : 0;
    }
    kick();
  }, { passive: true });

  document.addEventListener('pointerout', (e) => {
    if (e.relatedTarget) return;
    for (const it of items) {
      it.tx = 0;
      it.ty = 0;
    }
    kick();
  }, { passive: true });
}
