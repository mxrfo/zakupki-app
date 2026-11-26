// js/ui/forms/positions.js — Карточки позиций закупки

const ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
const ICON_AI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></svg>';

function renderEmptyState() {
  const container = document.getElementById('purchase-items-container');
  if (!container) return;
  if (container.querySelector('.pos-card')) {
    const es = container.querySelector('.pos-empty');
    if (es) es.remove();
    return;
  }
  if (container.querySelector('.pos-empty')) return;
  const div = document.createElement('div');
  div.className = 'pos-empty';
  div.innerHTML = '<b>Детализация необязательна</b>Можно сохранить запрос без позиций, либо добавить их вручную или «Выбрать из прошлых».';
  container.appendChild(div);
}

function removeDetailRow(btn) {
  const card = btn.closest('.pos-card');
  if (card) card.remove();
  updatePositionNumbers();
  calculateAllTotals();
  renderEmptyState();
  maybeAutoFillShortDesc();
}

function updatePositionNumbers() {
  document.querySelectorAll('#purchase-items-container .pos-card').forEach(function (card, idx) {
    const num = card.querySelector('.pos-num');
    if (num) num.textContent = 'Позиция ' + (idx + 1);
  });
}

function updateLinkBtnState(card) {
  if (!card) return;
  const linkEl = card.querySelector('.det-link') || card.querySelector('.data-det-link');
  const btn = card.querySelector('.btn-link-action');
  if (!btn) return;
  const has = linkEl && String(linkEl.value || '').trim();
  btn.classList.toggle('has-link', !!has);
  const txt = btn.querySelector('.bl-txt');
  if (txt) txt.textContent = has ? 'Изменить ссылку' : 'Добавить ссылку';
}

function addDetailRow(data) {
  data = data || {};
  const container = document.getElementById('purchase-items-container');
  const es = container.querySelector('.pos-empty');
  if (es) es.remove();

  const details = document.createElement('details');
  details.className = 'pos-card';
  details.open = true;

  const nameVal = data.name || '';
  const linkVal = data.link || '';
  const qtyVal = data.qty || '';
  const priceVal = data.price || '';
  const supplierVal = data.supplier || '';
  const articleVal = data.article || '';
  const purposeVal = data.purpose || '';
  const noteVal = data.note || '';

  const totalVal = (parseFloat(priceVal) * parseFloat(qtyVal)) || 0;
  const totalTxt = totalVal > 0 ? totalVal.toFixed(2) + ' ₽' : '0.00 ₽';

  const hasExtra = !!(supplierVal || articleVal || noteVal);

  const purposeChips = _topPurposes.length
    ? '<div class="chip-row"><span class="chip-hint">Частые варианты</span>' +
    _topPurposes.map(function (p) { return `<span class="chip" data-val="${escapeHtml(p)}" onclick="applyChip(this)">${escapeHtml(p)}</span>`; }).join('') + '</div>'
    : '';

  const supplierChips = _topSuppliers.length
    ? '<div class="chip-row"><span class="chip-hint">Частые поставщики</span>' +
    _topSuppliers.map(function (p) { return `<span class="chip" data-val="${escapeHtml(p)}" onclick="applyChip(this)">${escapeHtml(p)}</span>`; }).join('') + '</div>'
    : '';

  details.innerHTML = `
    <summary class="pos-head">
      <span class="pos-chev"></span>
      <span class="pos-num">Позиция</span>
      <span class="pos-preview ${nameVal ? '' : 'empty'}">${escapeHtml(nameVal || 'Без названия')}</span>
      <span class="pos-total">${totalTxt}</span>
      <button type="button" class="pos-del" title="Удалить позицию" onclick="event.preventDefault(); event.stopPropagation(); removeDetailRow(this);">&times;</button>
    </summary>
    <div class="pos-body">
      <div class="pos-main">
        <div class="form-group pg-name">
          <label>Наименование</label>
          <input type="text" class="det-name" value="${escapeHtml(nameVal)}" placeholder="Что закупаем"
            oninput="onDetNameInput(this)" onblur="smartParseItemLine(this); hideSuggestions();" onpaste="handleItemsPaste(event)">
        </div>
        <div class="form-group pg-purpose">
          <label>Цель использования</label>
          <input type="text" class="det-purpose" value="${escapeHtml(purposeVal)}" placeholder="">
          ${purposeChips}
        </div>
        <div class="form-group pg-price">
          <label>Цена с НДС</label>
          <div class="unit-input">
            <input type="number" class="det-price" step="0.01" placeholder="0.00" value="${escapeHtml(String(priceVal))}" oninput="calculateRowTotal(this)">
            <span class="unit">₽</span>
          </div>
        </div>
        <div class="form-group pg-qty">
          <label>Кол-во</label>
          <div class="unit-input">
            <input type="number" class="det-qty" step="1" placeholder="0" value="${escapeHtml(String(qtyVal))}" oninput="calculateRowTotal(this)">
            <span class="unit">шт.</span>
          </div>
        </div>
        <div class="pg-actions">
          <button type="button" class="btn-link-action ${linkVal ? 'has-link' : ''}" onclick="openAiParseModal(this)">
            <span class="bl-txt">${linkVal ? 'Изменить ссылку' : 'Добавить ссылку'}</span>
          </button>
          <button type="button" class="btn-icon-link" title="Открыть ссылку" data-url="${escapeHtml(linkVal)}" 
            onclick="openLink(this)" ${linkVal ? '' : 'disabled'}>${ICON_LINK}</button>
        </div>
        <input type="url" class="det-link link-hidden" value="${escapeHtml(linkVal)}">
      </div>
      <details class="pos-extra"${hasExtra ? ' open' : ''}>
        <summary>Дополнительно: поставщик, артикул, примечание</summary>
        <div class="pos-grid">
          <div class="form-group pg-supplier">
            <label>Поставщик</label>
            <input type="text" class="det-supplier" value="${escapeHtml(supplierVal)}" placeholder="Например: Ozon">
            ${supplierChips}
          </div>
          <div class="form-group pg-article">
            <label>Артикул</label>
            <input type="text" class="det-article" value="${escapeHtml(articleVal)}" placeholder="">
          </div>
          <div class="form-group pg-note">
            <label>Примечание</label>
            <input type="text" class="det-note" value="${escapeHtml(noteVal)}" placeholder="">
          </div>
        </div>
      </details>
    </div>`;

  container.appendChild(details);
  updatePositionNumbers();
  renderEmptyState();
}

function calculateRowTotal(input) {
  const card = input.closest('.pos-card');
  const price = parseFloat(card.querySelector('.det-price').value) || 0;
  const qty = parseFloat(card.querySelector('.det-qty').value) || 0;
  const total = price * qty;
  const txt = total > 0 ? total.toFixed(2) + ' ₽' : '0.00 ₽';
  const head = card.querySelector('.pos-total');
  if (head) head.textContent = txt;
  const readout = card.querySelector('.det-total');
  if (readout) readout.textContent = txt;
  calculateAllTotals();
}

function calculateAllTotals() {
  let sum = 0;
  document.querySelectorAll('.pos-card').forEach(function (card) {
    const price = parseFloat(card.querySelector('.det-price').value) || 0;
    const qty = parseFloat(card.querySelector('.det-qty').value) || 0;
    sum += price * qty;
  });
  const amountInput = document.getElementById('create-amount-product');
  amountInput.value = sum > 0 ? sum.toFixed(2) : '';
  updateHeaderSum();
  if (createStep === 3) renderCreateSummary();
}

function updateHeaderSum() {
  const el = document.getElementById('create-header-sum');
  if (!el) return;
  const sum = parseFloat(document.getElementById('create-amount-product').value) || 0;
  el.innerText = sum.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  el.classList.toggle('hidden', sum <= 0);
}

function addDataDetailRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input type="text" class="data-det-name"></td>` +
    `<td><input type="text" class="data-det-purpose"></td>` +
    `<td><input type="number" class="data-det-price" step="0.01" oninput="calculateDataRowTotal(this)"></td>` +
    `<td><input type="number" class="data-det-qty" step="1" oninput="calculateDataRowTotal(this)"></td>` +
    `<td><input type="text" class="data-det-total" readonly></td>` +
    `<td><input type="text" class="data-det-supplier"></td>` +
    `<td><input type="url" class="data-det-link"></td>` +
    `<td class="text-center" style="text-align:center;"><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove();">&times;</button></td>`;
  document.getElementById('data-detail-tbody').appendChild(tr);
}

function calculateDataRowTotal(input) {
  const tr = input.closest('tr');
  const price = parseFloat(tr.querySelector('.data-det-price').value) || 0;
  const qty = parseFloat(tr.querySelector('.data-det-qty').value) || 0;
  tr.querySelector('.data-det-total').value = (price * qty) > 0 ? (price * qty).toFixed(2) : '';
}

function updateFileName(input) {
  const display = document.getElementById('file-name-display');
  if (!display) return;
  if (input.files && input.files.length) {
    display.innerText = '✅ Выбран: ' + input.files[0].name;
    display.style.color = '#10b981';
  } else {
    display.innerText = 'Нажмите, чтобы выбрать файл';
    display.style.color = '#0f172a';
  }
}

function handleLinkParse(btn) {
  const card = btn.closest('.pos-card');
  if (!card) { showToast('Не удалось определить карточку позиции', 'error'); return; }
  const linkInput = card.querySelector('.det-link');
  const url = linkInput ? linkInput.value.trim() : '';
  if (!url) { showToast('Введите ссылку', 'error'); return; }
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) { showToast('Допускаются только HTTP и HTTPS ссылки', 'error'); return; }
  } catch (_) { showToast('Введите корректную ссылку', 'error'); return; }
  if (typeof window.parseLinkData !== 'function') { showToast('Модуль парсинга не загружен. Проверьте подключение link-parser.js.', 'error'); return; }
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = 'Загрузка...';
  try {
    window.parseLinkData(url, card);
  } catch (error) {
    console.error('[Forms] Link parsing error:', error);
    showToast('Ошибка при обработке ссылки', 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

function updateOpenLink(input) {
  const card = input.closest('.pos-card');
  if (!card) return;
  const btn = card.querySelector('.btn-open-link');
  if (!btn) return;
  const url = input.value.trim();
  if (url && /^https?:\/\//i.test(url)) {
    btn.dataset.url = url;
    btn.disabled = false;
  } else {
    btn.dataset.url = '';
    btn.disabled = true;
  }
}

function openLink(btn) {
  const url = btn.dataset.url;
  if (url) window.open(url, '_blank', 'noopener');
}

async function parseVseinstrumentiCart(url, card) {
  if (typeof window.parseLinkData !== 'function') { showToast('Модуль парсинга не загружен', 'error'); return false; }
  return await window.parseLinkData(url, card);
}

function initResizableTable(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const ths = table.querySelectorAll('thead th');
  ths.forEach(function (th, idx) {
    if (idx === ths.length - 1) return;
    if (th.querySelector('.resize-handle')) return;
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    th.appendChild(handle);
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault(); e.stopPropagation();
      handle.classList.add('active');
      const startX = e.pageX, startWidth = th.offsetWidth;
      function onMove(ev) { th.style.width = Math.max(60, startWidth + (ev.pageX - startX)) + 'px'; }
      function onUp() {
        handle.classList.remove('active');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

window.renderEmptyState = renderEmptyState;
window.removeDetailRow = removeDetailRow;
window.updatePositionNumbers = updatePositionNumbers;
window.updateLinkBtnState = updateLinkBtnState;
window.addDetailRow = addDetailRow;
window.calculateRowTotal = calculateRowTotal;
window.calculateAllTotals = calculateAllTotals;
window.updateHeaderSum = updateHeaderSum;
window.addDataDetailRow = addDataDetailRow;
window.calculateDataRowTotal = calculateDataRowTotal;
window.updateFileName = updateFileName;
window.handleLinkParse = handleLinkParse;
window.updateOpenLink = updateOpenLink;
window.openLink = openLink;
window.parseVseinstrumentiCart = parseVseinstrumentiCart;
window.initResizableTable = initResizableTable;