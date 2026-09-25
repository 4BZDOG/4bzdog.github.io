// The default plate for repos that haven't been hand-catalogued yet: a constellation
// seeded from the repository name, so each one gets its own sky.

import { createLoop, makeCanvas, mulberry32, hashString } from '../lib.js';

export default function constellation(host, { reduced, accent, seed }) {
  const view = makeCanvas(host, () => { build(); if (!loop.running) draw(); });
  const { ctx } = view;
  let stars = [], figure = [], dust = [], time = 0, reveal = reduced ? 1 : 0;

  function build() {
    const r = mulberry32(hashString(seed));
    const W = view.w, H = view.h;
    dust = Array.from({ length: 140 }, () => [r() * W, r() * H, r() * 1.2 + 0.2, r() * 6]);
    const count = 6 + Math.floor(r() * 4);
    stars = Array.from({ length: count }, () => ({
      x: W * (0.15 + r() * 0.7),
      y: H * (0.18 + r() * 0.6),
      m: 1.5 + r() * 2.5,
    }));
    // Chain the stars by nearest neighbour so the figure reads as one shape.
    const left = stars.slice(1);
    figure = [stars[0]];
    while (left.length) {
      const last = figure[figure.length - 1];
      left.sort((a, b) => Math.hypot(a.x - last.x, a.y - last.y) - Math.hypot(b.x - last.x, b.y - last.y));
      figure.push(left.shift());
    }
  }

  function draw() {
    const W = view.w, H = view.h;
    const g = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    g.addColorStop(0, '#141a33');
    g.addColorStop(1, '#070912');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const [x, y, s, p] of dust) {
      ctx.fillStyle = `rgba(230,235,255,${0.25 + 0.35 * Math.sin(time * 1.2 + p) ** 2})`;
      ctx.fillRect(x, y, s, s);
    }
    ctx.strokeStyle = accent || '#c9b8ff';
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const segs = (figure.length - 1) * reveal;
    for (let i = 0; i < figure.length - 1 && i < segs; i++) {
      const a = figure[i], b = figure[i + 1];
      const t = Math.min(1, segs - i);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (const s of stars) {
      const tw = 0.8 + 0.2 * Math.sin(time * 2 + s.x);
      ctx.fillStyle = accent || '#c9b8ff';
      ctx.shadowColor = accent || '#c9b8ff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.m * tw, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.font = `500 ${Math.max(9, W * 0.017)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(220,225,245,0.6)';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`FIG. — ${seed.toUpperCase()}`, W * 0.04, H * 0.95);
  }

  const loop = createLoop((dt) => {
    time += dt;
    reveal = Math.min(1, reveal + dt * 0.35);
    draw();
  });

  build();
  draw();
  return {
    start() { if (reduced) { draw(); return; } loop.start(); },
    stop() { loop.stop(); },
  };
}
