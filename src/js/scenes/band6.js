// Band 6: an answer types itself, the "ruthless marker" circles the command verb,
// caps a descriptive draft at Band 3, then the rewrite climbs to Band 5.

import { createScript, el } from '../lib.js';

const DRAFTS = [
  {
    label: 'Draft 1',
    parts: [
      'Technology has ',
      { mark: 'bad', text: 'changed communication a lot' },
      '. People now use phones and social media to talk every day, and messages are sent instantly.',
    ],
    note: 'Describes, doesn’t analyse → capped at Band 3',
    good: false,
    band: 3,
    tip: ['Band 4 next', 'Explain how and why: cause → effect → significance.'],
  },
  {
    label: 'Draft 2',
    parts: [
      'Instant messaging ',
      { mark: 'good', text: 'removed the delay between thought and reply' },
      ', so ',
      { mark: 'good', text: 'replies are now expected within minutes' },
      '. Communication has become more frequent but shallower, favouring brevity over reflection.',
    ],
    note: 'Cause → effect → significance ✓',
    good: true,
    band: 5,
    tip: ['Band 6 next', 'Weigh a counter-view: where has depth survived?'],
  },
];

export default function band6(host, { reduced }) {
  const paper = el('div', 'b6-paper');
  const q = el('div', 'b6-q', 'Question 4 · 5 marks');
  const prompt = el('div', 'b6-prompt');
  const verb = el('span', 'b6-verb', 'Analyse');
  prompt.append(verb, ' how technology has changed the way people communicate.');
  const answer = el('div', 'b6-answer');
  paper.append(q, prompt, answer);

  const side = el('div', 'b6-side');
  const meter = el('div', 'b6-meter');
  const barsEl = el('div', 'b6-bars');
  const bars = Array.from({ length: 6 }, (_, i) => {
    const b = el('i');
    b.style.setProperty('--n', i);
    barsEl.append(b);
    return b;
  });
  const bandLabel = el('div', 'b6-band');
  meter.append(barsEl, bandLabel);
  const note = el('div', 'b6-note');
  const tip = el('div', 'b6-tip');
  side.append(meter, note, tip);
  host.append(paper, side);

  const setBand = (n, capped) => {
    bars.forEach((b, i) => b.classList.toggle('lit', i < n));
    barsEl.classList.toggle('capped', !!capped);
    bandLabel.innerHTML = n ? `Band ${n} <small>/ 6${capped ? ' · capped' : ''}</small>` : 'Marking <small>…</small>';
  };

  function reset(d) {
    answer.textContent = '';
    answer.style.opacity = '';
    note.className = 'b6-note';
    tip.className = 'b6-tip';
    verb.classList.remove('circled');
    q.textContent = `Question 4 · 5 marks · ${d.label}`;
    setBand(0);
  }

  function fill(d, instant) {
    const marks = [];
    for (const part of d.parts) {
      if (typeof part === 'string') answer.append(part);
      else {
        const span = el('span', `b6-mark${part.mark === 'good' ? ' good' : ''}`, instant ? part.text : '');
        answer.append(span);
        marks.push({ span, text: part.text });
      }
    }
    return marks;
  }

  function showVerdict(d) {
    note.textContent = d.note;
    note.classList.toggle('good', d.good);
    note.classList.add('on');
    tip.innerHTML = '';
    tip.append(el('b', null, d.tip[0]), d.tip[1]);
  }

  const script = createScript(async ({ sleep }) => {
    for (let round = 0; ; round++) {
      const d = DRAFTS[round % DRAFTS.length];
      reset(d);
      const caret = el('span', 'b6-caret');
      answer.append(caret);
      await sleep(700);

      // Type it out, one character at a time.
      const marks = [];
      for (const part of d.parts) {
        const text = typeof part === 'string' ? part : part.text;
        let target;
        if (typeof part === 'string') {
          target = document.createTextNode('');
          answer.insertBefore(target, caret);
        } else {
          target = el('span', `b6-mark${part.mark === 'good' ? ' good' : ''}`);
          answer.insertBefore(target, caret);
          marks.push(target);
        }
        for (const ch of text) {
          target.textContent += ch;
          await sleep(ch === '.' || ch === ',' ? 160 : 18 + Math.random() * 30);
        }
      }
      await sleep(500);
      caret.remove();

      // The marker reads it.
      verb.classList.add('circled');
      await sleep(600);
      for (const m of marks) { m.classList.add('on'); await sleep(450); }
      showVerdict(d);
      await sleep(500);
      for (let n = 1; n <= d.band; n++) { setBand(n, !d.good && n === d.band); await sleep(170); }
      tip.classList.add('on');
      await sleep(d.good ? 3400 : 2800);
      answer.style.opacity = '0.25';
      note.classList.remove('on');
      await sleep(400);
    }
  });

  if (reduced) {
    const d = DRAFTS[1];
    reset(d);
    for (const { span } of fill(d, true)) span.classList.add('on');
    verb.classList.add('circled');
    showVerdict(d);
    setBand(d.band, false);
    tip.classList.add('on');
  } else {
    reset(DRAFTS[0]);
  }

  return {
    start() { if (!reduced) script.start(); },
    stop() { script.stop(); },
  };
}
