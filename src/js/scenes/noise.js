// Classroom Noise Monitor: a gauge, a creature that reacts, and a spectrum ring.
// Runs on a simulated classroom, or on the visitor's own mic if they ask (audio never leaves the tab).

import { createLoop, makeCanvas, clamp, lerp } from '../lib.js';

const QUIET = 60, ALERT = 75, MIN = 20, MAX = 120;
const GREEN = [123, 228, 149], AMBER = [255, 200, 87], RED = [255, 107, 107];
const BARS = 72;

const zoneColor = (db) => (db < QUIET ? GREEN : db < ALERT ? AMBER : RED);
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export default function noise(host, { reduced }) {
  const view = makeCanvas(host, () => { if (!loop.running) draw(); });
  const { ctx } = view;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nm-mic';
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0V4A2.5 2.5 0 0 0 8 1.5Z" fill="currentColor"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><span>Use my mic</span>';
  host.append(button);

  let level = 46, target = 46, burst = 0, nextBurst = 4, time = 0, alertFor = 0;
  let blink = 0, nextBlink = 2, look = 0;
  const bars = new Float32Array(BARS);
  const barTarget = new Float32Array(BARS);
  const history = new Float32Array(160);
  let histT = 0;

  // ------------------------------------------------------------ microphone (opt-in)
  let mic = null;
  async function startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      ac.createMediaStreamSource(stream).connect(analyser);
      mic = { stream, ac, analyser, wave: new Float32Array(analyser.fftSize), freq: new Uint8Array(analyser.frequencyBinCount) };
      button.setAttribute('aria-pressed', 'true');
      button.querySelector('span').textContent = 'Mic on · stop';
      loop.start();
    } catch {
      button.querySelector('span').textContent = 'Mic unavailable';
      setTimeout(() => (button.querySelector('span').textContent = 'Use my mic'), 2500);
    }
  }
  function stopMic() {
    if (!mic) return;
    mic.stream.getTracks().forEach((t) => t.stop());
    mic.ac.close();
    mic = null;
    button.setAttribute('aria-pressed', 'false');
    button.querySelector('span').textContent = 'Use my mic';
  }
  button.addEventListener('click', () => (mic ? stopMic() : startMic()));

  // ------------------------------------------------------------ simulation

  function update(dt) {
    time += dt;
    if (mic) {
      mic.analyser.getFloatTimeDomainData(mic.wave);
      let sum = 0;
      for (const v of mic.wave) sum += v * v;
      const rms = Math.sqrt(sum / mic.wave.length) || 1e-6;
      target = clamp(100 + 20 * Math.log10(rms), MIN, MAX);
      mic.analyser.getByteFrequencyData(mic.freq);
      for (let i = 0; i < BARS; i++) {
        const bin = Math.floor((i / BARS) ** 1.6 * mic.freq.length * 0.7);
        barTarget[i] = mic.freq[bin] / 255;
      }
    } else {
      // A classroom: a murmur that drifts, with the occasional burst of excitement.
      nextBurst -= dt;
      if (nextBurst < 0) { burst = 1.2 + Math.random() * 1.4; nextBurst = 5 + Math.random() * 5; }
      const murmur = 47 + 7 * Math.sin(time * 0.23) + 4 * Math.sin(time * 0.71 + 1.3) + 3 * Math.sin(time * 2.3);
      if (burst > 0) { burst -= dt; target = murmur + 30 + Math.sin(time * 9) * 3; } else target = murmur;
      const norm = (level - MIN) / (MAX - MIN);
      for (let i = 0; i < BARS; i++) {
        if (Math.random() < 0.18) barTarget[i] = norm * (1.15 - (i / BARS) * 0.7) * (0.45 + Math.random() * 0.7);
      }
    }
    level = lerp(level, target, clamp(dt * (target > level ? 7 : 2.5), 0, 1));
    for (let i = 0; i < BARS; i++) bars[i] = lerp(bars[i], barTarget[i], clamp(dt * 12, 0, 1));

    alertFor = level >= ALERT ? alertFor + dt : 0;
    histT += dt;
    if (histT > 1 / 16) { histT = 0; history.copyWithin(0, 1); history[history.length - 1] = level; }

    nextBlink -= dt;
    if (nextBlink < 0) { blink = 0.14; nextBlink = 2.2 + Math.random() * 2.8; }
    blink = Math.max(0, blink - dt);
    look = Math.sin(time * 0.7) * 0.8 + Math.sin(time * 1.9) * 0.2;
  }

  // ------------------------------------------------------------ drawing

  function draw() {
    const W = view.w, H = view.h;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.5;
    const R = Math.min(W, H) * 0.33;
    const zone = zoneColor(level);
    const norm = (level - MIN) / (MAX - MIN);

    // Alert wash.
    if (alertFor > 0.3) {
      const a = 0.18 + 0.1 * Math.sin(time * 10);
      const g = ctx.createRadialGradient(cx, cy, R, cx, cy, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(255,80,80,0)');
      g.addColorStop(1, `rgba(255,80,80,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Spectrum ring.
    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
      const len = R * 0.06 + bars[i] * R * 0.42;
      const r0 = R * 1.12;
      ctx.strokeStyle = rgb(zoneColor(MIN + (bars[i] * 1.1) * (MAX - MIN)), 0.35 + bars[i] * 0.6);
      ctx.lineWidth = Math.max(1.5, R * 0.028);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      ctx.stroke();
    }

    // Gauge: 270° track, level arc, threshold ticks.
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const at = (db) => a0 + ((db - MIN) / (MAX - MIN)) * (a1 - a0);
    ctx.lineCap = 'round';
    ctx.lineWidth = R * 0.075;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
    ctx.strokeStyle = rgb(zone);
    ctx.shadowColor = rgb(zone, 0.8);
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, at(level)); ctx.stroke();
    ctx.shadowBlur = 0;
    for (const [db, c] of [[QUIET, AMBER], [ALERT, RED]]) {
      const a = at(db);
      ctx.strokeStyle = rgb(c, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86);
      ctx.lineTo(cx + Math.cos(a) * R * 0.93, cy + Math.sin(a) * R * 0.93);
      ctx.stroke();
    }

    drawCreature(cx, cy - R * 0.14, R * 0.44, zone, norm);

    // Readout.
    const fs = R * 0.26;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#eef4f0';
    ctx.font = `600 ${fs}px "JetBrains Mono", monospace`;
    ctx.fillText(String(Math.round(level)), cx - fs * 0.25, cy + R * 0.68);
    ctx.font = `500 ${fs * 0.36}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(238,244,240,0.6)';
    ctx.fillText('dB', cx + fs * 0.75, cy + R * 0.68);
    const status = level < QUIET ? 'NICE AND CALM' : level < ALERT ? 'GETTING LOUD' : 'TOO LOUD!';
    ctx.font = `600 ${Math.max(9, fs * 0.36)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = rgb(zone);
    ctx.fillText(status, cx, cy + R * 1.0);

    const small = Math.max(9, W * 0.017);
    ctx.font = `500 ${small}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(214,230,220,0.7)';
    const pad = W * 0.035;
    ctx.fillText(mic ? 'LIVE · YOUR MICROPHONE' : 'PRESET · GROUP WORK', pad, pad);
    ctx.fillStyle = 'rgba(214,230,220,0.45)';
    ctx.fillText(`QUIET < ${QUIET}   ALERT > ${ALERT}`, pad, pad + small * 1.6);

    // Thermometer.
    if (W > 380) {
      const tx = pad + small * 0.4, ty = H * 0.3, th = H * 0.5, tw = Math.max(6, W * 0.012);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(tx, ty, tw, th);
      ctx.fillStyle = rgb(zone);
      ctx.fillRect(tx, ty + th * (1 - norm), tw, th * norm);
      for (const db of [QUIET, ALERT]) {
        const y = ty + th * (1 - (db - MIN) / (MAX - MIN));
        ctx.fillStyle = rgb(db === QUIET ? AMBER : RED);
        ctx.fillRect(tx - 3, y, tw + 6, 1.5);
      }
    }

    // History sparkline.
    if (W > 480) {
      const sx = W * 0.75, sw = W * 0.21, sy = pad + small * 0.2, sh = H * 0.2;
      ctx.fillStyle = 'rgba(214,230,220,0.45)';
      ctx.textAlign = 'right';
      ctx.fillText('LAST 10 s', sx + sw, sy);
      const top = sy + small * 1.8;
      const yOf = (db) => top + sh * (1 - (db - MIN) / (MAX - MIN));
      ctx.strokeStyle = 'rgba(255,107,107,0.4)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(sx, yOf(ALERT)); ctx.lineTo(sx + sw, yOf(ALERT)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = rgb(zone, 0.9);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      history.forEach((v, i) => {
        const x = sx + (i / (history.length - 1)) * sw;
        const y = yOf(v || MIN);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.textAlign = 'left';
    }
  }

  function drawCreature(x, y, r, zone, norm) {
    const loud = level >= ALERT, warn = level >= QUIET;
    const shake = loud ? Math.sin(time * 40) * r * 0.03 : 0;
    const bob = Math.sin(time * 2.4) * r * 0.04;
    ctx.save();
    ctx.translate(x + shake, y + bob);

    // Antennae.
    ctx.strokeStyle = rgb(zone);
    ctx.lineWidth = Math.max(2, r * 0.07);
    for (const side of [-1, 1]) {
      const sway = Math.sin(time * 3 + side) * r * 0.08 * (1 + norm * 2);
      ctx.beginPath();
      ctx.moveTo(side * r * 0.35, -r * 0.82);
      ctx.quadraticCurveTo(side * r * 0.5, -r * 1.15, side * r * 0.55 + sway, -r * 1.32);
      ctx.stroke();
      ctx.fillStyle = rgb(zone);
      ctx.beginPath(); ctx.arc(side * r * 0.55 + sway, -r * 1.32, r * 0.1, 0, Math.PI * 2); ctx.fill();
    }

    // Body.
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
    g.addColorStop(0, rgb(zone.map((v) => Math.min(255, v + 60))));
    g.addColorStop(1, rgb(zone.map((v) => v * 0.7)));
    ctx.fillStyle = g;
    ctx.shadowColor = rgb(zone, 0.6);
    ctx.shadowBlur = r * 0.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Eyes.
    const open = blink > 0 ? 0.12 : loud ? 1.2 : 1;
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(side * r * 0.34, -r * 0.14, r * 0.19, r * 0.22 * open, 0, 0, Math.PI * 2);
      ctx.fill();
      if (open > 0.5) {
        ctx.fillStyle = '#111a14';
        ctx.beginPath();
        ctx.arc(side * r * 0.34 + look * r * 0.07, -r * 0.1, r * (loud ? 0.07 : 0.1), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Cheeks when calm.
    if (!warn) {
      ctx.fillStyle = 'rgba(255,140,160,0.45)';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * r * 0.6, r * 0.18, r * 0.11, 0, Math.PI * 2); ctx.fill(); }
    }

    // Mouth: a smile, a straight line, then a shocked O.
    ctx.strokeStyle = '#13201a';
    ctx.fillStyle = '#13201a';
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (loud) {
      ctx.ellipse(0, r * 0.38, r * 0.16, r * 0.2 * (0.8 + norm * 0.4), 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (warn) {
      ctx.moveTo(-r * 0.2, r * 0.36); ctx.lineTo(r * 0.2, r * 0.36);
      ctx.stroke();
    } else {
      ctx.arc(0, r * 0.14, r * 0.3, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  const loop = createLoop((dt) => { update(dt); draw(); });

  if (reduced) { level = 52; bars.fill(0.3); history.fill(50); }
  draw();

  return {
    start() { if (reduced && !mic) { draw(); return; } loop.start(); },
    stop() { loop.stop(); stopMic(); },
  };
}
