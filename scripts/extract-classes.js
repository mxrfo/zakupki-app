const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const INPUT_HTML = path.join(ROOT_DIR, 'dist', 'index.html');
const OUTPUT_FILE = path.join(ROOT_DIR, 'used-classes.txt');

if (!fs.existsSync(INPUT_HTML)) {
  console.error('❌ Файл dist/index.html не найден!');
  process.exit(1);
}

const content = fs.readFileSync(INPUT_HTML, 'utf8');
const classes = new Set();

// 1. Классы из HTML-атрибутов: class="foo bar"
const htmlClassRegex = /\bclass\s*=\s*["']([^"'`${}]+)["']/gi;
let match;
while ((match = htmlClassRegex.exec(content)) !== null) {
  const raw = match[1];
  raw.split(/\s+/).forEach(cls => {
    if (cls && /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(cls)) {
      classes.add(cls);
    }
  });
}

// 2. Классы из classList.add / remove / toggle / contains
const classListRegex = /\.classList\.(?:add|remove|toggle|contains)\(([^)]+)\)/g;
while ((match = classListRegex.exec(content)) !== null) {
  const args = match[1].match(/["']([a-zA-Z_-][a-zA-Z0-9_-]*)["']/g);
  if (args) {
    args.forEach(arg => classes.add(arg.replace(/["']/g, '')));
  }
}

// 3. Классы из el.className = 'foo bar'
const classNameRegex = /\.className\s*=\s*["']([^"'`${}]+)["']/g;
while ((match = classNameRegex.exec(content)) !== null) {
  const raw = match[1];
  raw.split(/\s+/).forEach(cls => {
    if (cls && /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(cls)) {
      classes.add(cls);
    }
  });
}

// 4. Классы из CSS внутри <style>
const cssClasses = new Set();
const styleBlocks = content.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
const cssSelectorRegex = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)(?=[\s,{:.#\[>+~)])/g;
styleBlocks.forEach(block => {
  let m;
  while ((m = cssSelectorRegex.exec(block)) !== null) {
    cssClasses.add(m[1]);
  }
});

const sortedUsed = Array.from(classes).sort();
const unusedInCss = Array.from(cssClasses).filter(c => !classes.has(c)).sort();

const report = [
  `=== НАЙДЕНО КЛАССОВ В HTML И JS (${sortedUsed.length}) ===`,
  sortedUsed.join('\n'),
  '',
  `=== КЛАССЫ В CSS, КОТОРЫЕ НЕ НАЙДЕНЫ В СТАТИЧЕСКОМ HTML/JS (${unusedInCss.length}) ===`,
  '(Внимание: часть из них может собираться динамически через шаблонные строки)',
  unusedInCss.join('\n')
].join('\n');

fs.writeFileSync(OUTPUT_FILE, report, 'utf8');
console.log(`✅ Готово! Прочитан: ${INPUT_HTML}`);
console.log(`📊 Найдено ${sortedUsed.length} классов в разметке/JS и ${unusedInCss.length} потенциально неиспользуемых в CSS.`);
console.log(`📄 Результат сохранён в: ${OUTPUT_FILE}`);
