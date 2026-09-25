// Maths Suite: a seeded worksheet generator. The seed rolls like an odometer and the
// questions are rebuilt from it; the same seed always gives the same sheet.

import { createScript, el, mulberry32, pick, randInt } from '../lib.js';

const M = '−';
const neg = (n) => (n < 0 ? `${M}${-n}` : String(n));
const frac = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
const x = '<i>x</i>', y = '<i>y</i>';

const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]];

function rectSVG(w, h) {
  return `<svg viewBox="0 0 150 62" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect x="30" y="6" width="80" height="40" fill="#fff7e6" stroke="#1f1d1a" stroke-width="1.5"/>
    <text x="70" y="58" text-anchor="middle">${w} cm</text>
    <text x="116" y="30" text-anchor="start">${h} cm</text></svg>`;
}
function triSVG(a, b, labelA, labelB, labelC, angle) {
  return `<svg viewBox="0 0 150 62" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <path d="M40 54 H120 V6 Z" fill="#fff7e6" stroke="#1f1d1a" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M112 54 V46 H120" fill="none" stroke="#1f1d1a" stroke-width="1"/>
    ${angle ? `<path d="M56 54 A16 16 0 0 0 53.5 45.5" fill="none" stroke="#1f1d1a"/><text x="62" y="49">${angle}</text>` : ''}
    <text x="80" y="62" text-anchor="middle" dominant-baseline="auto">${labelB}</text>
    <text x="126" y="32">${labelA}</text>
    <text x="72" y="24" text-anchor="end">${labelC}</text></svg>`;
}

const BANDS = [
  {
    name: 'Easy',
    sub: 'Stage 4 Review',
    text: [
      (r) => `Evaluate ${neg(randInt(r, -12, -2))} + ${randInt(r, 3, 15)}`,
      (r) => `Evaluate ${neg(randInt(r, -9, -2))} × ${randInt(r, 3, 9)}`,
      (r) => `Round ${randInt(r, 1, 9)}.${randInt(r, 100, 999)} to 1 decimal place.`,
      (r) => `Find ${pick(r, [10, 20, 25, 50])}% of $${randInt(r, 4, 60) * 20}.`,
      (r) => { const k = randInt(r, 2, 6); const a = randInt(r, 1, 5), b = a + randInt(r, 1, 5); return `Simplify ${frac(a * k, b * k)}`; },
    ],
    diagram: [
      (r) => { const w = randInt(r, 4, 14), h = randInt(r, 2, 9); return `Find the area of the rectangle.${rectSVG(w, h)}`; },
    ],
  },
  {
    name: 'Medium',
    sub: 'Stage 5 Core',
    text: [
      (r) => { const a = randInt(r, 2, 7), s = randInt(r, 2, 8), b = randInt(r, 1, 12); return `Solve ${a}${x} + ${b} = ${a * s + b}`; },
      (r) => `Expand ${randInt(r, 2, 6)}(${randInt(r, 2, 5)}${x} ${M} ${randInt(r, 1, 9)})`,
      (r) => `Evaluate ${frac(randInt(r, 1, 4), randInt(r, 5, 7))} + ${frac(randInt(r, 1, 2), randInt(r, 3, 4))}`,
      (r) => `A fair die is rolled. Find P(a number greater than ${randInt(r, 2, 4)}).`,
      (r) => `Simplify ${randInt(r, 2, 5)}${x}<sup>${randInt(r, 2, 5)}</sup> × ${randInt(r, 2, 4)}${x}<sup>${randInt(r, 2, 4)}</sup>`,
    ],
    diagram: [
      (r) => { const [a, b] = pick(r, TRIPLES); return `Find the value of ${x}.${triSVG(a, b, a, b, '<tspan font-style="italic">x</tspan>')}`; },
    ],
  },
  {
    name: 'Hard',
    sub: 'Stage 5 · 5.3 Path',
    text: [
      (r) => { const p = randInt(r, 1, 5), q = randInt(r, 1, 6); return `Factorise ${x}<sup>2</sup> + ${p + q}${x} + ${p * q}`; },
      (r) => { const p = randInt(r, 2, 6), q = p + randInt(r, 1, 4); return `Solve ${x}<sup>2</sup> ${M} ${p + q}${x} + ${p * q} = 0`; },
      (r) => { const m = randInt(r, 2, 4), c = randInt(r, 1, 5); return `Solve simultaneously: ${y} = ${m}${x} + ${c} and ${y} = ${m * 2 + c + 3} ${M} ${x}`; },
      (r) => `Simplify (${randInt(r, 2, 3)}${x}<sup>${randInt(r, 2, 4)}</sup>)<sup>2</sup> × ${x}<sup>${randInt(r, 2, 5)}</sup>`,
      (r) => `Simplify √${pick(r, [12, 18, 20, 27, 45, 50, 72])}`,
    ],
    diagram: [
      (r) => { const h = randInt(r, 8, 20), t = pick(r, [28, 35, 42, 53, 61]); return `Find ${x}, correct to 1 d.p.${triSVG(0, 0, '<tspan font-style="italic">x</tspan>', '', h, `${t}°`)}`; },
    ],
  },
];

function generate(seed, bandIndex) {
  const r = mulberry32(seed * 7 + bandIndex);
  const band = BANDS[bandIndex];
  const pool = band.text.slice();
  const qs = [];
  while (qs.length < 3) qs.push(pool.splice(Math.floor(r() * pool.length), 1)[0](r));
  qs.splice(randInt(r, 0, 3), 0, pick(r, band.diagram)(r));
  return qs;
}

export default function maths(host, { reduced }) {
  const paper = el('div', 'ms-paper');
  const head = el('div', 'ms-head');
  const titleBox = el('div');
  const title = el('div', 'ms-title', 'Maths Quiz');
  const sub = el('div', 'ms-sub');
  titleBox.append(title, sub);
  const seedBox = el('div', 'ms-seed', 'Seed');
  const digits = el('span', 'ms-digits');
  const cols = Array.from({ length: 5 }, () => {
    const d = el('span', 'ms-digit');
    const strip = el('span');
    strip.innerHTML = '0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9';
    d.append(strip);
    digits.append(d);
    return strip;
  });
  seedBox.append(digits);
  head.append(titleBox, seedBox);
  const tabs = el('div', 'ms-tabs');
  const tabEls = BANDS.map((b) => { const t = el('span', null, b.name); tabs.append(t); return t; });
  const grid = el('div', 'ms-grid');
  const cells = Array.from({ length: 4 }, (_, i) => {
    const c = el('div', 'ms-q');
    c.innerHTML = `<span class="n">${i + 1}</span><div class="t"></div><div class="work"></div><div class="work"></div>`;
    grid.append(c);
    return c;
  });
  paper.append(head, tabs, grid);
  host.append(paper);

  let seed = 48213, band = 0;

  function render() {
    String(seed).padStart(5, '0').split('').forEach((d, i) => {
      cols[i].style.transform = `translateY(${-Number(d) * 1.1}em)`;
    });
    tabEls.forEach((t, i) => t.classList.toggle('on', i === band));
    sub.textContent = `${BANDS[band].sub} · Name ____________`;
    generate(seed, band).forEach((html, i) => {
      const cell = cells[i];
      cell.querySelector('.t').innerHTML = html;
      const hasDiagram = html.includes('<svg');
      cell.querySelectorAll('.work').forEach((w) => (w.style.display = hasDiagram ? 'none' : ''));
    });
  }

  const script = createScript(async ({ sleep }) => {
    for (;;) {
      await sleep(3200);
      cells.forEach((c) => c.classList.add('out'));
      seed = 10000 + Math.floor(Math.random() * 89999);
      band = (band + 1) % BANDS.length;
      String(seed).padStart(5, '0').split('').forEach((d, i) => {
        cols[i].style.transform = `translateY(${-Number(d) * 1.1}em)`;
      });
      await sleep(380);
      render();
      for (const c of cells) { c.classList.remove('out'); await sleep(90); }
    }
  });

  render();

  return {
    start() { if (!reduced) script.start(); },
    stop() { script.stop(); cells.forEach((c) => c.classList.remove('out')); },
  };
}
