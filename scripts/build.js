const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const esbuild = require('esbuild');
const { execSync } = require('child_process');

const INPUT_HTML = 'src/index.html';
const OUTPUT_HTML = 'dist/index.html';
const CSS_FILE = 'src/css/styles.css';

const now = new Date();
const timestamp =
  now.getFullYear() +
  String(now.getMonth() + 1).padStart(2, '0') +
  String(now.getDate()).padStart(2, '0') +
  '_' +
  String(now.getHours()).padStart(2, '0') +
  String(now.getMinutes()).padStart(2, '0') +
  String(now.getSeconds()).padStart(2, '0');

const ZIP_OUTPUT = `dist/releases/app_${timestamp}.zip`;

let buildId;
try {
  buildId = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  buildId = 'dev';
}
const FIXED_ENTRY_DATE = new Date('2000-01-01T00:00:00Z');

const JS_FILES_ORDER = [
  'src/js/core/config.js',
  'src/js/core/state.js',
  'src/js/core/utils.js',
  // bot.js ДО api-модулей: они вызывают notifyUserViaBot / notifyGroupStatus
  'src/js/api/bot.js',
  // API core (утилиты, от которых зависят все остальные)
  'src/js/api/core.js',
  // API модули
  'src/js/api/notifications.js',
  'src/js/api/group-status.js',
  'src/js/api/absence.js',
  'src/js/api/delegate.js',
  'src/js/api/scenarios.js',
  'src/js/api/sync.js',
  'src/js/api/url-handler.js',
  // API cache
  'src/js/api/cache.js',
  // Логика и UI
  'src/js/logic/roles.js',
  'src/js/ui/dragdrop.js',
  'src/js/ui/render.js',
  // Модалки (не зависят от forms)
  'src/js/ui/modals/core.js',
  'src/js/ui/modals/view.js',
  'src/js/ui/modals/action.js',
  'src/js/ui/modals/delegate.js',
  'src/js/ui/modals/executor.js',
  // Парсеры
  'src/js/ui/parsers/parsers/link-parser.js',
  'src/js/ui/parsers/parsers/ai-parser.js',
  // Forms
  'src/js/ui/forms/smart-parse.js',
  'src/js/ui/forms/suggestions.js',
  'src/js/ui/forms/positions.js',
  'src/js/ui/forms/wizard.js',
  'src/js/ui/forms/submit.js',
  // Модалки, зависящие от forms
  'src/js/ui/modals/data.js',
  'src/js/ui/modals/upload.js',
  'src/js/ui/modals/edit-amount.js',
  'src/js/ui/modals/past.js',
  // Логика и инициализация
  'src/js/logic/actions.js',
  'src/js/logic/settings.js',
  'src/js/core/init.js',
];

const BUILD_ID_FILE = 'src/js/core/config.js';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function injectBuildId(content, buildId) {
  const re = /\blet\s+APP_BUILD_ID\s*=\s*(['"])[^'"]*\1\s*;/;
  if (!re.test(content)) {
    console.warn(`⚠️ В ${BUILD_ID_FILE} не найден маркер APP_BUILD_ID`);
    return content;
  }
  return content.replace(re, `let APP_BUILD_ID = '${buildId}';`);
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

async function createZip() {
  ensureDir(path.dirname(ZIP_OUTPUT));
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
  ensureDir('dist');

  if (!fs.existsSync(INPUT_HTML)) throw new Error(`HTML-файл не найден: ${INPUT_HTML}`);

  let css = '';
  if (fs.existsSync(CSS_FILE)) {
    css = fs.readFileSync(CSS_FILE, 'utf8');
    console.log(`✅ CSS загружен: ${CSS_FILE} (${(css.length / 1024).toFixed(1)} КБ)`);
  } else {
    console.warn(`⚠️ CSS-файл не найден: ${CSS_FILE}`);
  }

  let js = '';

  for (const file of JS_FILES_ORDER) {
    if (!fs.existsSync(file)) throw new Error(`Обязательный JS-файл не найден: ${file}`);
    let content = fs.readFileSync(file, 'utf8');
    if (file === BUILD_ID_FILE) {
      content = injectBuildId(content, buildId);
      console.log(`🏷️ APP_BUILD_ID: ${buildId}`);
    }
    js += '\n\n// ============================================================\n';
    js += `// МОДУЛЬ: ${path.basename(file)}\n`;
    js += '// ============================================================\n\n';
    js += content;
    console.log(`✅ JS модуль: ${file} (${(content.length / 1024).toFixed(1)} КБ)`);
  }

  let html = fs.readFileSync(INPUT_HTML, 'utf8');
  html = replaceCssLink(html, css);
  html = removeSourceJsScripts(html);
  html = injectApplicationJs(html, js);

  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
  console.log('\n🎉 Сборка HTML завершена!');
  console.log(`📦 Результат: ${OUTPUT_HTML} (${(html.length / 1024).toFixed(1)} КБ)`);

  console.log('\n🗜️ Начинаю создание ZIP-архива...');
  await createZip();
  console.log('\n🚀 Приложение готово к загрузке в Битрикс24!');
}

build().catch((error) => {
  console.error('\n❌ Ошибка сборки:', error);
  process.exitCode = 1;
});