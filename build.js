const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// === НАСТРОЙКИ ===
const INPUT_HTML = 'index.html';
const OUTPUT_HTML = 'dist/index.html';
const CSS_FILE = 'css/styles.css';
const ZIP_OUTPUT = 'dist/app.zip';

// ВАЖНО: порядок подключения скриптов!
// Зависимости: config → state → utils → bot → api → cache → roles → dragdrop → render → modals → forms → actions → settings → init
const JS_FILES_ORDER = [
  'js/config.js',
  'js/state.js',
  'js/utils.js',
  'js/bot.js',
  'js/api.js',
  'js/cache.js',
  'js/roles.js',
  'js/dragdrop.js',
  'js/render.js',
  'js/modals.js',
  'js/forms.js',
  'js/actions.js',
  'js/settings.js',
  'js/init.js'
];

// === ФУНКЦИИ ===
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function build() {
  console.log('🔨 Начинаю сборку...\n');

  // 1. Читаем CSS
  let css = '';
  if (fs.existsSync(CSS_FILE)) {
    css = fs.readFileSync(CSS_FILE, 'utf8');
    console.log('✅ CSS загружен: ' + CSS_FILE + ' (' + (css.length / 1024).toFixed(1) + ' КБ)');
  } else {
    console.warn('⚠️  CSS файл не найден: ' + CSS_FILE);
  }

  // 2. Читаем все JS файлы в правильном порядке
  let js = '';
  JS_FILES_ORDER.forEach(file => {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      js += '\n\n// ============================================================\n';
      js += '// МОДУЛЬ: ' + path.basename(file) + '\n';
      js += '// ============================================================\n\n';
      js += content;
      console.log('✅ JS модуль: ' + file + ' (' + (content.length / 1024).toFixed(1) + ' КБ)');
    } else {
      console.error('❌ НЕ НАЙДЕН: ' + file);
    }
  });

  // 3. Читаем HTML
  if (!fs.existsSync(INPUT_HTML)) {
    console.error('❌ HTML файл не найден: ' + INPUT_HTML);
    process.exit(1);
  }
  let html = fs.readFileSync(INPUT_HTML, 'utf8');

  // 4. Заменяем подключение CSS на inline <style>
  // Поддержка разных форматов: <link>, <link />, самозакрывающиеся теги
  html = html.replace(
    /<link\s+[^>]*href=["']css\/styles\.css["'][^>]*\/?>/gi,
    '<style>\n' + css + '\n</style>'
  );

  // 5. Удаляем все <script src="js/..."> теги
  html = html.replace(/<script\s+src=["']js\/[^"']+["'][^>]*><\/script>/gi, '');

  // 6. Вставляем объединённый JS перед </body>
  html = html.replace(
    '</body>',
    '<script>\n' + js + '\n</script>\n</body>'
  );

  // 7. Сохраняем результат HTML
  ensureDir('dist');
  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');

  const totalSize = (html.length / 1024).toFixed(1);
  console.log('\n🎉 Сборка HTML завершена!');
  console.log('📦 Результат: ' + OUTPUT_HTML + ' (' + totalSize + ' КБ)');
  console.log('\n📊 Статистика:');
  console.log('   HTML: ' + (html.length / 1024).toFixed(1) + ' КБ');
  console.log('   CSS:  ' + (css.length / 1024).toFixed(1) + ' КБ');
  console.log('   JS:   ' + (js.length / 1024).toFixed(1) + ' КБ');

  // 8. Создаем ZIP-архив для загрузки в Битрикс24
  console.log('\n🗜️  Начинаю создание ZIP-архива для Битрикс24...');
  const output = fs.createWriteStream(ZIP_OUTPUT);
  const archive = archiver('zip', {
    zlib: { level: 9 } // Максимальное сжатие
  });

  output.on('close', function() {
    console.log('✅ ZIP-архив успешно создан: ' + ZIP_OUTPUT + ' (' + (archive.pointer() / 1024).toFixed(1) + ' КБ)');
    console.log('🚀 Готов к загрузке в раздел "Локальные приложения" Битрикс24!');
  });

  archive.on('error', function(err) {
    console.error('❌ Ошибка создания ZIP-архива: ' + err.message);
  });

  archive.pipe(output);
  
  // Добавляем файл index.html в корень архива строго под именем index.html
  archive.file(OUTPUT_HTML, { name: 'index.html' });
  
  // Примечание: если в будущем в папке dist появятся другие файлы (например, иконки),
  // можно раскомментировать строку ниже, чтобы добавить всю папку целиком:
  // archive.directory('dist/', false);

  archive.finalize();
}

build();