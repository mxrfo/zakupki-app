#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const [, , inputFile, chunkSizeArg] = process.argv;
const chunkSize = Number.parseInt(chunkSizeArg || '1500', 10);

if (!inputFile) {
  console.error('Использование: node split-file.js <путь_к_файлу> [строк_в_части]');
  process.exit(1);
}

if (!Number.isFinite(chunkSize) || chunkSize < 1) {
  console.error('Ошибка: количество строк в части должно быть положительным числом.');
  process.exit(1);
}

const resolvedInput = path.resolve(inputFile);
if (!fs.existsSync(resolvedInput)) {
  console.error(`Файл не найден: ${resolvedInput}`);
  process.exit(1);
}

const rawText = fs.readFileSync(resolvedInput, 'utf8');
const lines = rawText.split(/\r?\n/);
const totalLines = lines.length;
const totalParts = Math.ceil(totalLines / chunkSize);
const padWidth = String(totalParts).length;

const baseName = path.basename(resolvedInput, path.extname(resolvedInput));
const outDir = path.join(path.dirname(resolvedInput), `${baseName}_chunks`);
fs.mkdirSync(outDir, { recursive: true });

for (let i = 0; i < totalParts; i++) {
  const startIdx = i * chunkSize;
  const endIdx = Math.min(startIdx + chunkSize, totalLines);
  const partStr = String(i + 1).padStart(padWidth, '0');
  const totalStr = String(totalParts).padStart(padWidth, '0');

  const header =
    `/* === ЧАСТЬ ${i + 1} из ${totalParts} | Файл: ${path.basename(resolvedInput)} | Строки: ${startIdx + 1}-${endIdx} из ${totalLines} === */\n`;
  const content = header + lines.slice(startIdx, endIdx).join('\n') + '\n';
  const outName = `${baseName}.part${partStr}of${totalStr}.txt`;

  fs.writeFileSync(path.join(outDir, outName), content, 'utf8');
}

console.log(`Готово! Строк: ${totalLines}, частей: ${totalParts}`);
console.log(`Файлы сохранены в: ${outDir}`);