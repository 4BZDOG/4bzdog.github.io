// Puzzle Suite: generate a word search from a vocabulary list, then find each word.

import { createScript, el } from '../lib.js';

const SIZE = 10;
const LISTS = [
  { title: 'Space', words: [['GALAXY', 'billions of stars'], ['PLANET', 'orbits a star'], ['ORBIT', 'a curved path'], ['COMET', 'ice and dust'], ['NEBULA', 'a cloud of gas'], ['GRAVITY', 'pulls things together']] },
  { title: 'Oceans', words: [['CORAL', 'builds reefs'], ['TIDE', 'rises and falls'], ['PLANKTON', 'drifting life'], ['ABYSS', 'the deepest zone'], ['CURRENT', 'moving water'], ['REEF', 'a rocky ridge']] },
  { title: 'Cells', words: [['NUCLEUS', 'holds the DNA'], ['ENZYME', 'speeds reactions'], ['TISSUE', 'cells working together'], ['VACUOLE', 'stores water'], ['OSMOSIS', 'water crossing a membrane'], ['ORGAN', 'tissues working together']] },
  { title: 'Weather', words: [['CYCLONE', 'spinning storm'], ['DROUGHT', 'long dry spell'], ['MONSOON', 'seasonal rain'], ['FRONT', 'where air masses meet'], ['HUMIDITY', 'water in the air'], ['CLIMATE', 'long-term pattern']] },
];
const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1]];
const LETTERS = 'ABCDEFGHIJKLMNOPRSTUVWY';
const rl = () => LETTERS[Math.floor(Math.random() * LETTERS.length)];

function layout(words) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(''));
    const placed = [];
    let ok = true;
    for (const [word] of [...words].sort((a, b) => b[0].length - a[0].length)) {
      let done = false;
      for (let t = 0; t < 200 && !done; t++) {
        const [dr, dc] = DIRS[Math.floor(Math.random() * DIRS.length)];
        const r0 = Math.floor(Math.random() * SIZE), c0 = Math.floor(Math.random() * SIZE);
        const r1 = r0 + dr * (word.length - 1), c1 = c0 + dc * (word.length - 1);
        if (r1 < 0 || r1 >= SIZE || c1 < 0 || c1 >= SIZE) continue;
        let fits = true;
        for (let i = 0; i < word.length && fits; i++) {
          const cell = grid[r0 + dr * i][c0 + dc * i];
          if (cell && cell !== word[i]) fits = false;
        }
        if (!fits) continue;
        for (let i = 0; i < word.length; i++) grid[r0 + dr * i][c0 + dc * i] = word[i];
        placed.push({ word, r0, c0, r1, c1 });
        done = true;
      }
      if (!done) { ok = false; break; }
    }
    if (ok) {
      for (const row of grid) for (let c = 0; c < SIZE; c++) row[c] ||= rl();
      return { grid, placed };
    }
  }
  return null;
}

export default function puzzle(host, { reduced }) {
  const paper = el('div', 'pz-paper');
  const head = el('div', 'pz-head');
  const title = el('div', 'pz-title');
  const pages = el('div', 'pz-pages');
  ['Notes', 'Search', 'Crossword', 'Scramble', 'Keys'].forEach((p, i) => pages.append(el('span', i === 1 ? 'on' : null, p)));
  head.append(title, pages);
  const wrap = el('div', 'pz-grid-wrap');
  const gridEl = el('div', 'pz-grid');
  gridEl.style.setProperty('--n', SIZE);
  const cells = [];
  for (let i = 0; i < SIZE * SIZE; i++) { const s = el('span', null, rl()); cells.push(s); gridEl.append(s); }
  wrap.append(gridEl);
  const bank = el('div', 'pz-bank');
  const bankLabel = el('p', 'label', 'Word bank');
  const list = el('ol');
  bank.append(bankLabel, list);
  paper.append(head, wrap, bank);
  host.append(paper);

  const at = (r, c) => cells[r * SIZE + c];

  function highlight(p) {
    const a = at(p.r0, p.c0), b = at(p.r1, p.c1);
    const cw = a.offsetWidth, ch = a.offsetHeight;
    const ax = a.offsetLeft + cw / 2, ay = a.offsetTop + ch / 2;
    const bx = b.offsetLeft + cw / 2, by = b.offsetTop + ch / 2;
    const h = Math.min(cw, ch) * 0.86;
    const len = Math.hypot(bx - ax, by - ay) + h;
    const hl = el('div', 'pz-hl');
    hl.style.setProperty('--h', `${h}px`);
    hl.style.left = `${ax - h / 2}px`;
    hl.style.top = `${ay - h / 2}px`;
    hl.style.width = `${h}px`;
    hl.style.transform = `rotate(${Math.atan2(by - ay, bx - ax)}rad)`;
    wrap.append(hl);
    return { hl, len };
  }

  function show(set) {
    title.textContent = `Vocabulary · ${set.title}`;
    list.innerHTML = '';
    set.words.forEach(([w, clue]) => {
      const li = el('li');
      li.append(el('s', null, w), el('small', null, clue));
      li.dataset.word = w;
      list.append(li);
    });
  }

  let round = 0;
  const script = createScript(async ({ sleep }) => {
    for (;;) {
      const set = LISTS[round++ % LISTS.length];
      const puzzleData = layout(set.words);
      if (!puzzleData) continue;
      wrap.querySelectorAll('.pz-hl').forEach((n) => n.remove());
      show(set);

      // "Generating": letters churn, then settle into the real grid.
      gridEl.classList.add('scrambling');
      cells.forEach((c) => c.classList.remove('found'));
      for (let k = 0; k < 7; k++) {
        cells.forEach((c) => (c.textContent = rl()));
        await sleep(70);
      }
      puzzleData.grid.flat().forEach((ch, i) => (cells[i].textContent = ch));
      gridEl.classList.remove('scrambling');
      await sleep(700);

      // Find each word in turn.
      for (const p of puzzleData.placed.sort(() => Math.random() - 0.5)) {
        const { hl, len } = highlight(p);
        await sleep(30);
        hl.style.width = `${len}px`;
        await sleep(550);
        const n = p.word.length;
        const dr = Math.sign(p.r1 - p.r0), dc = Math.sign(p.c1 - p.c0);
        for (let i = 0; i < n; i++) at(p.r0 + dr * i, p.c0 + dc * i).classList.add('found');
        list.querySelector(`[data-word="${p.word}"]`)?.classList.add('done');
        await sleep(380);
      }
      await sleep(2000);
    }
  });

  if (reduced) {
    const set = LISTS[0];
    const data = layout(set.words);
    show(set);
    if (data) {
      data.grid.flat().forEach((ch, i) => (cells[i].textContent = ch));
      requestAnimationFrame(() => data.placed.slice(0, 3).forEach((p) => {
        const { hl, len } = highlight(p);
        hl.style.width = `${len}px`;
        list.querySelector(`[data-word="${p.word}"]`)?.classList.add('done');
      }));
    }
  } else {
    show(LISTS[0]);
  }

  return {
    start() { if (!reduced) script.start(); },
    stop() { script.stop(); },
  };
}
