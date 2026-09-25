#!/usr/bin/env node
// Builds the site into dist/.
//
//   node scripts/build.mjs              fetch live repo stats from GitHub, fall back to the snapshot
//   node scripts/build.mjs --offline    use data/stats-snapshot.json only
//   node scripts/build.mjs --snapshot   fetch, then rewrite data/stats-snapshot.json
//
// projects.json holds the hand-written copy. GitHub supplies the numbers (commits, dates,
// descriptions) and any public repo that isn't in projects.json yet lands in the "Lab" group.

import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const SNAPSHOT = path.join(ROOT, 'data', 'stats-snapshot.json');

const args = new Set(process.argv.slice(2));
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const config = JSON.parse(await readFile(path.join(ROOT, 'projects.json'), 'utf8'));
const OWNER = config.owner;

// ---------------------------------------------------------------- GitHub

async function gh(pathname) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `${OWNER}-portfolio-build`,
      ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${pathname}`);
  return res;
}

async function commitCount(name) {
  try {
    const res = await gh(`/repos/${OWNER}/${name}/commits?per_page=1`);
    const last = (res.headers.get('link') || '').match(/[?&]page=(\d+)>; rel="last"/);
    if (last) return Number(last[1]);
    return (await res.json()).length;
  } catch (err) {
    if (String(err.message).includes('409')) return 0; // empty repository
    throw err;
  }
}

async function fetchStats() {
  const repos = await (await gh(`/users/${OWNER}/repos?per_page=100&type=owner&sort=pushed`)).json();
  const out = {};
  for (const r of repos) {
    if (r.private) continue;
    out[r.name] = {
      name: r.name,
      description: r.description || '',
      homepage: r.homepage || '',
      hasPages: !!r.has_pages,
      fork: r.fork,
      archived: r.archived,
      language: r.language || '',
      stars: r.stargazers_count,
      created: r.created_at,
      pushed: r.pushed_at,
      url: r.html_url,
      commits: await commitCount(r.name),
    };
  }
  return { generatedAt: new Date().toISOString(), repos: out };
}

async function loadStats() {
  const snapshot = JSON.parse(await readFile(SNAPSHOT, 'utf8').catch(() => '{"repos":{}}'));
  if (args.has('--offline')) return { stats: snapshot, live: false };
  try {
    const stats = await fetchStats();
    if (args.has('--snapshot')) {
      await mkdir(path.dirname(SNAPSHOT), { recursive: true });
      await writeFile(SNAPSHOT, JSON.stringify(stats, null, 2) + '\n');
      console.log(`snapshot written: ${Object.keys(stats.repos).length} repos`);
    }
    return { stats, live: true };
  } catch (err) {
    console.warn(`! Could not reach GitHub (${err.message}); using the snapshot from ${snapshot.generatedAt || 'never'}`);
    return { stats: snapshot, live: false };
  }
}

// ---------------------------------------------------------------- helpers

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Dates are shown in Sydney time, where the projects are made and used.
const TZ = 'Australia/Sydney';
function localParts(iso) {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, day: 'numeric', month: 'numeric', year: 'numeric' })
    .formatToParts(new Date(iso));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { d: get('day'), m: get('month') - 1, y: get('year') };
}
const monthYear = (iso) => {
  const { m, y } = localParts(iso);
  return `${MONTHS[m]} ${y}`;
};
const dayMonthYear = (iso) => {
  const { d, m, y } = localParts(iso);
  return `${d} ${MONTHS[m]} ${y}`;
};
const num = (n) => Number(n || 0).toLocaleString('en-AU');
const pad2 = (n) => String(n).padStart(2, '0');

const ROMAN = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function roman(n) {
  let s = '';
  for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; }
  return s;
}

const prettyName = (repo) =>
  repo.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bHsc\b/g, 'HSC');

// A stable accent for repos that aren't hand-curated yet.
function hashAccent(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 80% 72%)`;
}

const ARROW = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const GITHUB = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

// ---------------------------------------------------------------- data

function buildProjects(stats) {
  const repos = stats.repos || {};
  const byLower = new Map(Object.values(repos).map((r) => [r.name.toLowerCase(), r]));
  const excluded = new Set(config.exclude.map((s) => s.toLowerCase()));
  const curated = new Set(config.projects.map((p) => p.repo.toLowerCase()));
  const haveLiveList = Object.keys(repos).length > 0;

  const projects = [];
  for (const p of config.projects) {
    const s = byLower.get(p.repo.toLowerCase());
    if (!s && haveLiveList) {
      console.warn(`! ${p.repo} is in projects.json but not public on GitHub; leaving it out`);
      continue;
    }
    projects.push({
      ...p,
      stats: s || null,
      url: p.url || s?.homepage || `https://${OWNER.toLowerCase()}.github.io/${p.repo}/`,
      source: `https://github.com/${OWNER}/${p.repo}`,
    });
  }

  // Anything new on GitHub goes into the Lab until it gets hand-written copy.
  const fresh = Object.values(repos)
    .filter((r) => !curated.has(r.name.toLowerCase()) && !excluded.has(r.name.toLowerCase()))
    .filter((r) => !r.fork && !r.archived)
    .sort((a, b) => b.pushed.localeCompare(a.pushed));
  for (const r of fresh) {
    const live = r.homepage || (r.hasPages ? `https://${OWNER.toLowerCase()}.github.io/${r.name}/` : '');
    projects.push({
      repo: r.name,
      group: 'lab',
      title: prettyName(r.name),
      kind: r.language || 'Repository',
      subject: 'New',
      scene: 'constellation',
      accent: hashAccent(r.name),
      tagline: r.description || 'A new project, freshly pushed.',
      description: '',
      features: [],
      stack: r.language ? [r.language] : [],
      cta: live ? 'Open it' : 'View on GitHub',
      caption: 'A constellation drawn from the repository name. Every uncatalogued project gets its own.',
      alt: `A procedurally drawn constellation for ${r.name}.`,
      stats: r,
      url: live || r.url,
      source: r.url,
    });
  }

  projects.forEach((p, i) => { p.index = i + 1; p.numeral = roman(i + 1); });
  return projects;
}

// ---------------------------------------------------------------- render

function renderHeroStats(projects) {
  const withStats = projects.filter((p) => p.stats);
  const commits = withStats.reduce((n, p) => n + (p.stats.commits || 0), 0);
  const first = withStats.map((p) => p.stats.created).sort()[0];
  const live = projects.filter((p) => !p.url.startsWith('https://github.com/')).length;
  const cells = [
    ['Works', pad2(projects.length)],
    ['Commits', num(commits)],
    ['Live', pad2(live)],
    ['Since', first ? monthYear(first) : '—'],
  ];
  return cells
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd data-count="${esc(v)}">${esc(v)}</dd></div>`)
    .join('\n');
}

function renderIndex(projects) {
  return Object.entries(config.groups)
    .map(([key, g]) => {
      const list = projects.filter((p) => p.group === key);
      if (!list.length) return '';
      const items = list
        .map(
          (p) => `
        <li style="--accent:${esc(p.accent)}">
          <a href="#p-${esc(p.repo)}">
            <span class="ix-num">${p.numeral}</span>
            <span class="ix-swatch" aria-hidden="true"></span>
            <span class="ix-title">${esc(p.title)}</span>
            <span class="ix-kind">${esc(p.kind)}</span>
            <span class="ix-go" aria-hidden="true">${ARROW}</span>
          </a>
        </li>`,
        )
        .join('');
      return `
      <div class="ix-group">
        <p class="label"><span>${esc(g.numeral)}.</span> ${esc(g.title)} <em>— for ${key === 'play' ? 'fun' : key === 'work' ? 'real' : 'now'}</em></p>
        <ol>${items}
        </ol>
      </div>`;
    })
    .join('');
}

function renderExhibit(p) {
  const s = p.stats;
  const meta = s
    ? `<dl class="meta">
          <div><dt>Commits</dt><dd>${num(s.commits)}</dd></div>
          <div><dt>Started</dt><dd>${monthYear(s.created)}</dd></div>
          <div><dt>Last push</dt><dd>${dayMonthYear(s.pushed)}</dd></div>
        </dl>`
    : '';
  const features = p.features.length
    ? `<ul class="features">${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
    : '';
  const stack = p.stack.length ? `<ul class="stack" aria-label="Built with">${p.stack.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
  const desc = p.description ? `<p class="desc">${esc(p.description)}</p>` : '';
  const sourceBtn = p.url !== p.source
    ? `<a class="btn ghost" href="${esc(p.source)}">${GITHUB}<span>Source</span></a>`
    : '';

  return `
    <article class="exhibit" id="p-${esc(p.repo)}" style="--accent:${esc(p.accent)}" data-reveal>
      <figure class="plate">
        <div class="plate-frame" data-tilt>
          <div class="scene scene-${esc(p.scene)}" data-scene="${esc(p.scene)}" data-seed="${esc(p.repo)}" role="img" aria-label="${esc(p.alt)}"></div>
          <div class="sheen" aria-hidden="true"></div>
        </div>
        <figcaption><span>Fig. ${p.index}</span> ${esc(p.caption)}</figcaption>
      </figure>
      <div class="exhibit-body">
        <p class="kicker"><span class="plate-no">Plate ${p.numeral}</span><span>${esc(p.kind)}</span><span>${esc(p.subject)}</span></p>
        <h3>${esc(p.title)}</h3>
        <p class="tagline">${esc(p.tagline)}</p>
        ${desc}
        ${features}
        ${stack}
        ${meta}
        <div class="actions">
          <a class="btn primary" href="${esc(p.url)}"><span>${esc(p.cta)}</span>${ARROW}</a>
          ${sourceBtn}
        </div>
      </div>
    </article>`;
}

function renderChapters(projects) {
  return Object.entries(config.groups)
    .map(([key, g]) => {
      const list = projects.filter((p) => p.group === key);
      if (!list.length) return '';
      return `
  <section class="chapter" id="${key}" aria-labelledby="${key}-h">
    <header class="chapter-head" data-reveal>
      <p class="label">Chapter ${esc(g.numeral)} · ${list.length} ${list.length === 1 ? 'work' : 'works'}</p>
      <h2 id="${key}-h">${esc(g.title)} <em>— ${esc(g.subtitle)}.</em></h2>
      <p class="chapter-blurb">${esc(g.blurb)}</p>
    </header>
    ${list.map(renderExhibit).join('\n')}
  </section>`;
    })
    .join('\n');
}

function renderTimeline(projects, builtAt) {
  const rows = projects.filter((p) => p.stats).sort((a, b) => a.stats.created.localeCompare(b.stats.created));
  if (!rows.length) return '';
  const start = new Date(rows[0].stats.created);
  start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(builtAt);
  end.setUTCMonth(end.getUTCMonth() + 1, 1); end.setUTCHours(0, 0, 0, 0);
  const span = end - start;
  const pct = (iso) => Math.max(0, Math.min(100, ((new Date(iso) - start) / span) * 100));

  const ticks = [];
  for (let d = new Date(start); d < end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const label = d.getUTCMonth() === 0 || ticks.length === 0 ? `${MONTHS[d.getUTCMonth()]} ’${String(d.getUTCFullYear()).slice(2)}` : MONTHS[d.getUTCMonth()];
    ticks.push(`<span style="left:${pct(d.toISOString()).toFixed(2)}%">${label}</span>`);
  }
  const maxLog = Math.log10(Math.max(...rows.map((p) => p.stats.commits || 1)) + 1);

  const lanes = rows
    .map((p) => {
      const a = pct(p.stats.created);
      const b = Math.max(a + 0.8, pct(p.stats.pushed));
      const weight = Math.log10((p.stats.commits || 1) + 1) / maxLog;
      return `
      <li style="--accent:${esc(p.accent)};--a:${a.toFixed(2)}%;--w:${(b - a).toFixed(2)}%;--k:${weight.toFixed(3)}">
        <a class="lane-name" href="#p-${esc(p.repo)}">${esc(p.title)}</a>
        <span class="lane-track"><span class="lane-bar"><span class="lane-dot" aria-hidden="true"></span></span></span>
        <span class="lane-count">${num(p.stats.commits)}<small> commits</small></span>
      </li>`;
    })
    .join('');

  return `
      <div class="lanes" data-reveal>
        <div class="lane-axis" aria-hidden="true"><span class="lane-name"></span><span class="lane-ticks">${ticks.join('')}</span><span class="lane-count"></span></div>
        <ol>${lanes}
        </ol>
      </div>`;
}

// ---------------------------------------------------------------- main

const { stats, live } = await loadStats();
const projects = buildProjects(stats);
const builtAt = new Date().toISOString();

let html = await readFile(path.join(SRC, 'index.html'), 'utf8');
const slots = {
  HERO_STATS: renderHeroStats(projects),
  ACCENTS: esc(projects.map((p) => p.accent).join(',')),
  INDEX: renderIndex(projects),
  CHAPTERS: renderChapters(projects),
  TIMELINE: renderTimeline(projects, builtAt),
  BUILD_DATE: dayMonthYear(builtAt),
  BUILD_ISO: builtAt,
  WORK_COUNT: esc(String(projects.length)),
  OWNER: esc(OWNER),
  YEAR: String(localParts(builtAt).y),
};
html = html.replace(/<!--\s*@(\w+)\s*-->|@@(\w+)@@/g, (m, a, b) => {
  const key = a || b;
  if (!(key in slots)) throw new Error(`Unknown template slot ${key}`);
  return slots[key];
});

await rm(DIST, { recursive: true, force: true });
await cp(SRC, DIST, { recursive: true, filter: (f) => path.basename(f) !== 'index.html' || path.dirname(f) !== SRC });
await writeFile(path.join(DIST, 'index.html'), html);

console.log(`built dist/ · ${projects.length} projects · stats ${live ? 'live from GitHub' : 'from snapshot'}`);
