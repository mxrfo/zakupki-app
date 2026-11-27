#!/usr/bin/env node
/* ============================================================
   АУДИТОР CSS-ПЕРЕНОСА — Альтернатива · Закупки v7 (v2)
   backup/styles.css → src/css/*.css + dist/index.html + src/js/**
   Фиксы v2:
   - A1: вырезание <script>/<style> перед парсингом class=""
   - A2: покрытость класса через вхождение в любой селектор
   - A3: корректный regex теней (не ловит определения)
   - A4: allowlist !important по контексту
   - A5: расширенная z-шкала
   - A6: сканирование src/js/**.js на динамические классы
   - A7: расширенные REMOVED/RENAME_MAP
   Запуск: npm run audit:css
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OLD_FILE = path.join(ROOT, 'backup', 'styles.css');
const SRC_DIR = path.join(ROOT, 'src', 'css');
const ENTRY = path.join(SRC_DIR, 'styles.css');
const DIST_HTML = path.join(ROOT, 'dist', 'index.html');
const JS_DIR = path.join(ROOT, 'src', 'js');
const OUT_MD = path.join(ROOT, 'css-audit-report.md');

/* ── КОНФИГ: намеренные изменения ── */

const RENAME_MAP = {
  '.brand-text': '.brand-wordmark',
  '.user-info': '.user-display',
  '.search-bar svg': '.search-icon',
  '.tab-btn svg': '.tab-icon',
  '.role-viewer': '.control-select',
  '.note-card[data-stage-color]::before': '.note-card::before',
  '.test-mode-wrapper input': '.test-mode-wrapper input[type="checkbox"]',
  '.data-table tr:hover': '.data-table tbody tr:hover',
};

const REMOVED = {
  '.user-info b': '.user-display рендерится без <b>',
  '.btn-icon': 'не используется (заменён .action-icon-btn)',
  '.btn-approval-submit': 'не используется (заменён .btn-primary)',
  '.btn-approval-submit:hover': 'не используется',
  '.action-icon-btn.primary': 'не используется',
  '.action-icon-btn.dark': 'не используется',
  '.action-icon-btn:active': 'не используется (animations.css даёт scale)',
  '.note-badge.postponed': 'P24/решения 54,58 — но JS пока рендерит → добавлен в cards.css',
  '.data-table .btn': 'P2',
  '.data-table .btn:hover': 'P2 → transform:none в table.css',
  '.data-table .action-icon-btn:hover': 'P2',
  '.form-group input[type="date"]::after': 'нативный picker-индикатор',
  '.log-panel.open': 'P22 — логи теперь static-вкладка',
  '.btn-logs:hover': 'decision 51',
  '.pos-main .det-link[style*="display:none"]': 'decision 19',
  '.pos-main .det-link[style*="display: none"]': 'decision 19',
  '.cs-step:focus': 'P9 — outline-хаки не нужны',
  '.cs-step:focus-visible': 'P9',
  '.cs-step:active': 'P9',
  '.pos-head:focus': 'P9',
  '.pos-head:focus-visible': 'P9',
};



const EXCLUDE_SELECTORS = new Set([':root', '*', 'body', 'html', 'body *', '*::before', '*::after']);
const TOKEN_ALLOW = new Set(['--stage-color', '--i']);

const KNOWN_DUP = [
  ['.note-card', 'cards ↔ animations: стаггер'],
  ['.modal-overlay', 'modals ↔ animations'],
  ['.modal', 'modals ↔ animations'],
  ['.modal.sheet', 'modals ↔ animations'],
  ['.tab-btn', 'layout ↔ animations: ::after индикатор'],
  ['.btn', 'buttons ↔ animations: transform'],
  ['.btn:hover', 'buttons ↔ animations'],
  ['.btn:active', 'buttons ↔ animations'],
  ['.action-icon-btn', 'buttons ↔ animations'],
  ['.action-icon-btn:hover', 'buttons ↔ animations'],
  ['.view-btn', 'layout ↔ animations'],
  ['.admin-tab', 'admin ↔ animations'],
  ['.dep-chip', 'admin ↔ animations'],
  ['.toast', 'toasts ↔ animations'],
  ['.fab-btn', 'buttons ↔ animations'],
  ['.step-panel.active', 'forms ↔ animations'],
  ['.notes-grid', 'cards ↔ animations'],
  ['.table-view', 'table ↔ animations'],
  ['.app-layout', 'layout ↔ mobile'],
  ['.sidebar', 'layout ↔ mobile'],
  ['.topbar', 'layout ↔ mobile'],
  ['.search-bar', 'layout ↔ mobile'],
  ['.main-content', 'layout ↔ mobile'],
  ['.data-table td', 'table ↔ mobile (media)'],
  ['.data-table th', 'table ↔ mobile (media)'],
];

const IMPORTANT_OK = [/\[hidden\]/, /link-hidden/, /prefers-reduced-motion/, /\.cs-fill/, /\.hidden/];

const ALLOWED_BREAKPOINTS = [1200, 1000, 999, 767, 480];
const ALLOWED_ZINDEX = [1, 2, 900, 1000, 1010, 1020, 1030, 1040, 1050, 1060, 1100, 1200, 1300, 1400];

const FORBIDDEN = [
  { re: /steps\(/g, msg: 'steps()-анимации (P7)' },
  { re: /#111111|#111\b/gi, msg: 'чернила #111 (P7)' },
  { re: /var\(--ink\b/g, msg: 'старый токен --ink' },
  { re: /--brand-blue\b/g, msg: 'старый токен --brand-blue' },
  { re: /var\(--danger\b|var\(--success\b|var\(--warning\b/g, msg: 'старые токены' },
  { re: /box-shadow:\s*[^;]*\b\d+px\s+\d+px\s+0\b/g, msg: 'neo-brutal тень' },
  { re: /border:\s*[23]px\s+solid/g, msg: 'жирная рамка 2–3px' },
  { re: /border-(top|right|bottom|left):\s*3px/g, msg: 'жирная рамка 3px' },
  { re: /radial-gradient\([^)]*rgba\(17/gi, msg: 'точечный фон' },
  { re: /translate\(-\d+px,\s*-?\d+px\)/g, msg: 'hover-сдвиг старой системы' },
  { re: /z-index:\s*(9999|10000|100000|10001)\b/g, msg: 'z-index вне шкалы' },
  { re: /min-width:\s*1200px/g, msg: 'min-width 1200 таблицы' },
  { re: /%23111111|%23111\b/gi, msg: 'чёрный в data-URI' },
  { re: /--shadow-(?:sm|md|lg):\s*[^;]*\b\d+px\s+\d+px\s+0\b/g, msg: 'hard-offset в определении тени' },
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
  for (const k of Object.keys(b)) {
    if (Array.isArray(a[k]) && Array.isArray(b[k])) a[k].push(...b[k]);
  }
  return a;
}

/* ── ПАРСЕР CSS ── */

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
      walk(body, file, ctx ? ctx + ' → ' + sel : sel, map, res);
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

/* ── СКАН ЗАПРЕЩЁННОГО (v2: allowlist !important) ── */

function scanForbidden(css, file, map) {
  const hits = [];
  const patterns = FORBIDDEN.map(f => ({ ...f, re: new RegExp(f.re.source, 'g') }));
  patterns.push({ re: /!important/g, msg: '!important' });
  for (const p of patterns) {
    let m;
    while ((m = p.re.exec(css)) !== null) {
      const line = map[m.index];
      if (p.msg === '!important') {
        const back = css.slice(Math.max(0, m.index - 400), m.index);
        if (IMPORTANT_OK.some(re => re.test(back))) continue;
      }
      hits.push({ file, line, msg: p.msg, snippet: css.slice(m.index, m.index + 60).replace(/\n/g, ' ') });
    }
  }
  return hits;
}

/* ── KEYFRAMES ── */

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

/* ── АНАЛИЗ HTML (v2: вырезание script/style) ── */

function analyzeHTML(html) {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const results = { classes: new Map(), ids: [], inlineStyles: [], bx24Classes: [], scriptRefs: [] };
  let m;
  const classRegex = /class="([^"]+)"/g;
  while ((m = classRegex.exec(clean)) !== null) {
    const line = html.slice(0, m.index).split('\n').length;
    for (const cls of m[1].split(/\s+/).filter(Boolean)) {
      if (!results.classes.has(cls)) results.classes.set(cls, []);
      results.classes.get(cls).push(line);
    }
  }
  const idRegex = /\bid="([^"]+)"/g;
  while ((m = idRegex.exec(clean)) !== null) {
    results.ids.push({ id: m[1], line: html.slice(0, m.index).split('\n').length });
  }
  const styleRegex = /style="([^"]+)"/g;
  while ((m = styleRegex.exec(clean)) !== null) {
    results.inlineStyles.push({ style: m[1], line: html.slice(0, m.index).split('\n').length });
  }
  const bx24Regex = /\bb24-[a-z-]+\b/g;
  while ((m = bx24Regex.exec(clean)) !== null) {
    results.bx24Classes.push({ cls: m[0], line: html.slice(0, m.index).split('\n').length });
  }
  const scriptRegex = /<script\s+src="([^"]+)"/g;
  while ((m = scriptRegex.exec(html)) !== null) results.scriptRefs.push(m[1]);
  return results;
}

/* ── СКАН JS-КЛАССОВ (v2) ── */

function walkDir(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkDir(full, ext, out);
    else if (f.endsWith(ext)) out.push(full);
  }
  return out;
}

function collectJsClasses() {
  const set = new Set();
  for (const file of walkDir(JS_DIR, '.js')) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/class="([^"{}$]+)"/g))
      for (const c of m[1].split(/\s+/)) if (/^[a-z][\w-]*$/i.test(c)) set.add(c);
    for (const m of src.matchAll(/classList\.(?:add|toggle|remove)\(([^)]+)\)/g))
      for (const q of m[1].matchAll(/['"]([\w-]+)['"]/g)) set.add(q[1]);
    for (const m of src.matchAll(/className\s*=\s*['"]([^"'{}$]+)['"]/g))
      for (const c of m[1].split(/\s+/)) if (/^[a-z][\w-]*$/i.test(c)) set.add(c);
  }
  return set;
}

/* ── ПОКРЫТОСТЬ КЛАССА (v2) ── */

function buildClassIndex(selSet) {
  const idx = new Set();
  for (const s of selSet) {
    for (const m of s.matchAll(/\.([A-Za-z_][\w-]*)/g)) idx.add(m[1]);
  }
  return idx;
}

/* ── MAIN ── */

function main() {
  if (!fs.existsSync(OLD_FILE)) { console.error('Не найден ' + OLD_FILE); process.exit(2); }
  const oldParsed = parseFile(OLD_FILE);
  const moduleFiles = fs.readdirSync(SRC_DIR)
    .filter(f => f.endsWith('.css') && f !== 'styles.css')
    .filter(f => fs.statSync(path.join(SRC_DIR, f)).isFile());
  const newParsed = emptyRes();
  const perFile = {};
  const forbiddenAll = [];
  for (const f of moduleFiles) {
    try {
      const p = parseFile(path.join(SRC_DIR, f));
      perFile[f] = p;
      mergeInto(newParsed, p);
      forbiddenAll.push(...scanForbidden(p.raw, f, p.map));
    } catch (e) { console.warn(`⚠ ${f}: ${e.message}`); }
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
  if (perFile['tokens.css']) for (const v of perFile['tokens.css'].varsDefined) defined.add(v.name);
  const undefinedVars = new Map();
  for (const u of newParsed.varUse) {
    if (!defined.has(u.name) && !TOKEN_ALLOW.has(u.name)) {
      if (!undefinedVars.has(u.name)) undefinedVars.set(u.name, []);
      undefinedVars.get(u.name).push(`${u.file}:${u.line}`);
    }
  }
  const definedOutside = newParsed.varsDefined.filter(v => v.file !== 'tokens.css')
    .map(v => `${v.name} — ${v.file}:${v.line}`);
  const unused = [...defined].filter(d => !newParsed.varUse.some(u => u.name === d));

  /* 3. ДУБЛИ */
  const dupWithin = [], dupCross = [];
  const byCtxSel = new Map();
  for (const r of newParsed.rules) for (const s of splitSelectors(r.sel)) {
    const key = s + '|' + r.ctx;
    if (!byCtxSel.has(key)) byCtxSel.set(key, []);
    byCtxSel.get(key).push(`${r.file}:${r.line}`);
  }
  for (const [key, locs] of byCtxSel) {
    if (locs.length < 2) continue;
    const s = key.split('|')[0];
    const files = new Set(locs.map(l => l.split(':')[0]));
    const known = KNOWN_DUP.find(([d]) => d === s || s.startsWith(d + ':') || s.startsWith(d + ' '));
    if (files.size === 1) dupWithin.push(`${s} (${key.split('|')[1] || 'base'}) → ${locs.join(', ')}`);
    else if (known) dupCross.push(`${s} — допущен: ${known[1]}`);
    else dupCross.push(`${s} → ${locs.join(', ')}`);
  }

  /* 4. KEYFRAMES */
  const definedKf = new Set(newParsed.keyframes.map(k => k.name));
  const usedKf = collectAnimations(newParsed);
  const kfMissing = [...usedKf].filter(n => !definedKf.has(n));
  const kfUnused = [...definedKf].filter(n => !usedKf.has(n));

  /* 5. BREAKPOINTS / Z / ИМПОРТЫ */
  const badBp = newParsed.breaks.filter(b => !ALLOWED_BREAKPOINTS.includes(b.bp));
  const badZ = newParsed.zHard.filter(z => !ALLOWED_ZINDEX.includes(+z.val));
  const imported = entry.imports.map(i => i.sel.replace(/@import\s+['"]?([^'";]+)['"]?/, '$1'));
  const notImported = moduleFiles.filter(f => !imported.includes(f));
  const mobileIdx = imported.indexOf('mobile.css');
  const animIdx = imported.indexOf('animations.css');
  const orderIssues = [];
  if (mobileIdx !== -1 && mobileIdx !== imported.length - 1) orderIssues.push('mobile.css не последний');
  if (animIdx !== -1 && mobileIdx !== -1 && animIdx > mobileIdx) orderIssues.push('animations.css после mobile.css');

  /* 6. HTML + JS КЛАССЫ */
  const htmlAnalysis = { classes: [], ids: [], inlineStyles: [], bx24: [], scripts: [] };
  let htmlRes = null;
  const classIdx = buildClassIndex(newSelSet);
  const jsClasses = collectJsClasses();
  if (fs.existsSync(DIST_HTML)) {
    htmlRes = analyzeHTML(fs.readFileSync(DIST_HTML, 'utf8'));
    const allHtmlClasses = new Set([...htmlRes.classes.keys(), ...jsClasses]);
    for (const cls of allHtmlClasses) {
      if (cls.startsWith('b24-') || cls.startsWith('js-')) continue;
      if (!classIdx.has(cls)) {
        htmlAnalysis.classes.push({ cls, lines: htmlRes.classes.get(cls) || ['JS'] });
      }
    }
    const idCount = new Map();
    for (const { id, line } of htmlRes.ids) {
      if (!idCount.has(id)) idCount.set(id, []);
      idCount.get(id).push(line);
    }
    for (const [id, lines] of idCount) if (lines.length > 1) htmlAnalysis.ids.push({ id, lines });
    for (const { style, line } of htmlRes.inlineStyles)
      if (/display:\s*none/.test(style)) htmlAnalysis.inlineStyles.push({ style, line });
    htmlAnalysis.bx24 = [...new Set(htmlRes.bx24Classes.map(b => b.cls))].sort();
    htmlAnalysis.scripts = htmlRes.scriptRefs;
  } else console.warn('⚠ dist/index.html не найден');

  /* ── ОТЧЁТ ── */
  const md = [];
  const push = (...l) => md.push(...l);
  push('# CSS Audit v2 — backup → src/css + dist/index.html + src/js', '');
  push(`Дата: ${new Date().toISOString()}`, '');
  push('## Сводка', '',
    '| Метрика | Значение |', '|---|---|',
    `| Селекторов в монолите | ${oldSels.size} |`,
    `| Селекторов в модулях | ${newSelSet.size} |`,
    `| ❌ Потерянных | ${missing.length} |`,
    `| ↻ Переименованных | ${renamed.length} |`,
    `| 🗑 Удалённых намеренно | ${removedOk.length} |`,
    `| ➕ Новых | ${newOnly.length} |`,
    `| ⚠ Дублей внутри файла | ${dupWithin.length} |`,
    `| ℹ Дублей между файлами | ${dupCross.length} |`,
    `| 🔴 var() без определения | ${undefinedVars.size} |`,
    `| ⬜ Определений вне tokens.css | ${definedOutside.length} |`,
    `| 🔵 Неиспользуемых токенов | ${unused.length} |`,
    `| 🚫 Запрещённых паттернов | ${forbiddenAll.length} |`,
    `| 🎬 keyframes: нет определения | ${kfMissing.length} |`,
    `| 📐 Breakpoints вне списка | ${badBp.length} |`,
    `| 🧱 z-index вне шкалы | ${badZ.length} |`,
    `| 📦 Не импортировано | ${notImported.length} |`,
    `| 🟡 HTML/JS-классов без CSS | ${htmlAnalysis.classes.length} |`,
    `| 🔴 Дубликатов ID | ${htmlAnalysis.ids.length} |`,
    `| ⚠ Inline display:none | ${htmlAnalysis.inlineStyles.length} |`,
    '');

  const section = (t, items, fmt = x => x) => {
    push(`## ${t}`, '');
    if (!items.length) { push('_нет_', ''); return; }
    for (const it of items) push('- ' + fmt(it));
    push('');
  };

  section('❌ Потерянные селекторы', missing, ([s, loc]) => `\`${s}\` — был в ${loc}`);
  section('↻ Переименованные', renamed, ([o, n, loc]) => `\`${o}\` → \`${n}\` (был в ${loc})`);
  section('🗑 Удалённые намеренно', removedOk, ([s, why, loc]) => `\`${s}\` — ${why}`);
  section('➕ Новые селекторы', newOnly, s => `\`${s}\``);
  section('⚠ Дубли внутри файла', dupWithin);
  section('ℹ Дубли между файлами', dupCross);
  section('🔴 var() без определения', [...undefinedVars].map(([n, locs]) => `\`${n}\` — ${locs.join(', ')}`));
  section('⬜ Определения вне tokens.css', definedOutside, s => `\`${s}\``);
  section('🔵 Неиспользуемые токены', unused, s => `\`${s}\``);
  section('🚫 Запрещённые паттерны', forbiddenAll, h => `\`${h.file}:${h.line}\` — ${h.msg} — \`${h.snippet}\``);
  section('🎬 keyframes: нет определения', kfMissing, s => `\`${s}\``);
  section('📐 Breakpoints вне списка', badBp, b => `${b.bp}px — ${b.file}:${b.line}`);
  section('🧱 z-index вне шкалы', badZ, z => `${z.val} — ${z.file}:${z.line}`);
  section('📦 Не импортировано', notImported, f => `\`${f}\``);
  section('📦 Порядок @import', orderIssues);
  section('🟡 HTML/JS-классы без CSS-покрытия', htmlAnalysis.classes, c =>
    `.${c.cls} — ${c.lines.slice(0, 3).join(', ')}`);
  section('🔴 Дубликаты ID', htmlAnalysis.ids, i => `#${i.id} — ${i.lines.join(', ')}`);
  section('⚠ Inline display:none', htmlAnalysis.inlineStyles, s => `строка ${s.line}: \`${s.style.slice(0, 60)}\``);

  const clean = missing.length === 0 && forbiddenAll.length === 0 &&
    dupWithin.length === 0 && undefinedVars.size === 0 && kfMissing.length === 0 &&
    notImported.length === 0 && orderIssues.length === 0 &&
    htmlAnalysis.classes.length === 0 && htmlAnalysis.ids.length === 0;

  push('## Итог', '', clean ? '✅ **Чисто**' : '❌ **Есть находки**', '');
  fs.writeFileSync(OUT_MD, md.join('\n'), 'utf8');
  console.log(md.join('\n'));
  console.log(`\nОтчёт: ${OUT_MD}`);
  process.exit(clean ? 0 : 1);
}

main();