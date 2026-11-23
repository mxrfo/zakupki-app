const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const INPUT_HTML = 'src/index.html';
const OUTPUT_HTML = 'dist/index.html';
const CSS_FILE = 'src/css/styles.css';

const now = new Date();
const timestamp = now.getFullYear() +
  String(now.getMonth() + 1).padStart(2, '0') +
  String(now.getDate()).padStart(2, '0') + '_' +
  String(now.getHours()).padStart(2, '0') +
  String(now.getMinutes()).padStart(2, '0') +
  String(now.getSeconds()).padStart(2, '0');

const ZIP_OUTPUT = `dist/releases/app_${timestamp}.zip`;

const JS_FILES_ORDER = [
  'src/js/core/config.js',
  'src/js/core/state.js',
  'src/js/core/utils.js',
  'src/js/api/bot.js',
  'src/js/api/api.js',
  'src/js/api/cache.js',
  'src/js/logic/roles.js',
  'src/js/ui/dragdrop.js',
  'src/js/ui/render.js',
  'src/js/ui/modals.js',
  'src/js/ui/parsers/parsers/link-parser.js',
  'src/js/ui/forms.js',
  'src/js/logic/actions.js',
  'src/js/logic/settings.js',
  'src/js/core/init.js'
];

const BUILD_ID_FILE = 'src/js/core/config.js';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function injectBuildId(content, buildId) {
  const re = /let\s+APP_BUILD_ID\s*=\s*'[^']*'\s*;/;
  if (!re.test(content)) {
    console.warn('⚠️  В ' + BUILD_ID_FILE + ' не найден маркер APP_BUILD_ID');
    return content;
  }
  return content.replace(re, "let APP_BUILD_ID = '" + buildId + "';");
}

function build() {
  console.log('🔨 Начинаю сборку...\n');

  let css = '';
  if (fs.existsSync(CSS_FILE)) {
    css = fs.readFileSync(CSS_FILE, 'utf8');
    console.log('✅ CSS загружен: ' + CSS_FILE + ' (' + (css.length / 1024).toFixed(1) + ' КБ)');
  }

  let js = '';
  JS_FILES_ORDER.forEach(file => {
    if (fs.existsSync(file)) {
      let content = fs.readFileSync(file, 'utf8');
      if (file === BUILD_ID_FILE) {
        content = injectBuildId(content, timestamp);
        console.log('🏷️  APP_BUILD_ID подставлен: ' + timestamp);
      }
      js += '\n\n// ============================================================\n';
      js += '// МОДУЛЬ: ' + path.basename(file) + '\n';
      js += '// ============================================================\n\n';
      js += content;
      console.log('✅ JS модуль: ' + file + ' (' + (content.length / 1024).toFixed(1) + ' КБ)');
    } else {
      console.error('❌ НЕ НАЙДЕН: ' + file);
    }
  });

  if (!fs.existsSync(INPUT_HTML)) {
    console.error('❌ HTML файл не найден: ' + INPUT_HTML);
    process.exit(1);
  }
  let html = fs.readFileSync(INPUT_HTML, 'utf8');

  html = html.replace(/<link\s+[^>]*href=["']css\/styles\.css["'][^>]*\/?>/gi, '<style>\n' + css + '\n</style>');
  html = html.replace(/<script\s+src=["']js\/[^"']+["'][^>]*><\/script>/gi, '');
  html = html.replace('</body>', '<script>\n' + js + '\n</script>\n</body>');

  ensureDir('dist');
  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');

  const totalSize = (html.length / 1024).toFixed(1);
  console.log('\n🎉 Сборка HTML завершена!');
  console.log('📦 Результат: ' + OUTPUT_HTML + ' (' + totalSize + ' КБ)');

  console.log('\n🗜️  Начинаю создание ZIP-архива...');
  ensureDir('dist/releases');

  const output = fs.createWriteStream(ZIP_OUTPUT);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', function() {
    console.log('✅ ZIP-архив успешно создан: ' + ZIP_OUTPUT + ' (' + (archive.pointer() / 1024).toFixed(1) + ' КБ)');
    console.log('🚀 Готов к загрузке в Битрикс24!');
  });

  archive.on('error', function(err) {
    console.error('❌ Ошибка создания ZIP-архива: ' + err.message);
  });

  archive.pipe(output);
  archive.file(OUTPUT_HTML, { name: 'index.html' });
  archive.finalize();
}

build();