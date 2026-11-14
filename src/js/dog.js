// A dot-matrix dog that trots along the top edge and doubles as the scroll-progress marker.
// Its horizontal position is the page's scroll progress. It walks while the page scrolls,
// stands, then sits and wags (continuously at the bottom of the page). Clicking barks and
// dispatches `fetch:open` for the quick-jump palette. Animation runs on short timers only
// while something is changing, so an idle dog costs nothing.

export const W = 16;
export const H = 12;
const DOG_W = 48;
const DEFAULT = 'rgb(236, 230, 216)';
const CREAM = '#ece6d8';
const SHADE = '#a9a7b0';
const DARK = '#090b12';

// Sprite rows: '.' empty, '#' body, 'e' shade (ear and far legs), 'o' eye, nose and mouth,
// 'c' collar (drawn in the project accent). Facing right; feet on the bottom row.
const TOP = [
  '................',
  '#........ee###..',
  '.#.......ee##o#.',
  '.##.......e####o',
  '..#############.',
  '...########cc##.',
  '...#########....',
  '....#######.....',
];
const TOP_BARK = TOP.map((row, i) => (i === 4 ? '..#########ooo..' : row));
const STAND = ['...##......##...', '...##......##...', '...##......##...', '..###.....###...'];
const WALK = [
  ['..##.....###....', '.##.......##....', '.##........##...', '.###.......###..'],
  ['...##..e..##....', '...##..e..##....', '...##.e...##....', '..###..e..###...'],
  ['....##....##....', '.....##..##.....', '......##.##.....', '......###.###...'],
  ['...##....##.....', '...##....##.....', '...##..e..##....', '..###..e..###...'],
];
const SIT_BODY = [
  '..##########....',
  '..#########..##.',
  '..##########.##.',
  '..#########..##.',
  '...#######...##.',
  '...######...###.',
];
const SIT_TAIL_DOWN = ['................', '.........ee###..', '.........ee##o#.', '##........e####o', TOP[4], TOP[5]];

const pose = (legs, top = TOP) => [...top, ...legs];

export const FRAMES = {
  stand: pose(STAND),
  walk: WALK.map((legs) => pose(legs)),
  sit: [[...TOP.slice(0, 6), ...SIT_BODY], [...SIT_TAIL_DOWN, ...SIT_BODY]],
  bark: pose(STAND, TOP_BARK),
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const make = (tag, cls) => Object.assign(document.createElement(tag), { className: cls });

export default function dog({ reduced } = {}) {
  try {
    if (document.querySelector('.dg-root')) return;
    const still = Boolean(reduced) || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    mount(still);
  } catch (err) {
    console.warn('dog: unavailable', err);
  }
}

function mount(still) {
  const root = make('div', 'dg-root');
  const btn = make('button', 'dg-dog');
  const canvas = make('canvas', 'dg-canvas');
  const tip = make('span', 'dg-tip');
  const say = make('span', 'dg-say');
  const probe = make('span', 'dg-probe');
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Fetch a project (opens quick jump)');
  btn.append(canvas);
  tip.textContent = 'Fetch a project';
  tip.setAttribute('aria-hidden', 'true');
  say.setAttribute('aria-hidden', 'true');
  probe.hidden = true;
  root.hidden = true;
  root.style.setProperty('--dog-accent', DEFAULT);
  root.append(btn, tip, say, probe);
  document.body.append(root);

  const s = { y: scrollY, mode: '', walk: 0, tail: 0, wag: 0, end: false, barking: false, accent: DEFAULT, spd: 0, queued: false };
  const T = {};
  const stop = (k) => { clearTimeout(T[k]); T[k] = 0; };
  const later = (k, fn, ms) => { stop(k); T[k] = setTimeout(fn, ms); };

  const frameOf = () => {
    if (s.barking) return FRAMES.bark;
    if (s.mode === 'walk') return FRAMES.walk[s.walk];
    if (s.mode === 'sit') return FRAMES.sit[s.tail];
    return FRAMES.stand;
  };

  const draw = () => {
    const collar = s.accent === DEFAULT ? DARK : s.accent;
    const pal = { '#': CREAM, e: SHADE, o: DARK, c: collar };
    ctx.clearRect(0, 0, W, H);
    frameOf().forEach((row, y) => {
      for (let x = 0; x < W; x += 1) {
        const c = pal[row[x]];
        if (c) {
          ctx.fillStyle = c;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });
  };

  // One short timer chain drives the leg cycle and the tail; it stops as soon as nothing animates.
  const tick = () => {
    T.anim = 0;
    let delay;
    if (s.mode === 'walk') {
      s.walk = (s.walk + 1) % 4;
      s.spd *= 0.9;
      delay = clamp(240 / (1 + s.spd / 4), 70, 240);
    } else if (s.mode === 'sit' && (s.end || s.wag > 0)) {
      s.tail ^= 1;
      if (!s.end) {
        s.wag -= 1;
        if (s.wag <= 0) { s.wag = 0; s.tail = 0; }
      }
      delay = 150;
    } else {
      return;
    }
    draw();
    T.anim = setTimeout(tick, delay);
  };
  const kick = () => { if (!still && !T.anim && !document.hidden) tick(); };

  const wagSoon = () => {
    if (s.mode === 'sit' && !s.end) { s.wag = 6; kick(); }
    later('wag', wagSoon, rand(2600, 5200));
  };

  const setMode = (mode) => {
    const next = still ? 'sit' : mode;
    if (s.mode === next) return;
    s.mode = next;
    s.tail = 0;
    s.wag = 0;
    stop('anim');
    stop('wag');
    if (next === 'sit' && !s.end && !still) later('wag', wagSoon, rand(2600, 5200));
    draw();
    kick();
  };

  const place = () => {
    s.queued = false;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    root.hidden = max <= 1;
    if (root.hidden) { stop('anim'); return; }
    const vw = document.documentElement.clientWidth || innerWidth;
    const y = scrollY;
    const p = clamp(y / max, 0, 1);
    // The sprite's left edge runs from 0 to (viewport - dog width), so it is always fully on screen.
    root.style.transform = `translate3d(${(p * Math.max(0, vw - DOG_W)).toFixed(1)}px, 0, 0)`;
    root.classList.toggle('is-left', p * Math.max(0, vw - DOG_W) + DOG_W + 160 > vw);
    const dy = y - s.y;
    s.y = y;
    if (dy) {
      root.classList.toggle('is-back', dy < 0);
      s.spd = s.spd * 0.5 + Math.abs(dy) * 0.5;
      if (!still && !s.barking) setMode('walk');
    }
    const atEnd = p >= 0.999;
    if (atEnd !== s.end) {
      s.end = atEnd;
      if (!dy) setMode(atEnd ? 'sit' : 'stand');
    }
    kick();
  };

  const schedule = () => {
    if (s.queued) return;
    s.queued = true;
    requestAnimationFrame(place);
  };

  const onScroll = () => {
    schedule();
    if (still) return;
    later('stand', () => setMode(s.end ? 'sit' : 'stand'), 600);
    later('sit', () => setMode('sit'), 2500);
  };

  const bark = () => {
    if (s.barking) return;
    s.barking = true;
    say.textContent = Math.random() < 1 / 8 ? 'fetch?' : 'woof';
    say.classList.add('is-on');
    draw();
    later('dispatch', () => document.dispatchEvent(new CustomEvent('fetch:open')), 300);
    later('barkOff', () => { s.barking = false; draw(); }, 350);
    later('sayOff', () => say.classList.remove('is-on'), 1000);
  };

  // Resolves any CSS colour (including var()) to a canonical rgb() string the canvas accepts.
  const resolve = (raw) => {
    if (!raw) return DEFAULT;
    probe.style.color = '';
    probe.style.color = raw;
    return probe.style.color ? getComputedStyle(probe).color || DEFAULT : DEFAULT;
  };
  const setAccent = (raw) => {
    const next = resolve(raw);
    if (next === s.accent) return;
    s.accent = next;
    root.style.setProperty('--dog-accent', next);
    draw();
  };

  if ('IntersectionObserver' in window) {
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) seen.add(e.target);
        else seen.delete(e.target);
      }
      const last = [...seen].pop();
      setAccent(last ? last.style.getPropertyValue('--accent').trim() : '');
    }, { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('article.exhibit').forEach((el) => io.observe(el));
  }

  btn.addEventListener('click', bark);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      ['anim', 'wag', 'stand', 'sit'].forEach(stop);
      return;
    }
    s.y = scrollY;
    s.mode = '';
    place();
    setMode(s.end ? 'sit' : 'stand');
  });

  place();
  setMode(still ? 'sit' : 'stand');
  if (!still) later('sit', () => setMode('sit'), 2500);
}
