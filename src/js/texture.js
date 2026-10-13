// Texture layer: animated film grain, scanlined plates and glitch bursts.
// Decoration only. If anything here throws, the page is unaffected.

const BURST_TARGETS = '.chapter-head h2, .about h2, .toybox-head h2, .log h2';

/** One tile of speckle: half black, half white, each with a random alpha. */
function makeGrain(size = 160) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.random() * 150;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function burst(el, cls, ms) {
  if (!el || el.classList.contains(cls)) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

const onScreen = (el) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
};

export default function texture({ reduced } = {}) {
  const isReduced = Boolean(reduced) || matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.style.setProperty('--fx-grain', `url(${makeGrain()})`);

  const layer = document.createElement('div');
  layer.className = 'fx-grain';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);

  for (const frame of document.querySelectorAll('.plate-frame')) {
    const o = document.createElement('div');
    o.className = 'fx-plate';
    o.setAttribute('aria-hidden', 'true');
    frame.insertBefore(o, frame.querySelector('.sheen'));
  }

  if (isReduced) return;

  // A flicker when the pointer first crosses a plate.
  for (const scene of document.querySelectorAll('.plate-frame .scene')) {
    scene.parentElement.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') burst(scene, 'fx-split-plate', 320);
    });
  }

  // Clicking the hero scatters the dots, and splits them red and cyan as they go.
  const heroCanvas = document.querySelector('.hero-canvas');
  document.querySelector('.hero-stage')?.addEventListener('pointerdown', () => burst(heroCanvas, 'fx-split-dots', 320));

  // Every so often one headline on screen glitches.
  const targets = [...document.querySelectorAll(BURST_TARGETS)];
  const tick = () => {
    if (!document.hidden) {
      const live = targets.filter(onScreen);
      if (live.length) burst(live[Math.floor(Math.random() * live.length)], 'fx-glitch', 480);
    }
    setTimeout(tick, 5500 + Math.random() * 5500);
  };
  setTimeout(tick, 3500);
}
