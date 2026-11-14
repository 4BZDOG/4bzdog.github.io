// Navigation for the long single page: a "Fetch" quick-jump palette, a wayfinder
// rail of project ticks, and a "now viewing" pill with step keys. Each feature
// sits in its own part(), so one failure leaves the others working. Without a
// populated #projects-data element, this module does nothing at all.

const HERO_RATIO = 0.6;
const JUMP_GRACE_MS = 1100;
const WORD_BREAK = /[\s\-–—·:,.()/&]+/;
const NO_MATCH = 'Nothing by that name. Try “maths” or “game”.';
const SEARCH_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12.8 12.8 17 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const PLACES = [
  { id: 'top', title: 'Top', alias: 'home hero' },
  { id: 'catalogue', title: 'Index', alias: 'catalogue list' },
  { id: 'toybox', title: 'Toybox', alias: 'blocks play' },
  { id: 'log', title: 'Build log', alias: 'commits history' },
  { id: 'about', title: 'About', alias: 'bio contact' },
];

export default function nav({ reduced } = {}) {
  const projects = readProjects();
  if (!projects.length) return;

  const isReduced = Boolean(reduced) || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isReduced) document.documentElement.classList.add('nv-still');

  const ctx = {
    reduced: isReduced,
    projects,
    all: [...projects, ...places()],
    active: -1,
    jumpIndex: -1,
    jumpUntil: 0,
    subs: [],
    palette: null,
  };

  part('active', () => trackActive(ctx));
  part('palette', () => buildPalette(ctx));
  part('rail', () => buildRail(ctx));
  part('pill', () => buildPill(ctx));
  part('keys', () => bindKeys(ctx));
  part('initial', () => setActive(ctx, -1));
}

function part(name, fn) {
  try {
    fn();
  } catch (err) {
    console.warn(`nav: ${name} unavailable`, err);
  }
}

/* ==========================================================================
   Data: the projects in page order, plus the places that exist on this page.
   ========================================================================== */

function readProjects() {
  let data = [];
  try {
    const node = document.getElementById('projects-data');
    data = node ? JSON.parse(node.textContent || '[]') : [];
  } catch (err) {
    console.warn('nav: projects-data unreadable', err);
  }
  if (!Array.isArray(data)) return [];
  return data.flatMap((p) => {
    const id = p && p.repo ? `p-${p.repo}` : '';
    const el = id ? document.getElementById(id) : null;
    if (!el) return [];
    return [prep({
      type: 'project',
      id,
      el,
      title: text(p.title, p.repo),
      kind: text(p.kind),
      subject: text(p.subject),
      tagline: text(p.tagline),
      accent: text(p.accent, '#ece6d8'),
      group: text(p.group, 'work'),
      groupTitle: text(p.groupTitle, text(p.group, 'Work')),
      numeral: text(p.numeral),
    })];
  });
}

function places() {
  return PLACES.flatMap((p) => {
    const el = document.getElementById(p.id);
    if (!el) return [];
    return [prep({
      type: 'place',
      id: p.id,
      el,
      title: p.title,
      kind: 'Section',
      subject: '',
      tagline: '',
      alias: p.alias,
      accent: '',
      group: 'places',
      groupTitle: 'Places',
      numeral: '',
    })];
  });
}

function prep(item) {
  item.lt = item.title.toLowerCase();
  item.lr = [item.kind, item.subject, item.tagline, item.alias || ''].join(' ').toLowerCase();
  return item;
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/* ==========================================================================
   Active project: one IntersectionObserver band across the middle of the
   viewport. Everything that shows "where you are" subscribes to setActive().
   ========================================================================== */

function trackActive(ctx) {
  if (!('IntersectionObserver' in window)) return;
  const inView = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) inView.add(entry.target);
        else inView.delete(entry.target);
      }
      setActive(ctx, ctx.projects.findIndex((p) => inView.has(p.el)));
    },
    { rootMargin: '-40% 0px -55% 0px' },
  );
  ctx.projects.forEach((p) => io.observe(p.el));
}

function setActive(ctx, index) {
  ctx.active = index;
  for (const fn of ctx.subs) part('update', () => fn(index));
}

/* Navigation: scroll to a project, keep the hash honest, and move focus to it. */

function goItem(ctx, item) {
  const target = item.el;
  if (!target) return;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.scrollIntoView({ behavior: ctx.reduced ? 'auto' : 'smooth', block: 'start' });
  try {
    history.replaceState(null, '', `#${item.id}`);
  } catch (err) {
    // Some sandboxed frames refuse history changes; the scroll still works.
  }
  target.focus({ preventScroll: true });
  ctx.jumpIndex = item.type === 'project' ? ctx.projects.indexOf(item) : -1;
  ctx.jumpUntil = performance.now() + (ctx.reduced ? 0 : JUMP_GRACE_MS);
}

/* Step to the neighbouring project. While a jump is still scrolling, step from
   where it is going, so two quick presses land two projects away. */
function stepBy(ctx, dir) {
  let target;
  if (ctx.jumpIndex >= 0 && performance.now() < ctx.jumpUntil) target = ctx.jumpIndex + dir;
  else if (ctx.active >= 0) target = ctx.active + dir;
  else target = dir > 0 ? lineIndex(ctx) + 1 : lineIndex(ctx);
  const item = ctx.projects[target];
  if (item) goItem(ctx, item);
}

/* Between exhibits: the last project whose top has passed a line near the top. */
function lineIndex(ctx) {
  const line = Math.max(96, window.innerHeight * 0.4);
  let found = -1;
  ctx.projects.forEach((p, i) => {
    if (p.el.getBoundingClientRect().top <= line) found = i;
  });
  return found;
}

/* ==========================================================================
   Fetch: the quick-jump palette.
   ========================================================================== */

function buildPalette(ctx) {
  const root = el('div', 'nv-fetch');
  const scrim = el('div', 'nv-scrim');
  scrim.setAttribute('aria-hidden', 'true');

  const dialog = el('div', 'nv-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Fetch a project');

  const head = el('div', 'nv-head');
  const glyph = el('span', 'nv-glyph', '/');
  glyph.setAttribute('aria-hidden', 'true');
  const input = el('input', 'nv-input');
  input.type = 'text';
  input.placeholder = 'Fetch a project…';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', 'Fetch a project');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', 'nv-list');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  const close = el('button', 'nv-close', 'Close');
  close.type = 'button';
  head.append(glyph, input, close);

  const list = el('div', 'nv-list');
  list.id = 'nv-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Projects and places');
  const empty = el('p', 'nv-empty', NO_MATCH);
  empty.hidden = true;
  const foot = el('div', 'nv-foot', '↑↓ move · ↵ go · esc close');

  dialog.append(head, list, empty, foot);
  root.append(scrim, dialog);
  document.body.append(root);

  let isOpen = false;
  let results = [];
  let options = [];
  let cursor = 0;
  let returnTo = null;

  function render(query) {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
    const grouped = !q;
    results = grouped ? ctx.all : rank(ctx.all, q);
    list.textContent = '';
    options = [];
    let group = null;
    results.forEach((item, i) => {
      if (grouped && item.group !== group) {
        group = item.group;
        const heading = el('div', 'nv-group', item.groupTitle);
        heading.setAttribute('role', 'presentation');
        list.append(heading);
      }
      const opt = optionFor(item, i);
      options.push(opt);
      list.append(opt);
    });
    empty.hidden = results.length > 0;
    highlight(0);
  }

  function highlight(i) {
    const n = options.length;
    if (!n) {
      cursor = 0;
      input.removeAttribute('aria-activedescendant');
      return;
    }
    cursor = ((i % n) + n) % n;
    options.forEach((opt, k) => {
      const on = k === cursor;
      opt.classList.toggle('is-active', on);
      opt.setAttribute('aria-selected', String(on));
    });
    input.setAttribute('aria-activedescendant', options[cursor].id);
    options[cursor].scrollIntoView({ block: 'nearest' });
  }

  function optionFor(item, i) {
    const opt = el('div', 'nv-opt');
    opt.id = `nv-opt-${i}`;
    opt.setAttribute('role', 'option');
    opt.setAttribute('aria-selected', 'false');
    if (item.type === 'place') opt.setAttribute('data-place', '');
    else opt.style.setProperty('--accent', item.accent);
    const swatch = el('span', 'nv-opt-swatch');
    swatch.setAttribute('aria-hidden', 'true');
    opt.append(el('span', 'nv-opt-num', item.numeral), swatch, el('span', 'nv-opt-title', item.title), el('span', 'nv-opt-kind', item.kind));
    // Keep focus in the input when an option is clicked.
    opt.addEventListener('mousedown', (e) => e.preventDefault());
    opt.addEventListener('mousemove', () => {
      if (cursor !== i) highlight(i);
    });
    opt.addEventListener('click', () => go(item));
    return opt;
  }

  function go(item) {
    closePalette({ restore: false });
    goItem(ctx, item);
  }

  function openPalette(trigger) {
    if (isOpen) return;
    isOpen = true;
    returnTo = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    input.value = '';
    render('');
    root.classList.add('is-open');
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    document.body.classList.add('nv-lock');
    input.focus({ preventScroll: true });
  }

  function closePalette({ restore = true } = {}) {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('is-open');
    document.body.classList.remove('nv-lock');
    document.body.style.paddingRight = '';
    const back = returnTo;
    returnTo = null;
    if (restore && back && back !== document.body && back.isConnected) back.focus({ preventScroll: true });
  }

  ctx.palette = { open: openPalette, close: closePalette, isOpen: () => isOpen };

  input.addEventListener('input', () => render(input.value));
  scrim.addEventListener('click', () => closePalette());
  close.addEventListener('click', () => closePalette());

  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const order = [input, close];
      const idx = order.indexOf(document.activeElement);
      const next = idx < 0 ? 0 : (idx + (e.shiftKey ? -1 : 1) + order.length) % order.length;
      order[next].focus({ preventScroll: true });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight(cursor + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight(cursor - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      highlight(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      highlight(options.length - 1);
    } else if (e.key === 'Enter' && document.activeElement === input) {
      e.preventDefault();
      if (results[cursor]) go(results[cursor]);
    }
  });

  // Focus stays inside the dialog while it is open.
  document.addEventListener('focusin', (e) => {
    if (isOpen && !root.contains(e.target)) input.focus({ preventScroll: true });
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target instanceof Element ? e.target.closest('[data-fetch-open]') : null;
    if (!trigger) return;
    e.preventDefault();
    openPalette(trigger);
  });

  document.addEventListener('fetch:open', () => openPalette(null));
}

function rank(items, q) {
  return items
    .map((item, i) => ({ item, i, s: score(item, q) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.item);
}

/* Title prefix beats word start, which beats substring, which beats a loose
   subsequence. The subsequence tier is what keeps "mat" forgiving. */
function score(item, q) {
  const t = item.lt;
  if (t.startsWith(q)) return 100;
  if (t.split(WORD_BREAK).some((w) => w.startsWith(q))) return 80;
  if (t.includes(q)) return 60;
  if (isSubsequence(q, t)) return 40;
  if (item.lr.split(WORD_BREAK).some((w) => w && w.startsWith(q))) return 30;
  if (item.lr.includes(q)) return 20;
  if (isSubsequence(q, `${t} ${item.lr}`)) return 10;
  return 0;
}

function isSubsequence(q, s) {
  let i = 0;
  for (const ch of s) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return q.length === 0;
}

/* ==========================================================================
   Wayfinder rail: one tick per project, on desktop only (CSS decides).
   ========================================================================== */

function buildRail(ctx) {
  const nav = el('nav', 'nv-rail');
  nav.setAttribute('aria-label', 'Projects');
  let group = null;
  const ticks = ctx.projects.map((p) => {
    const tick = el('a', 'nv-tick');
    tick.href = `#${p.id}`;
    tick.setAttribute('aria-label', p.title);
    tick.style.setProperty('--accent', p.accent);
    if (group !== null && p.group !== group) tick.classList.add('nv-tick--gap');
    group = p.group;
    const label = el('span', 'nv-tick-label');
    label.setAttribute('aria-hidden', 'true');
    label.append(el('span', 'nv-tick-title', p.title));
    if (p.kind) label.append(el('span', 'nv-tick-kind', p.kind));
    tick.append(label);
    tick.addEventListener('click', (e) => {
      e.preventDefault();
      goItem(ctx, p);
    });
    nav.append(tick);
    return tick;
  });
  document.body.append(nav);

  ctx.subs.push((index) => {
    ticks.forEach((tick, i) => {
      const on = i === index;
      tick.classList.toggle('is-active', on);
      if (on) tick.setAttribute('aria-current', 'true');
      else tick.removeAttribute('aria-current');
    });
  });

  // The rail waits until the hero has scrolled away, so the first screen stays clean.
  let frame = 0;
  const toggle = () => {
    frame = 0;
    nav.classList.toggle('nv-rail--on', window.scrollY >= window.innerHeight * HERO_RATIO);
  };
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(toggle);
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue, { passive: true });
  toggle();
}

/* ==========================================================================
   Now-viewing pill (inside an exhibit) and the round Fetch button (elsewhere
   on small screens).
   ========================================================================== */

function buildPill(ctx) {
  const pill = el('div', 'nv-pill');
  pill.setAttribute('role', 'group');
  pill.setAttribute('aria-label', 'Step through projects');
  const prev = el('button', 'nv-pill-step nv-prev', '‹');
  prev.type = 'button';
  const next = el('button', 'nv-pill-step nv-next', '›');
  next.type = 'button';
  const now = el('span', 'nv-pill-now');
  const dot = el('i', 'nv-pill-dot');
  dot.setAttribute('aria-hidden', 'true');
  const num = el('span', 'nv-pill-num');
  const title = el('span', 'nv-pill-title');
  now.append(dot, num, title);
  const fetch = el('button', 'nv-pill-fetch', 'Fetch');
  fetch.type = 'button';
  fetch.setAttribute('data-fetch-open', '');
  const key = el('kbd', '', '/');
  key.setAttribute('aria-hidden', 'true');
  fetch.append(key);
  pill.append(prev, now, next, fetch);

  const fab = el('button', 'nv-fab');
  fab.type = 'button';
  fab.setAttribute('data-fetch-open', '');
  fab.setAttribute('aria-label', 'Fetch a project');
  fab.innerHTML = SEARCH_ICON;
  document.body.append(pill, fab);

  prev.addEventListener('click', () => stepBy(ctx, -1));
  next.addEventListener('click', () => stepBy(ctx, 1));

  ctx.subs.push((index) => {
    const item = ctx.projects[index];
    pill.classList.toggle('nv-pill--on', Boolean(item));
    fab.classList.toggle('nv-fab--on', !item);
    if (!item) return;
    pill.style.setProperty('--accent', item.accent);
    num.textContent = item.numeral;
    title.textContent = item.title;
    const before = ctx.projects[index - 1];
    const after = ctx.projects[index + 1];
    prev.disabled = !before;
    prev.setAttribute('aria-label', before ? `Previous project: ${before.title}` : 'No previous project');
    next.disabled = !after;
    next.setAttribute('aria-label', after ? `Next project: ${after.title}` : 'No next project');
  });
}

/* ==========================================================================
   Keys: j / k and ] / [ step between projects. "/" and Ctrl/Cmd+K open Fetch.
   All of them stand aside while typing, while the palette is open, or with a
   modifier held.
   ========================================================================== */

function bindKeys(ctx) {
  if (!ctx.palette) return;
  document.addEventListener('keydown', (e) => {
    if (ctx.palette.isOpen() || e.altKey) return;
    if (isEditable(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (e.key === '/' && !mod) {
      e.preventDefault();
      ctx.palette.open(null);
      return;
    }
    if (key === 'k' && mod) {
      e.preventDefault();
      ctx.palette.open(null);
      return;
    }
    if (mod) return;
    if (e.key === 'j' || e.key === ']') {
      e.preventDefault();
      stepBy(ctx, 1);
    } else if (e.key === 'k' || e.key === '[') {
      e.preventDefault();
      stepBy(ctx, -1);
    }
  });
}

function isEditable(target) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
}

function el(tag, className = '', content = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}
