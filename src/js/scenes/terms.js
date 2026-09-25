// Like Terms Match: a small but genuine match-three engine. It looks for a swap that
// lines up three like terms, makes it, simplifies the line, then lets the board fall.

import { createScript, el, clamp } from '../lib.js';

const N = 6;
const GROUPS = ['x', 'y', 'x2', 'k'];
const COEFS = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const MINUS = '−';

function termText(g, c) {
  if (g === 'k') return c < 0 ? `${MINUS}${-c}` : String(c);
  const v = g === 'x2' ? 'x²' : g;
  if (c === 1) return v;
  if (c === -1) return `${MINUS}${v}`;
  return `${c < 0 ? MINUS : ''}${Math.abs(c)}${v}`;
}

function equation(line) {
  const g = line[0].g;
  let s = '';
  line.forEach((t, i) => {
    const txt = termText(g, Math.abs(t.c)).replace(/^1(?=[a-z])/, '');
    if (i === 0) s += t.c < 0 ? `${MINUS}${txt}` : txt;
    else s += ` ${t.c < 0 ? MINUS : '+'} ${txt}`;
  });
  const sum = line.reduce((n, t) => n + t.c, 0);
  const result = sum === 0 ? '0' : termText(g, sum);
  return `${s} = <i>${result}</i>`;
}

export default function terms(host, { reduced }) {
  const board = el('div', 'lt-board');
  const hudTop = el('div', 'scene-hud lt-hud-top');
  const eq = el('div', 'scene-hud lt-eq');
  const combo = el('div', 'scene-hud lt-combo');
  host.append(board, hudTop, eq, combo);

  let score = 0, level = 1, shields = 3;
  const grid = [];
  const random = () => ({ g: GROUPS[Math.floor(Math.random() * GROUPS.length)], c: COEFS[Math.floor(Math.random() * COEFS.length)] });

  function makeTile(r, c, t, fromAbove = 0) {
    const tile = el('div', 'lt-tile');
    const span = el('span', null, termText(t.g, t.c));
    tile.append(span);
    tile.dataset.g = t.g;
    tile.style.setProperty('--col', c);
    tile.style.setProperty('--row', fromAbove ? -fromAbove : r);
    if (fromAbove) tile.style.opacity = '0';
    board.append(tile);
    return { ...t, el: tile };
  }
  const place = (t, r, c) => {
    t.el.style.setProperty('--row', r);
    t.el.style.setProperty('--col', c);
    t.el.style.opacity = '';
  };

  // Cells may not exist yet while the board is first being filled.
  const groupAt = (r, c) => grid[r]?.[c]?.g;
  function matchesAt(r, c) {
    const g = groupAt(r, c);
    let h = 1, v = 1;
    for (let k = c - 1; k >= 0 && groupAt(r, k) === g; k--) h++;
    for (let k = c + 1; k < N && groupAt(r, k) === g; k++) h++;
    for (let k = r - 1; k >= 0 && groupAt(k, c) === g; k--) v++;
    for (let k = r + 1; k < N && groupAt(k, c) === g; k++) v++;
    return h >= 3 || v >= 3;
  }

  // Fill without any ready-made lines, like a fresh game board.
  for (let r = 0; r < N; r++) {
    grid[r] = [];
    for (let c = 0; c < N; c++) {
      let t;
      do {
        t = random();
        grid[r][c] = t;
      } while (matchesAt(r, c) && Math.random() < 0.97);
      grid[r][c] = makeTile(r, c, t);
    }
  }

  function swapCells(a, b) {
    const t = grid[a[0]][a[1]];
    grid[a[0]][a[1]] = grid[b[0]][b[1]];
    grid[b[0]][b[1]] = t;
  }

  function findMove() {
    const moves = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const r2 = r + dr, c2 = c + dc;
          if (r2 >= N || c2 >= N || grid[r][c].g === grid[r2][c2].g) continue;
          swapCells([r, c], [r2, c2]);
          if (matchesAt(r, c) || matchesAt(r2, c2)) moves.push([[r, c], [r2, c2]]);
          swapCells([r, c], [r2, c2]);
        }
      }
    }
    return moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
  }

  function findLines() {
    const lines = [];
    const scan = (get) => {
      for (let a = 0; a < N; a++) {
        let run = [get(a, 0)];
        for (let b = 1; b <= N; b++) {
          const cur = b < N ? get(a, b) : null;
          if (cur && cur.t.g === run[0].t.g) run.push(cur);
          else {
            if (run.length >= 3) lines.push(run);
            if (cur) run = [cur];
          }
        }
      }
    };
    scan((a, b) => ({ r: a, c: b, t: grid[a][b] }));
    scan((a, b) => ({ r: b, c: a, t: grid[b][a] }));
    return lines;
  }

  function renderHud() {
    hudTop.innerHTML = `<span>Score <b>${String(score).padStart(5, '0')}</b></span><span>Level ${level}</span><span>Shields ${'◆'.repeat(shields)}</span>`;
  }
  renderHud();

  // Tilt the board toward the pointer; drift gently when left alone.
  let lastPointer = 0;
  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    board.style.setProperty('--rx', `${clamp(26 - py * 30, 6, 44)}deg`);
    board.style.setProperty('--ry', `${clamp(px * 36, -22, 22)}deg`);
    lastPointer = performance.now();
  });

  const script = createScript(async ({ sleep }) => {
    // If we were paused mid-cascade, put every tile back where the grid says it is.
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        place(grid[r][c], r, c);
        grid[r][c].el.classList.remove('sel', 'hit');
      }
    }
    let drift = 0;
    for (;;) {
      if (performance.now() - lastPointer > 2500) {
        drift += 1;
        board.style.setProperty('--rx', `${26 + Math.sin(drift * 0.9) * 6}deg`);
        board.style.setProperty('--ry', `${Math.sin(drift * 0.55) * 12}deg`);
      }
      await sleep(700);
      const move = findMove();
      if (!move) {
        // No moves left: reshuffle a few tiles.
        for (let k = 0; k < 8; k++) {
          const r = Math.floor(Math.random() * N), c = Math.floor(Math.random() * N);
          const t = random();
          grid[r][c].el.remove();
          grid[r][c] = makeTile(r, c, t);
        }
        continue;
      }
      const [a, b] = move;
      const ta = grid[a[0]][a[1]], tb = grid[b[0]][b[1]];
      ta.el.classList.add('sel');
      await sleep(320);
      tb.el.classList.add('sel');
      await sleep(260);
      swapCells(a, b);
      place(ta, b[0], b[1]);
      place(tb, a[0], a[1]);
      await sleep(400);
      ta.el.classList.remove('sel');
      tb.el.classList.remove('sel');

      let chain = 0;
      for (;;) {
        const lines = findLines();
        if (!lines.length) break;
        chain++;
        const longest = lines.reduce((m, l) => (l.length > m.length ? l : m));
        eq.innerHTML = equation(longest.map((x) => x.t));
        eq.classList.add('on');
        if (chain > 1) { combo.textContent = `Combo ×${chain}`; combo.classList.add('on'); }
        const cells = new Map();
        for (const line of lines) for (const x of line) cells.set(`${x.r},${x.c}`, x);
        for (const x of cells.values()) x.t.el.classList.add('hit');
        await sleep(620);
        for (const x of cells.values()) x.t.el.classList.add('gone');
        await sleep(300);
        for (const x of cells.values()) { x.t.el.remove(); grid[x.r][x.c] = null; }
        score += cells.size * 10 * chain;
        level = 1 + Math.floor(score / 400);
        renderHud();

        // Gravity: slide survivors down, drop fresh terms in from above.
        for (let c = 0; c < N; c++) {
          let write = N - 1;
          for (let r = N - 1; r >= 0; r--) {
            if (grid[r][c]) {
              const t = grid[r][c];
              grid[r][c] = null;
              grid[write][c] = t;
              place(t, write, c);
              write--;
            }
          }
          for (let r = write, k = 1; r >= 0; r--, k++) grid[r][c] = makeTile(r, c, random(), k);
        }
        await sleep(30);
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) place(grid[r][c], r, c);
        await sleep(520);
      }
      await sleep(900);
      eq.classList.remove('on');
      combo.classList.remove('on');
      if (score > 4000) { score = 0; level = 1; renderHud(); }
    }
  });

  if (reduced) {
    const line = [{ g: 'x', c: 3 }, { g: 'x', c: -1 }, { g: 'x', c: 5 }];
    eq.innerHTML = equation(line);
    eq.classList.add('on');
  }

  return {
    start() { if (!reduced) script.start(); },
    stop() { script.stop(); },
  };
}
