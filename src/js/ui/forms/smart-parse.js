// js/ui/forms/smart-parse.js — Умный парсинг строки и вставка из Excel/Word

function smartParseItemLine(input) {
  const raw = input.value.trim();
  if (!raw) return;
  let name = raw;
  const qtyMatch = raw.match(/(\d+)\s*(шт\.?|ед\.?|упак\.?|коробк|компл\.?)/i);
  const priceMatch = raw.match(/(?:по\s*)?(\d[\d\s]*[.,]?\d*)\s*(?:р\.?|руб\.?|₽)/i);
  if (qtyMatch) {
    const cur = input.closest('.pos-card').querySelector('.det-qty');
    if (!cur.value) cur.value = qtyMatch[1];
    name = name.replace(qtyMatch[0], '').trim();
  }
  if (priceMatch) {
    const cur = input.closest('.pos-card').querySelector('.det-price');
    if (!cur.value) cur.value = priceMatch[1].replace(/\s/g, '').replace(',', '.');
    name = name.replace(priceMatch[0], '').trim();
  }
  name = name.replace(/\s{2,}/g, ' ').replace(/[,\s]+$/g, '').trim();
  if (name) input.value = name;
  calculateRowTotal(input);
  maybeAutoFillShortDesc();
}

function maybeAutoFillShortDesc() {
  const sd = document.getElementById('create-short-desc');
  if (!sd) return;
  const names = Array.from(document.querySelectorAll('.pos-card .det-name')).map(function (i) { return i.value.trim(); }).filter(Boolean);
  if (!names.length) return;
  const auto = names[0] + (names.length > 1 ? ' и ещё ' + (names.length - 1) + ' поз.' : '');
  if (!sd.value.trim() || sd.dataset.autofilled === '1') {
    sd.value = auto;
    sd.dataset.autofilled = '1';
  }
}

function handleItemsPaste(e) {
  const input = e.target.closest('.det-name');
  if (!input) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (!text) return;
  const lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  const hasTabs = /\t/.test(text);
  const multiLine = lines.length > 1;
  if (!hasTabs && !multiLine) return;
  e.preventDefault();
  const container = document.getElementById('purchase-items-container');
  const emptyCard = container.querySelector('.pos-card:not(.filled)');
  lines.forEach(function (line, idx) {
    const cols = line.split(/\t/).map(function (c) { return c.trim(); });
    let target;
    if (idx === 0 && emptyCard) { target = emptyCard; }
    else { addDetailRow(); target = container.querySelector('.pos-card:last-child'); }
    target.classList.add('filled');
    if (cols.length >= 3) {
      target.querySelector('.det-name').value = cols[0];
      target.querySelector('.det-price').value = (cols[1] || '').replace(/[^\d.,]/g, '').replace(',', '.');
      target.querySelector('.det-qty').value = (cols[2] || '').replace(/[^\d]/g, '');
    } else if (cols.length === 2) {
      target.querySelector('.det-name').value = cols[0];
      target.querySelector('.det-qty').value = (cols[1] || '').replace(/[^\d]/g, '');
    } else {
      target.querySelector('.det-name').value = cols[0];
    }
    onDetNameInput(target.querySelector('.det-name'));
  });
  showToast('Добавлено позиций: ' + lines.length, 'success');
}

window.smartParseItemLine = smartParseItemLine;
window.maybeAutoFillShortDesc = maybeAutoFillShortDesc;
window.handleItemsPaste = handleItemsPaste;