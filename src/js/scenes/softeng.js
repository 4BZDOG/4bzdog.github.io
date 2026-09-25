// HSC Software Engineering Notes: linear search traced through a flowchart, its
// NESA-style pseudocode and the array it's searching, one step at a time.

import { createScript, el } from '../lib.js';

const A = [7, 3, 9, 4, 12, 5];
const TARGETS = [4, 12, 8, 3];

const NODES = {
  start: { x: 110, y: 22, w: 88, h: 26, shape: 'stadium', text: 'START', line: 0 },
  init: { x: 110, y: 70, w: 96, h: 26, shape: 'rect', text: 'i = 0', line: 1 },
  cond: { x: 110, y: 130, w: 118, h: 52, shape: 'diamond', text: 'i < n ?', line: 2 },
  cmp: { x: 110, y: 200, w: 150, h: 52, shape: 'diamond', text: 'A[i] = target ?', line: 3 },
  incr: { x: 110, y: 266, w: 96, h: 26, shape: 'rect', text: 'i = i + 1', line: 6 },
  none: { x: 252, y: 130, w: 84, h: 26, shape: 'stadium', text: 'RETURN −1', line: 8 },
  found: { x: 252, y: 200, w: 84, h: 26, shape: 'stadium', text: 'RETURN i', line: 4 },
};
const EDGES = {
  'start-init': 'M110 35 V57',
  'init-cond': 'M110 83 V104',
  'cond-cmp': 'M110 156 V174',
  'cond-none': 'M169 130 H210',
  'cmp-found': 'M185 200 H210',
  'cmp-incr': 'M110 226 V253',
  'incr-cond': 'M62 266 H26 V130 H51',
};
const LABELS = [
  ['yes', 120, 165], ['no', 189, 122], ['yes', 197, 192], ['no', 120, 240],
];

const CODE = [
  ['BEGIN', ' linearSearch(A, target)'],
  ['', '  i = 0'],
  ['', '  ', 'WHILE', ' i < n'],
  ['', '    ', 'IF', ' A[i] = target ', 'THEN'],
  ['', '      ', 'RETURN', ' i'],
  ['', '    ', 'ENDIF'],
  ['', '    i = i + 1'],
  ['', '  ', 'ENDWHILE'],
  ['', '  ', 'RETURN', ' -1'],
  ['END', ' linearSearch'],
];

function shapeMarkup(n) {
  const { x, y, w, h } = n;
  if (n.shape === 'diamond') return `<path d="M${x} ${y - h / 2} L${x + w / 2} ${y} L${x} ${y + h / 2} L${x - w / 2} ${y} Z"/>`;
  const rx = n.shape === 'stadium' ? h / 2 : 3;
  return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${rx}"/>`;
}

export default function softeng(host, { reduced }) {
  const wrap = el('div', 'se-wrap');
  const svg = `
    <svg class="se-flow" viewBox="0 0 300 284" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><marker id="se-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 Z" fill="#1c1a17"/></marker></defs>
      ${Object.entries(EDGES).map(([id, d]) => `<path class="edge" data-edge="${id}" d="${d}"/>`).join('')}
      ${LABELS.map(([t, lx, ly]) => `<text class="lbl" x="${lx}" y="${ly}">${t}</text>`).join('')}
      ${Object.entries(NODES).map(([id, n]) => `<g class="node" data-node="${id}">${shapeMarkup(n)}<text x="${n.x}" y="${n.y}">${n.text}</text></g>`).join('')}
      <circle class="se-token" r="5" cx="110" cy="22"/>
    </svg>`;
  wrap.innerHTML = svg;
  const flow = wrap.querySelector('svg');
  const token = flow.querySelector('.se-token');

  const code = el('pre', 'se-code');
  const lines = CODE.map((parts) => {
    const ln = el('span', 'ln');
    parts.forEach((p) => {
      if (/^[A-Z]+$/.test(p)) ln.append(el('span', 'kw', p));
      else ln.append(p);
    });
    code.append(ln);
    return ln;
  });
  code.setAttribute('aria-hidden', 'true');

  const arr = el('div', 'se-array');
  const lab = el('span', 'lab');
  const cellsBox = el('div', 'se-cells');
  const cells = A.map((v, i) => { const c = el('span', null, String(v)); c.dataset.i = i; cellsBox.append(c); return c; });
  const result = el('span', 'se-result');
  arr.append(lab, cellsBox, result);
  wrap.append(code, arr);
  host.append(wrap);

  const nodeEl = (id) => flow.querySelector(`[data-node="${id}"]`);
  let current = null;
  function visit(id, cls = 'on') {
    flow.querySelectorAll('.node').forEach((n) => n.classList.remove('on', 'yes', 'no'));
    nodeEl(id).classList.add(cls === 'on' ? 'on' : cls);
    lines.forEach((l, i) => l.classList.toggle('on', i === NODES[id].line));
    token.setAttribute('cx', NODES[id].x);
    token.setAttribute('cy', NODES[id].y);
    current = id;
  }
  async function travel(to, sleep) {
    const path = flow.querySelector(`[data-edge="${current}-${to}"]`);
    if (path) {
      const len = path.getTotalLength();
      const steps = Math.max(6, Math.round(len / 9));
      for (let k = 0; k <= steps; k++) {
        const p = path.getPointAtLength((k / steps) * len);
        token.setAttribute('cx', p.x);
        token.setAttribute('cy', p.y);
        await sleep(22);
      }
    }
  }

  const script = createScript(async ({ sleep }) => {
    for (let round = 0; ; round++) {
      const target = TARGETS[round % TARGETS.length];
      lab.textContent = `target = ${target}`;
      cells.forEach((c) => (c.className = ''));
      result.classList.remove('on');

      visit('start');
      await sleep(600);
      await travel('init', sleep);
      visit('init');
      let i = 0;
      await sleep(500);
      let from = 'init';
      let foundAt = -1;
      for (;;) {
        current = from;
        await travel('cond', sleep);
        visit('cond');
        await sleep(420);
        if (i >= A.length) break;
        await travel('cmp', sleep);
        visit('cmp');
        cells[i].classList.add('on');
        await sleep(520);
        if (A[i] === target) { foundAt = i; break; }
        cells[i].className = 'seen';
        await travel('incr', sleep);
        visit('incr');
        i++;
        await sleep(380);
        from = 'incr';
      }
      if (foundAt >= 0) {
        await travel('found', sleep);
        visit('found', 'yes');
        cells[foundAt].className = 'hit';
        result.textContent = `RETURN ${foundAt}`;
      } else {
        await travel('none', sleep);
        visit('none', 'no');
        result.textContent = 'RETURN −1';
      }
      result.classList.add('on');
      await sleep(2000);
    }
  });

  if (reduced) {
    lab.textContent = 'target = 4';
    visit('found', 'yes');
    [0, 1, 2].forEach((k) => (cells[k].className = 'seen'));
    cells[3].className = 'hit';
    result.textContent = 'RETURN 3';
    result.classList.add('on');
  } else {
    lab.textContent = `target = ${TARGETS[0]}`;
    visit('start');
  }

  return {
    start() { if (!reduced) script.start(); },
    stop() { script.stop(); },
  };
}
