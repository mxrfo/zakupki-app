#!/usr/bin/env node
/* ============================================================
   СБОРКА — Альтернатива · Закупки v7
   Инлайнит CSS (@import) и JS в dist/index.html, создаёт ZIP.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const INPUT_HTML = path.join(ROOT, 'src', 'index.html');
const OUTPUT_HTML = path.join(ROOT, 'dist', 'index.html');
const CSS_FILE = path.join(ROOT, 'src', 'css', 'styles.css');
const ZIP_OUTPUT_DIR = path.join(ROOT, 'dist', 'releases');

const now = new Date();
const timestamp =
  now.getFullYear() +
  String(now.getMonth() + 1).padStart(2, '0') +
  String(now.getDate()).padStart(2, '0') +
  '_' +
  String(now.getHours()).padStart(2, '0') +
  String(now.getMinutes()).padStart(2, '0') +
  String(now.getSeconds()).padStart(2, '0');
const ZIP_OUTPUT = path.join(ZIP_OUTPUT_DIR, `app_${timestamp}.zip`);

const FIXED_ENTRY_DATE = new Date('2000-01-01T00:00:00Z');

// Порядок подключения JS-модулей (зависимости сверху вниз)
const JS_FILES_ORDER = [
  'src/js/core/config.js',
  'src/js/core/state.js',
  'src/js/core/utils.js',
  'src/js/api/bot.js',
  'src/js/api/core.js',
  'src/js/api/notifications.js',
  'src/js/api/group-status.js',
  'src/js/api/absence.js',
  'src/js/api/delegate.js',
  'src/js/api/scenarios.js',
  'src/js/api/sync.js',
  'src/js/api/url-handler.js',
  'src/js/api/cache.js',
  'src/js/logic/roles.js',
  'src/js/ui/dragdrop.js',
  'src/js/ui/render.js',
  'src/js/ui/modals/core.js',
  'src/js/ui/modals/view.js',
  'src/js/ui/modals/action.js',
  'src/js/ui/modals/delegate.js',
  'src/js/ui/modals/executor.js',
  'src/js/ui/parsers/link-parser.js',
  'src/js/ui/parsers/ai-parser.js',
  'src/js/ui/forms/smart-parse.js',
  'src/js/ui/forms/suggestions.js',
  'src/js/ui/forms/positions.js',
  'src/js/ui/forms/wizard.js',
  'src/js/ui/forms/submit.js',
  'src/js/ui/modals/data.js',
  'src/js/ui/modals/upload.js',
  'src/js/ui/modals/edit-amount.js',
  'src/js/ui/modals/past.js',
  'src/js/logic/settings/core.js',
  'src/js/logic/settings/roles.js',
  'src/js/logic/settings/crm.js',
  'src/js/logic/settings/deps.js',
  'src/js/logic/settings/absence.js',
  'src/js/logic/settings/bot.js',
  'src/js/logic/actions.js',
  'src/js/core/init.js',
];

const BUILD_ID_FILE = 'src/js/core/config.js';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getBuildId() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: ROOT }).trim();
  } catch (e) {
    return 'dev';
  }
}

function injectBuildId(content, buildId) {
  const re = /\blet\s+APP_BUILD_ID\s*=\s*(['"])[^'"]*\1\s*;/;
  if (!re.test(content)) {
    console.warn(`⚠️ В ${BUILD_ID_FILE} не найден маркер APP_BUILD_ID`);
    return content;
  }
  return content.replace(re, `let APP_BUILD_ID = '${buildId}';`);
}

/**
 * Рекурсивно разворачивает все @import в CSS-файле.
 */
function inlineCssImports(filePath, visited = new Set()) {
  const resolved = path.resolve(filePath);
  if (visited.has(resolved)) {
    console.warn(`⚠️ Циклический импорт CSS: ${filePath}`);
    return '';
  }
  visited.add(resolved);

  if (!fs.existsSync(resolved)) {
    console.warn(`⚠️ CSS-файл не найден: ${filePath}`);
    return `/* MISSING: ${filePath} */`;
  }

  let content = fs.readFileSync(resolved, 'utf8');
  const dir = path.dirname(resolved);

  const importRe = /@import\s+(?:url\()?\s*(['"])([^'"]+)\1\s*\)?\s*;/g;

  content = content.replace(importRe, (match, quote, importPath) => {
    if (/^(https?:)?\/\//i.test(importPath)) return match;
    const importFile = path.resolve(dir, importPath);
    const inlined = inlineCssImports(importFile, visited);
    return `\n/* ===== BEGIN ${importPath} ===== */\n${inlined}\n/* ===== END ${importPath} ===== */\n`;
  });

  return content;
}

function replaceCssLink(html, css) {
  const cssLinkPattern = /<link\b(?=[^>]*\bhref\s*=\s*["'][^"']*styles\.css(?:\?[^"']*)?["'])[^>]*>/i;
  if (!cssLinkPattern.test(html)) {
    console.warn('⚠️ Ссылка на styles.css в HTML не найдена');
    return html;
  }
  return html.replace(cssLinkPattern, `<style>\n${css}\n</style>`);
}

function removeSourceJsScripts(html) {
  const sourceScriptPattern = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi;
  return html.replace(sourceScriptPattern, '');
}

function injectApplicationJs(html, js) {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `<script>\n${js}\n</script>\n</body>`);
  }
  throw new Error('В src/index.html не найден закрывающий тег </body>');
}

function createZip() {
  ensureDir(ZIP_OUTPUT_DIR);
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(ZIP_OUTPUT);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`✅ ZIP-архив создан: ${ZIP_OUTPUT} (${(archive.pointer() / 1024).toFixed(1)} КБ)`);
      resolve();
    });
    output.on('error', reject);
    archive.on('warning', (error) => {
      if (error.code === 'ENOENT') console.warn('⚠️ Предупреждение архива:', error.message);
      else reject(error);
    });
    archive.on('error', reject);
    archive.pipe(output);

    archive.file(OUTPUT_HTML, { name: 'index.html', date: FIXED_ENTRY_DATE });
    archive.finalize().catch(reject);
  });
}

async function build() {
  console.log('🔨 Начинаю сборку...\n');
  ensureDir(path.dirname(OUTPUT_HTML));

  if (!fs.existsSync(INPUT_HTML)) throw new Error(`HTML-файл не найден: ${INPUT_HTML}`);

  const buildId = getBuildId();
  console.log(`🏷️ APP_BUILD_ID: ${buildId}`);

  // CSS
  let css = '';
  if (fs.existsSync(CSS_FILE)) {
    css = inlineCssImports(CSS_FILE);
    console.log(`✅ CSS собран с инлайновыми @import: ${CSS_FILE} (${(css.length / 1024).toFixed(1)} КБ)`);
  } else {
    console.warn(`⚠️ CSS-файл не найден: ${CSS_FILE}`);
  }

  // JS
  let js = '';
  for (const file of JS_FILES_ORDER) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) throw new Error(`Обязательный JS-файл не найден: ${file}`);
    let content = fs.readFileSync(fullPath, 'utf8');
    if (file === BUILD_ID_FILE) {
      content = injectBuildId(content, buildId);
    }
    js += '\n\n// ============================================================\n';
    js += `// МОДУЛЬ: ${path.basename(file)}\n`;
    js += '// ============================================================\n\n';
    js += content;
    console.log(`✅ JS модуль: ${file} (${(content.length / 1024).toFixed(1)} КБ)`);
  }

  // HTML
  let html = fs.readFileSync(INPUT_HTML, 'utf8');
  html = replaceCssLink(html, css);
  html = removeSourceJsScripts(html);
  html = injectApplicationJs(html, js);

  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
  console.log(`\n🎉 Сборка HTML завершена!`);
  console.log(`📦 Результат: ${OUTPUT_HTML} (${(html.length / 1024).toFixed(1)} КБ)`);

  // ZIP
  console.log('\n🗜️ Создаю ZIP-архив...');
  await createZip();
  console.log('\n🚀 Приложение готово к загрузке в Битрикс24!');
  console.log(`\n📋 Следующие шаги:`);
  console.log(`   1. npm run check          # линт + аудит CSS`);
  console.log(`   2. Откройте dist/index.html в браузере для проверки`);
  console.log(`   3. Загрузите ${ZIP_OUTPUT} в Битрикс24`);
}

build().catch((error) => {
  console.error('\n❌ Ошибка сборки:', error);
  process.exitCode = 1;
});