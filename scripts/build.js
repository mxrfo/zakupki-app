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
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');

const ZIP_OUTPUT = `dist/releases/app_${timestamp}.zip`;

// Стабильный id сборки = git sha. Меняется ТОЛЬКО при реальном изменении кода,
// а не на каждой сборке -> md5 архива (и папка app_local/<hash>) перестаёт «прыгать».
let buildId;
try { 
    buildId = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); 
} catch (e) { 
    buildId = 'dev'; 
}
const FIXED_ENTRY_DATE = new Date('2000-01-01T00:00:00Z'); // детерминированные даты в zip

const JS_FILES_ORDER = [
    'src/js/core/config.js',
    'src/js/core/state.js',
    'src/js/core/utils.js',
    'src/js/core/product-name-normalizer.js',
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

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

// ============================================================
// ОБНОВЛЕНИЕ BUILD ID
// ============================================================
function injectBuildId(content, buildId) {
    const re = /\blet\s+APP_BUILD_ID\s*=\s*(['"])[^'"]*\1\s*;/;
    if (!re.test(content)) {
        console.warn(`⚠️ В ${BUILD_ID_FILE} не найден маркер APP_BUILD_ID`);
        return content;
    }
    return content.replace(re, `let APP_BUILD_ID = '${buildId}';`);
}

// ============================================================
// СБОРКА ТРАНСЛИТЕРАТОРА
// ============================================================
async function buildTransliterator() {
    const result = await esbuild.build({
        stdin: {
            contents: `
                const ImportedCyrillicToTranslit = require('cyrillic-to-translit-js');
                const CyrillicToTranslit = ImportedCyrillicToTranslit.default || ImportedCyrillicToTranslit;
                window.CyrillicToTranslit = CyrillicToTranslit;
            `,
            resolveDir: process.cwd(),
            sourcefile: 'transliterator-entry.js',
            loader: 'js'
        },
        bundle: true,
        platform: 'browser',
        format: 'iife',
        target: ['es2018'],
        minify: true,
        write: false
    });

    if (!result.outputFiles || !result.outputFiles.length) {
        throw new Error('Не удалось собрать библиотеку транслитерации.');
    }
    console.log('✅ Библиотека cyrillic-to-translit-js собрана');
    return result.outputFiles[0].text;
}

// ============================================================
// СБОРКА HUNSPELL И РУССКОГО СЛОВАРЯ (ОТДЕЛЬНЫЙ ФАЙЛ)
// ============================================================
async function buildRussianSpellCheckerSeparate() {
    const dictionaryPath = path.join(process.cwd(), 'node_modules', 'dictionary-ru');
    const affPath = path.join(dictionaryPath, 'index.aff');
    const dicPath = path.join(dictionaryPath, 'index.dic');

    if (!fs.existsSync(affPath) || !fs.existsSync(dicPath)) {
        console.warn('⚠️ Файлы русского словаря Hunspell не найдены. Проверка орфографии будет отключена (это нормально для ускорения загрузки).');
        return false;
    }

    console.log('📖 Читаю русский словарь Hunspell для отдельной сборки...');
    const aff = fs.readFileSync(affPath, 'utf8');
    const dic = fs.readFileSync(dicPath, 'utf8');

    const contents = `
import nspell from 'nspell';
const spell = nspell({
    aff: ${JSON.stringify(aff)},
    dic: ${JSON.stringify(dic)}
});
window.RussianSpellChecker = {
    correct(word) {
        try {
            const normalizedWord = String(word).toLowerCase().trim();
            if (!normalizedWord) return false;
            return spell.correct(normalizedWord);
        } catch (error) {
            console.warn('[RussianSpellChecker] Ошибка проверки:', word, error);
            return false;
        }
    }
};
`;

    const result = await esbuild.build({
        stdin: {
            contents,
            resolveDir: process.cwd(),
            sourcefile: 'russian-spell-checker-entry.js',
            loader: 'js'
        },
        bundle: true,
        platform: 'browser',
        format: 'iife',
        target: ['es2018'],
        minify: true,
        write: false
    });

    if (!result.outputFiles || !result.outputFiles.length) {
        throw new Error('Не удалось собрать русский словарь Hunspell.');
    }

    const spellCheckerCode = result.outputFiles[0].text;
    const spellCheckerPath = path.join(process.cwd(), 'dist', 'spellchecker.js');
    fs.writeFileSync(spellCheckerPath, spellCheckerCode, 'utf8');
    console.log(`✅ Русский словарь Hunspell собран в отдельный файл: dist/spellchecker.js (${(spellCheckerCode.length / 1024).toFixed(1)} КБ)`);
    return true;
}

// ============================================================
// ВСТРАИВАНИЕ CSS
// ============================================================
function replaceCssLink(html, css) {
    const cssLinkPattern = /<link\b(?=[^>]*\bhref\s*=\s*["'][^"']*styles\.css(?:\?[^"']*)?["'])[^>]*>/i;
    if (!cssLinkPattern.test(html)) {
        console.warn('⚠️ Ссылка на styles.css в HTML не найдена');
        return html;
    }
    return html.replace(cssLinkPattern, `<style>\n${css}\n</style>`);
}

// ============================================================
// УДАЛЕНИЕ ПОДКЛЮЧЕНИЙ ИСХОДНЫХ JS-ФАЙЛОВ
// ============================================================
function removeSourceJsScripts(html) {
    const sourceScriptPattern = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi;
    return html.replace(sourceScriptPattern, '');
}

// ============================================================
// ВСТРАИВАНИЕ ОБЪЕДИНЁННОГО JAVASCRIPT
// ============================================================
function injectApplicationJs(html, js) {
    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `<script>\n${js}\n</script>\n</body>`);
    }
    throw new Error('В src/index.html не найден закрывающий тег </body>');
}

// ============================================================
// СОЗДАНИЕ ZIP-АРХИВА
// ============================================================
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
            if (error.code === 'ENOENT') {
                console.warn('⚠️ Предупреждение архива:', error.message);
            } else {
                reject(error);
            }
        });
        archive.on('error', reject);
        archive.pipe(output);

        // Фиксируем дату создания файлов в архиве, чтобы md5 хеш архива не менялся без изменения кода
        archive.file(OUTPUT_HTML, { name: 'index.html', date: FIXED_ENTRY_DATE });
        
        const spellCheckerPath = path.join(process.cwd(), 'dist', 'spellchecker.js');
        if (fs.existsSync(spellCheckerPath)) {
            archive.file(spellCheckerPath, { name: 'spellchecker.js', date: FIXED_ENTRY_DATE });
        }

        archive.finalize().catch(reject);
    });
}

// ============================================================
// ОСНОВНАЯ СБОРКА ПРИЛОЖЕНИЯ
// ============================================================
async function build() {
    console.log('🔨 Начинаю сборку...\n');
    ensureDir('dist');

    if (!fs.existsSync(INPUT_HTML)) {
        throw new Error(`HTML-файл не найден: ${INPUT_HTML}`);
    }

    // 1. Загружаем CSS
    let css = '';
    if (fs.existsSync(CSS_FILE)) {
        css = fs.readFileSync(CSS_FILE, 'utf8');
        console.log(`✅ CSS загружен: ${CSS_FILE} (${(css.length / 1024).toFixed(1)} КБ)`);
    } else {
        console.warn(`⚠️ CSS-файл не найден: ${CSS_FILE}`);
    }

    // 2. Собираем транслитератор
    const transliteratorBundle = await buildTransliterator();

    // 3. Собираем Hunspell в ОТДЕЛЬНЫЙ файл (не в основной бандл!)
    await buildRussianSpellCheckerSeparate();

    // 4. Объединяем библиотеки
    let js = '';
    js += '\n\n// ============================================================\n';
    js += '// БИБЛИОТЕКА: cyrillic-to-translit-js\n';
    js += '// ============================================================\n\n';
    js += transliteratorBundle;

    // 5. Объединяем JS-модули приложения
    for (const file of JS_FILES_ORDER) {
        if (!fs.existsSync(file)) {
            throw new Error(`Обязательный JS-файл не найден: ${file}`);
        }
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

    // 6. Загружаем HTML
    let html = fs.readFileSync(INPUT_HTML, 'utf8');

    // 7. Встраиваем CSS
    html = replaceCssLink(html, css);

    // 8. Удаляем отдельные подключения исходных JS
    html = removeSourceJsScripts(html);

    // 9. Встраиваем объединённый JavaScript
    html = injectApplicationJs(html, js);

    // 10. Записываем HTML
    fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
    console.log('\n🎉 Сборка HTML завершена!');
    console.log(`📦 Результат: ${OUTPUT_HTML} (${(html.length / 1024).toFixed(1)} КБ)`);

    // 11. Создаём ZIP
    console.log('\n🗜️ Начинаю создание ZIP-архива...');
    await createZip();
    console.log('\n🚀 Приложение готово к загрузке в Битрикс24!');
}

// ============================================================
// ЗАПУСК
// ============================================================
build().catch((error) => {
    console.error('\n❌ Ошибка сборки:', error);
    process.exitCode = 1;
});