#!/usr/bin/env node
/* ============================================================
   АУДИТОР CSS-ПЕРЕНОСА — Альтернатива · Закупки v7
   Сверяет backup/styles.css (монолит) с src/css/*.css (модули):
   1. селекторы: потерянные / переименованные / удалённые намеренно
   2. токены: var() без определения, определения вне tokens.css
   3. дубли: внутри файла (баг) и между файлами (инфо)
   4. запрещённые паттерны старой системы (!important, steps(), #111...)
   5. keyframes / z-index / breakpoints / порядок @import
   Запуск: node scripts/audit-css.js   (или npm run audit:css)
   Код возврата: 0 — чисто, 1 — есть находки.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OLD_FILE = path.join(ROOT, 'backup', 'styles.css');
const SRC_DIR = path.join(ROOT, 'src', 'css');
const ENTRY = path.join(SRC_DIR, 'styles.css');
const OUT_MD = path.join(ROOT, 'css-audit-report.md');

/* ── КОНФИГ: намеренные изменения (из decisions/P-реестра) ── */

const RENAME_MAP = {
  '.brand-text': '.brand-wordmark',
  '.user-info': '.user-display',
  '.user-info b': '.user-display b',
  '.search-bar svg': '.search-icon',
  '.tab-btn svg': '.tab-icon',
  '.role-viewer': '.control-select',
  '.note-card[data-stage-color]::before': '.note-card::before',
};

const REMOVED = {
  '.note-badge.postponed': 'P24 / решения 54,58 — отложка = clock-иконка, не жёлтый чип',
  '.btn-logs': 'decision 51 — плавающая кнопка логов удалена',
  '.data-table .btn:hover': 'P2 — единые hover-состояния кнопок',
  '.data-table .action-icon-btn:hover': 'P2 — единые hover-состояния',
  '.data-table .btn, .data-table .action-icon-btn': 'P2 — !important-перебивка transform удалена',
  '.pos-main .det-link[style*="display:none"]': 'decision 19 — inline-style хак удалён',
  '.pos-main .det-link[style*="display: none"]': 'decision 19',
  '.cs-step:focus, .cs-step:focus-visible, .cs-step:active': 'P9 — outline-хаки не нужны',
  '.pos-head:focus, .pos-head:focus-visible': 'P9',
  '.search-bar input:focus': 'сохранено в layout.css под другим селектором — проверьте вручную',
};

/* Селекторы-«инфраструктура», не подлежащие сверке */
const EXCLUDE_SELECTORS = new Set([':root', '*', 'body', 'html', 'body *']);

/* var(), живущие в инлайн-стилях JS */
const TOKEN_ALLOW = new Set(['--stage-color', '--i']);

/* Известные кросс-файловые дубли (animations.css переопределяет transition) */
const KNOWN_DUP = [
  ['.note-card', 'cards.css ↔ animations.css: стаггер-override'],
  ['.modal-overlay', 'modals.css ↔ animations.css: fade-in'],
  ['.modal', 'modals.css ↔ animations.css: scale-in'],
  ['.modal.sheet', 'modals.css ↔ animations.css: sheet-up'],
  ['.tab-btn', 'layout.css ↔ animations.css: transition+индикатор'],
  ['.btn', 'buttons.css ↔ animations.css: transition'],
  ['.action-icon-btn', 'buttons.css ↔ animations.css: transition'],
  ['.view-btn', 'layout.css ↔ animations.css: transition'],
  ['.admin-tab', 'admin.css ↔ animations.css: transition'],
  ['.dep-chip', 'admin.css ↔ animations.css: transition'],
  ['.chip', 'forms.css ↔ animations.css: transition'],
  ['.toast', 'toasts.css ↔ animations.css: spring-вход'],
  ['.fab-btn', 'buttons.css ↔ animations.css: pop'],
  ['.step-panel.active', 'forms.css ↔ animations.css: slide'],
  ['.notes-grid', 'cards.css ↔ animations.css: fadeUp контейнера'],
  ['.table-view', 'table.css ↔ animations.css: fadeUp контейнера'],
];

const ALLOWED_BREAKPOINTS = [1200, 1000, 999, 767, 480];
const ALLOWED_ZINDEX = [1, 1000, 1010, 1020, 1030, 1040, 1050, 1060];

const FORBIDDEN = [
  { re: /steps\(/g, msg: 'steps()-анимации старой системы (P7)' },
  { re: /#111111|#111\b/gi, msg: 'чернила #111 (P7)' },
  { re: /var\(--ink\b/g, msg: 'старый токен --ink' },
  { re: /--brand-blue\b/g, msg: 'старый токен --brand-blue' },
  { re: /var\(--danger\b|var\(--success\b|var\(--warning\b/g, msg: 'старые семантические токены (--danger/--success/--warning)' },
  { re: /box-shadow:\s*[^;]*\b\d+px\s+\d+px\s+0\b/g, msg: 'neo-brutal тень Npx Npx 0 (P7)' },
  { re: /border:\s*[23]px\s+solid/g, msg: 'жирная рамка 2–3px (P7)' },
  { re: /border-(top|right|bottom|left):\s*3px/g, msg: 'жирная рамка 3px (P7)' },
  { re: /radial-gradient\([^)]*rgba\(17/gi, msg: 'точечный фон (P7)' },
  { re: /translate\(-\d+px,\s*-?\d+px\)/g, msg: 'hover-сдвиг старой системы' },
  { re: /z-index:\s*(9999|10000|100000|10001)\b/g, msg: 'z-index вне шкалы токенов' },
  { re: /min-width:\s*1200px/g, msg: 'min-width 1200 таблицы (P10)' },
  { re: /%23111111|%23111\b/gi, msg: 'чёрный в data-URI svg' },
  { re: /--shadow-(sm|md|lg):\s*\d/g, msg: 'старые hard-offset тени в определениях' },
];

/* ── УТИЛИТЫ ── */

function makeLineMap(css) {
  const map = new Int32Array(css.length);
  let l = 1;
  for (let k = 0; k < css.length; k++) { map[k] = l; if (css[k] === '\n') l++; }
  return map;
}

function normSel(s) {
  return s.replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1').trim();
}

function splitSelectors(sel) {
  const out = []; let depth = 0; let buf = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(buf); buf = ''; } else buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out.map(normSel).filter(Boolean);
}

function emptyRes() {
  return { rules: [], keyframes: [], imports: [], varsDefined: [], varUse: [], zHard: [], breaks: [] };
}

function mergeInto(a, b) {
  for (const k of Object.keys(b)) a[k].push(...b[k]);
  return a;
}

/* ── ПАРСЕР: обход блоков с учётом вложенных @media/@supports ── */

function walk(css, file, ctx, map, res) {
  let i = 0; const L = css.length;
  while (i < L) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e === -1 ? L : e + 2; continue; }
    if (/\s/.test(c)) { i++; continue; }
    let j = i;
    while (j < L && css[j] !== '{' && css[j] !== ';') j++;
    if (j >= L) break;
    const sel = css.slice(i, j).trim();
    if (css[j] === ';') {
      if (sel.startsWith('@import')) res.imports.push({ sel, file, line: map[i] });
      i = j + 1; continue;
    }
    let d = 1, k = j + 1;
    while (k < L && d > 0) { if (css[k] === '{') d++; else if (css[k] === '}') d--; k++; }
    const body = css.slice(j + 1, k - 1);
    const line = map[i];
    if (sel.startsWith('@keyframes')) {
      res.keyframes.push({ name: sel.replace(/@keyframes\s+/, '').trim(), file, line });
    } else if (sel.startsWith('@media') || sel.startsWith('@supports') || sel.startsWith('@layer')) {
      const m = sel.match(/\(\s*max-width:\s*(\d+)px\s*\)/);
      if (m) res.breaks.push({ bp: +m[1], file, line });
      const nctx = ctx ? ctx + ' → ' + sel : sel;
      walk(body, file, nctx, map, res);
    } else if (sel.startsWith('@font-face') || sel.startsWith('@charset')) {
      /* ignore */
    } else {
      res.rules.push({ sel, body, file, line, ctx });
      for (const v of (body.match(/(--[\w-]+)\s*:/g) || []))
        res.varsDefined.push({ name: v.slice(0, -1).trim(), file, line });
      for (const v of (body.match(/var\(\s*(--[\w-]+)/g) || []))
        res.varUse.push({ name: v.replace(/var\(\s*/, ''), file, line });
      for (const z of (body.match(/z-index:\s*([^;]+)/g) || [])) {
        const val = z.replace(/z-index:\s*/, '').trim();
        if (/^\d+$/.test(val)) res.zHard.push({ val, file, line });
      }
    }
    i = k;
  }
  return res;
}

function parseFile(file) {
  const css = fs.readFileSync(file, 'utf8');
  const map = makeLineMap(css);
  const res = walk(css, path.basename(file), '', map, emptyRes());
  res.raw = css; res.map = map;
  return res;
}

/* ── СКАН ЗАПРЕЩЁННОГО (с контекстом reduced-motion для !important) ── */

function scanForbidden(css, file, map) {
  const hits = [];
  const patterns = FORBIDDEN.map(f => ({ ...f, re: new RegExp(f.re.source, 'g') }));
  patterns.push({ re: /!important/g, msg: '!important' });
  for (const p of patterns) {
    let m;
    while ((m = p.re.exec(css)) !== null) {
      const line = map[m.index];
      if (p.msg === '!important') {
        const back = css.slice(Math.max(0, m.index - 700), m.index);
        if (/prefers-reduced-motion/.test(back)) continue; // a11y-override разрешён
      }
      hits.push({ file, line, msg: p.msg, snippet: css.slice(m.index, m.index + 60).replace(/\n/g, ' ') });
    }
  }
  return hits;
}

/* ── KEYFRAMES: использованные vs определённые ── */

function collectAnimations(parsed) {
  const used = new Set();
  for (const r of parsed.rules) {
    const a = r.body.match(/animation(-name)?:\s*([^;]+)/);
    if (!a) continue;
    for (const part of a[2].split(',')) {
      for (const tok of part.trim().split(/\s+/)) {
        if (/^[a-zA-Z][\w-]*$/.test(tok) &&
            !['none', 'infinite', 'both', 'forwards', 'backwards', 'alternate', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'steps', 'cubic-bezier'].includes(tok))
          used.add(tok);
      }
    }
  }
  return used;
}

/* ── MAIN ── */

function main() {
  if (!fs.existsSync(OLD_FILE)) { console.error('Не найден ' + OLD_FILE); process.exit(2); }
  const oldParsed = parseFile(OLD_FILE);
  const moduleFiles = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.css') && f !== 'styles.css');
  const newParsed = emptyRes();
  const perFile = {};
  const forbiddenAll = [];
  for (const f of moduleFiles) {
    const p = parseFile(path.join(SRC_DIR, f));
    perFile[f] = p;
    mergeInto(newParsed, p);
    forbiddenAll.push(...scanForbidden(p.raw, f, p.map));
  }
  const entry = parseFile(ENTRY);

  /* 1. СЕЛЕКТОРЫ */
  const oldSels = new Map();
  for (const r of oldParsed.rules) {
    if (r.ctx.startsWith('@keyframes')) continue;
    for (const s of splitSelectors(r.sel)) {
      if (EXCLUDE_SELECTORS.has(s)) continue;
      if (!oldSels.has(s)) oldSels.set(s, `${r.file}:${r.line}`);
    }
  }
  const newSelSet = new Set();
  for (const r of newParsed.rules) for (const s of splitSelectors(r.sel)) newSelSet.add(s);

  const missing = [], renamed = [], removedOk = [];
  for (const [s, loc] of oldSels) {
    if (newSelSet.has(s)) continue;
    if (RENAME_MAP[s] && newSelSet.has(RENAME_MAP[s])) { renamed.push([s, RENAME_MAP[s], loc]); continue; }
    if (REMOVED[s]) { removedOk.push([s, REMOVED[s], loc]); continue; }
    missing.push([s, loc]);
  }
  const newOnly = [...newSelSet].filter(s => !oldSels.has(s));

  /* 2. ТОКЕНЫ */
  const defined = new Set();
  for (const v of perFile['tokens.css'].varsDefined) defined.add(v.name);
  const undefinedVars = new Map();
  for (const u of newParsed.varUse) {
    if (!defined.has(u.name) && !TOKEN_ALLOW.has(u.name)) {
      if (!undefinedVars.has(u.name)) undefinedVars.set(u.name, []);
      undefinedVars.get(u.name).push(`${u.file}:${u.line}`);
    }
  }
  const definedOutside = newParsed.varsDefined
    .filter(v => v.file !== 'tokens.css')
    .map(v => `${v.name} — ${v.file}:${v.line}`);
  const unused = [...defined].filter(d => !newParsed.varUse.some(u => u.name === d));

  /* 3. ДУБЛИ */
  const dupWithin = [], dupCross = [];
  const byCtxSel = new Map();
  for (const r of newParsed.rules) {
    for (const s of splitSelectors(r.sel)) {
      const key = s + '|' + r.ctx;
      if (!byCtxSel.has(key)) byCtxSel.set(key, []);
      byCtxSel.get(key).push(`${r.file}:${r.line}`);
    }
  }
  for (const [key, locs] of byCtxSel) {
    if (locs.length < 2) continue;
    const s = key.split('|')[0];
    const files = new Set(locs.map(l => l.split(':')[0]));
    const known = KNOWN_DUP.find(([d]) => d === s);
    if (files.size === 1) dupWithin.push(`${s} (${key.split('|')[1] || 'base'}) → ${locs.join(', ')}`);
    else if (known) dupCross.push(`${s} — допущен: ${known[1]}`);
    else dupCross.push(`${s} → ${locs.join(', ')}`);
  }

  /* 4. KEYFRAMES */
  const definedKf = new Set(newParsed.keyframes.map(k => k.name));
  const usedKf = collectAnimations(newParsed);
  const kfMissing = [...usedKf].filter(n => !definedKf.has(n));
  const kfUnused = [...definedKf].filter(n => !usedKf.has(n));

  /* 5. BREAKPOINTS / Z-INDEX / ИМПОРТЫ */
  const badBp = newParsed.breaks.filter(b => !ALLOWED_BREAKPOINTS.includes(b.bp));
  const badZ = newParsed.zHard.filter(z => !ALLOWED_ZINDEX.includes(+z.val));
  const imported = entry.imports.map(i => i.sel.replace(/@import\s+['"]?([^'";]+)['"]?/, '$1'));
  const notImported = moduleFiles.filter(f => !imported.includes(f));
  const mobileIdx = imported.indexOf('mobile.css');
  const animIdx = imported.indexOf('animations.css');
  const orderIssues = [];
  if (mobileIdx !== -1 && mobileIdx !== imported.length - 1) orderIssues.push('mobile.css не последний в @import');
  if (animIdx !== -1 && mobileIdx !== -1 && animIdx > mobileIdx) orderIssues.push('animations.css идёт после mobile.css');

  /* ── ОТЧЁТ ── */
  const md = [];
  const push = (...l) => md.push(...l);
  push('# CSS Audit — backup/styles.css → src/css/*.css', '');
  push(`Дата: ${new Date().toISOString()}`, '');
  push('## Сводка', '',
    '| Метрика | Значение |', '|---|---|',
    `| Селекторов в монолите (уникальных) | ${oldSels.size} |`,
    `| Селекторов в модулях (уникальных) | ${newSelSet.size} |`,
    `| ❌ Потерянных | ${missing.length} |`,
    `| ↻ Переименованных (ожидаемо) | ${renamed.length} |`,
    `| 🗑 Удалённых намеренно | ${removedOk.length} |`,
    `| ➕ Новых (не было в монолите) | ${newOnly.length} |`,
    `| ⚠ Дублей внутри файла | ${dupWithin.length} |`,
    `| ℹ Дублей между файлами | ${dupCross.length} |`,
    `| 🔴 var() без определения | ${undefinedVars.size} |`,
    `| ⬜ Определений вне tokens.css | ${definedOutside.length} |`,
    `| 🔵 Неиспользуемых токенов | ${unused.length} |`,
    `| 🚫 Запрещённых паттернов | ${forbiddenAll.length} |`,
    `| 🎬 keyframes: нет определения | ${kfMissing.length} |`,
    `| 🎬 keyframes: определён, не используется | ${kfUnused.length} |`,
    `| 📐 Breakpoints вне списка | ${badBp.length} |`,
    `| 🧱 z-index вне шкалы | ${badZ.length} |`,
    `| 📦 Не импортировано в styles.css | ${notImported.length} |`,
    '');

  const section = (title, items, fmt = x => x) => {
    push(`## ${title}`, '');
    if (!items.length) { push('_нет_', ''); return; }
    for (const it of items) push('- ' + fmt(it));
    push('');
  };

  section('❌ Потерянные селекторы', missing, ([s, loc]) => `\`${s}\` — был в ${loc}`);
  section('↻ Переименованные', renamed, ([o, n, loc]) => `\`${o}\` → \`${n}\` (был в ${loc})`);
  section('🗑 Удалённые намеренно', removedOk, ([s, why, loc]) => `\`${s}\` — ${why} (был в ${loc})`);
  section('➕ Новые селекторы', newOnly, s => `\`${s}\``);
  section('⚠ Дубли внутри файла', dupWithin);
  section('ℹ Дубли между файлами', dupCross);
  section('🔴 var() без определения в tokens.css',
    [...undefinedVars].map(([n, locs]) => `\`${n}\` — ${locs.join(', ')}`));
  section('⬜ Определения переменных вне tokens.css', definedOutside, s => `\`${s}\``);
  section('🔵 Неиспользуемые токены', unused, s => `\`${s}\``);
  section('🚫 Запрещённые паттерны', forbiddenAll, h =>
    `\`${h.file}:${h.line}\` — ${h.msg} — \`${h.snippet}\``);
  section('🎬 keyframes: использован, но не определён', kfMissing, s => `\`${s}\``);
  section('🎬 keyframes: определён, но не используется', kfUnused, s => `\`${s}\``);
  section('📐 Breakpoints вне [1200,1000,999,767,480]', badBp, b => `${b.bp}px — ${b.file}:${b.line}`);
  section('🧱 z-index вне шкалы', badZ, z => `${z.val} — ${z.file}:${z.line}`);
  section('📦 Файлы без @import в styles.css', notImported, f => `\`${f}\``);
  section('📦 Порядок @import', orderIssues);

  const clean = missing.length === 0 && forbiddenAll.length === 0 &&
    dupWithin.length === 0 && undefinedVars.size === 0 &&
    kfMissing.length === 0 && notImported.length === 0 && orderIssues.length === 0;

  push('## Итог', '', clean ? '✅ **Чисто** — перенос полный, паттерны старой системы отсутствуют.' :
    '❌ **Есть находки** — см. секции выше.', '');
  fs.writeFileSync(OUT_MD, md.join('\n'), 'utf8');

  console.log(md.join('\n'));
  console.log(`\nОтчёт сохранён: ${OUT_MD}`);
  process.exit(clean ? 0 : 1);
}

main();