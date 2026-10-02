// HSC Enterprise Computing Notes: a small data set is cleaned, charted and read for
// its insight, the Data Science → Data Visualisation arc of the Year 12 course.

import { createScript, el } from '../lib.js';

const SETS = [
  { title: 'canteen_sales.csv', col: 'Item', val: 'Sold', insight: 'Insight: wraps outsell every other item', rows: [['Wrap', 64], ['Pie', 41], ['Salad', 23], ['Fruit', 35], ['Juice', 52]] },
  { title: 'wifi_usage.csv', col: 'Period', val: 'Users', insight: 'Insight: recess is the peak load', rows: [['P1', 38], ['Recess', 92], ['P3', 55], ['Lunch', 81], ['P5', 29]] },
  { title: 'sleep_survey.csv', col: 'Hours', val: 'Students', insight: 'Insight: most students sleep 6–7 hours', rows: [['<5', 12], ['5–6', 34], ['6–7', 61], ['7–8', 47], ['8+', 18]] },
];

export default function entcomp(host, { reduced }) {
  const wrap = el('div', 'ec-wrap');
  const bar = el('div', 'ec-bar');
  const file = el('span', 'ec-file');
  const steps = el('span', 'ec-steps');
  const stepEls = ['Collect', 'Clean', 'Visualise'].map((t) => el('span', null, t));
  steps.append(...stepEls);
  bar.append(file, steps);

  const table = el('div', 'ec-table');
  const chart = el('div', 'ec-chart');
  const insight = el('p', 'ec-insight');
  wrap.append(bar, table, chart, insight);
  host.append(wrap);

  const setStep = (n) => stepEls.forEach((s, i) => s.classList.toggle('on', i === n));

  function build(set, filled) {
    file.textContent = set.title;
    table.innerHTML = '';
    chart.innerHTML = '';
    const head = el('div', 'ec-row ec-head');
    head.append(el('span', null, set.col), el('span', null, set.val));
    table.append(head);
    const max = Math.max(...set.rows.map((r) => r[1]));
    const rows = set.rows.map(([k, v]) => {
      const row = el('div', 'ec-row');
      row.append(el('span', null, k), el('span', null, String(v)));
      table.append(row);
      const col = el('div', 'ec-col');
      const b = el('i');
      b.style.setProperty('--h', `${(v / max) * 100}%`);
      col.append(b, el('small', null, k));
      chart.append(col);
      return { row, col, v };
    });
    const top = rows.reduce((a, b) => (b.v > a.v ? b : a));
    insight.textContent = set.insight;
    insight.classList.remove('on');
    if (filled) {
      rows.forEach((r) => { r.row.classList.add('in'); r.col.classList.add('in'); });
      top.col.classList.add('top');
      insight.classList.add('on');
      setStep(2);
    } else {
      setStep(-1);
    }
    return { rows, top };
  }

  let round = 0;
  const script = createScript(async ({ sleep }) => {
    for (;;) {
      const set = SETS[round++ % SETS.length];
      const { rows, top } = build(set, false);
      await sleep(500);
      setStep(0);
      for (const r of rows) { r.row.classList.add('in'); await sleep(260); }
      await sleep(500);
      setStep(1);
      table.classList.add('clean');
      await sleep(900);
      table.classList.remove('clean');
      setStep(2);
      for (const r of rows) { r.col.classList.add('in'); await sleep(160); }
      await sleep(500);
      top.col.classList.add('top');
      insight.classList.add('on');
      await sleep(3200);
    }
  });

  build(SETS[0], true);

  return {
    start() { if (!reduced) script.start(); },
    stop() { script.stop(); },
  };
}
