// js/forms.js — Обработка форм + мастер создания + автоподсказки из кэша

/* ============================================================
   ⚠️ ВАЖНО: ЗАМЕНИТЕ ЭТУ ССЫЛКУ НА ВАШУ ССЫЛКУ ОТ CLOUDFLARE!
   ============================================================ */
const MY_PROXY_URL = 'https://zakupki-proxy.ваш-ник.workers.dev/?url=';

/* ============================================================
   RESIZABLE COLUMNS (модалка данных)
   ============================================================ */
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

function syncSupplierColumns() {}

function populateCreateSection() {
  const secSelect = document.getElementById('create-section');
  const dirSelect = document.getElementById('create-direction');
  secSelect.innerHTML = '<option value="">-- Выберите раздел --</option>';
  dirSelect.innerHTML = '<option value="">-- Сначала выберите раздел --</option>';
  const secDef = fieldDefs[actualFields.section];
  if (secDef && secDef.items) secDef.items.forEach(i => { secSelect.innerHTML += `<option value="${i.ID}">${i.VALUE}</option>`; });
}

function updateDirectionsCreate(selectedDirId = null) {
  const secSelect = document.getElementById('create-section');
  const secId = secSelect.value;
  const dirSelect = document.getElementById('create-direction');
  dirSelect.innerHTML = '<option value="">-- Выберите направление --</option>';
  if (!secId) { dirSelect.innerHTML += '<option value="">-- Сначала выберите раздел --</option>'; return; }
  const dirDef = fieldDefs[actualFields.direction];
  if (!dirDef || !dirDef.items) return;
  const allowedDirs = settings.listDependencies[secId] || [];
  dirDef.items.forEach(item => {
    const isSel = String(selectedDirId) === String(item.ID) ? 'selected' : '';
    if (allowedDirs.length > 0 && allowedDirs.includes(String(item.ID))) {
      dirSelect.innerHTML += `<option value="${item.ID}" ${isSel}>${item.VALUE}</option>`;
    } else if (allowedDirs.length === 0) {
      dirSelect.innerHTML += `<option value="${item.ID}" ${isSel}>${item.VALUE}</option>`;
    }
  });
}

/* ============================================================
   МАСТЕР СОЗДАНИЯ: шаги, валидация, анимация
   ============================================================ */
let createStep = 1;

function goCreateStep(n, dir) {
  dir = dir || (n >= createStep ? 'forward' : 'back');
  createStep = n;
  document.querySelectorAll('#modal-create .step-panel').forEach(function (p) {
    const on = +p.dataset.step === n;
    p.classList.toggle('active', on);
    if (on) {
      p.classList.remove('from-right', 'from-left');
      void p.offsetWidth;
      p.classList.add(dir === 'forward' ? 'from-right' : 'from-left');
    }
  });
  document.querySelectorAll('.cs-step').forEach(function (s) {
    const sn = +s.dataset.step;
    s.classList.toggle('active', sn === n);
    s.classList.toggle('done', sn < n);
  });
  const fill = document.getElementById('cs-fill');
  if (fill) fill.style.width = ((n - 1) / 2 * 66.66) + '%';
  const back = document.getElementById('btn-create-back');
  const next = document.getElementById('btn-create-next');
  const save = document.getElementById('btn-save-create');
  if (back) back.style.display = n > 1 ? '' : 'none';
  if (next) next.style.display = n < 3 ? '' : 'none';
  if (save) save.style.display = n === 3 ? '' : 'none';
  updateHeaderSum();
  if (n === 3) renderCreateSummary();
  const mb = document.querySelector('#modal-create .modal-body');
  if (mb) mb.scrollTop = 0;
}

function validateCreateStep(n) {
  if (n === 1) {
    let ok = true;
    ['create-dept', 'create-deadline', 'create-section', 'create-direction'].forEach(function (id) {
      const el = document.getElementById(id);
      const bad = !el.value;
      el.classList.toggle('field-error', bad);
      if (bad) ok = false;
    });
    if (!ok) showToast('Заполните обязательные поля: отдел, срок, раздел и направление', 'error');
    return ok;
  }
  if (n === 2) {
    const sd = document.getElementById('create-short-desc');
    const badDesc = !sd.value.trim();
    sd.classList.toggle('field-error', badDesc);
    if (badDesc) { showToast('Укажите краткое описание', 'error'); return false; }
    return true;
  }
  return true;
}

function nextCreateStep() {
  if (!validateCreateStep(createStep)) return;
  if (createStep < 3) goCreateStep(createStep + 1, 'forward');
}

function prevCreateStep() {
  if (createStep > 1) goCreateStep(createStep - 1, 'back');
}

function tryGoCreateStep(n) {
  if (n === createStep) return;
  if (n < createStep) { goCreateStep(n, 'back'); return; }
  for (let s = createStep; s < n; s++) {
    if (!validateCreateStep(s)) { goCreateStep(s, 'back'); return; }
  }
  goCreateStep(n, 'forward');
}

function renderCreateSummary() {
  const c = document.getElementById('create-review-container');
  if (!c) return;
  const deptEl = document.getElementById('create-dept');
  const deptText = deptEl.value ? deptEl.options[deptEl.selectedIndex].text : '—';
  const dl = document.getElementById('create-deadline').value;
  const dlText = dl ? new Date(dl).toLocaleDateString('ru-RU') : '—';
  const secEl = document.getElementById('create-section');
  const dirEl = document.getElementById('create-direction');
  const secText = secEl.value ? secEl.options[secEl.selectedIndex].text : '—';
  const dirText = dirEl.value ? dirEl.options[dirEl.selectedIndex].text : '—';
  const shortDesc = document.getElementById('create-short-desc').value.trim() || '—';
  const posCount = document.querySelectorAll('.pos-card').length;
  const sum = parseFloat(document.getElementById('create-amount-product').value) || 0;
  const sumText = sum.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  c.innerHTML = `
    <div class="review-grid">
      <div class="review-item"><div class="review-label">Ответственный отдел</div><div class="review-value">${escapeHtml(deptText)}</div></div>
      <div class="review-item"><div class="review-label">Крайний срок закупки</div><div class="review-value">${dlText}</div></div>
      <div class="review-item"><div class="review-label">Раздел / Направление д/с</div><div class="review-value">${escapeHtml(secText)} / ${escapeHtml(dirText)}</div></div>
      <div class="review-item"><div class="review-label">Позиций закупки</div><div class="review-value">${posCount === 0 ? 'детализация не заполнена' : posCount}</div></div>
      <div class="review-item full"><div class="review-label">Краткое описание</div><div class="review-value">${escapeHtml(shortDesc)}</div></div>
      <div class="review-item full"><div class="review-label">Сумма позиций (без доставки)</div><div class="review-value amount">${sumText}</div></div>
    </div>
    <div class="review-note">Проверьте данные перед сохранением. После сохранения запрос уйдёт в работу.</div>`;
}

/* ============================================================
   КЭШ ПОДСКАЗОК: строим из массива items (уже загружен из CRM)
   ============================================================ */
let _itemSuggestions = null;
let _topPurposes = [];
let _topSuppliers = [];

function buildItemSuggestions() {
  if (_itemSuggestions) return _itemSuggestions;
  const map = new Map();
  (items || []).forEach(function (it) {
    const names = Array.isArray(it[actualFields.detailName]) ? it[actualFields.detailName] : (it[actualFields.detailName] ? [it[actualFields.detailName]] : []);
    const purposes = Array.isArray(it[actualFields.detailPurpose]) ? it[actualFields.detailPurpose] : (it[actualFields.detailPurpose] ? [it[actualFields.detailPurpose]] : []);
    const prices = Array.isArray(it[actualFields.detailPrice]) ? it[actualFields.detailPrice] : (it[actualFields.detailPrice] ? [it[actualFields.detailPrice]] : []);
    const qtys = Array.isArray(it[actualFields.detailQty]) ? it[actualFields.detailQty] : (it[actualFields.detailQty] ? [it[actualFields.detailQty]] : []);
    const links = Array.isArray(it[actualFields.detailLink]) ? it[actualFields.detailLink] : (it[actualFields.detailLink] ? [it[actualFields.detailLink]] : []);
    const sups = actualFields.detailSupplier ? (Array.isArray(it[actualFields.detailSupplier]) ? it[actualFields.detailSupplier] : (it[actualFields.detailSupplier] ? [it[actualFields.detailSupplier]] : [])) : [];
    names.forEach(function (nm, i) {
      const key = (nm || '').trim().toLowerCase();
      if (!key) return;
      const price = parseAmount(prices[i]) || 0;
      const qty = parseAmount(qtys[i]) || 0;
      const sup = (sups[i] || '').trim();
      const pur = (purposes[i] || '').trim();
      const lnk = (links[i] || '').trim();
      if (!map.has(key)) {
        map.set(key, { name: nm.trim(), price: price, qty: qty, supplier: sup, purpose: pur, link: lnk, count: 1 });
      } else {
        const rec = map.get(key);
        rec.count++;
        if (price > 0) rec.price = price;
        if (qty > 0) rec.qty = qty;
        if (sup) rec.supplier = sup;
        if (pur) rec.purpose = pur;
        if (lnk) rec.link = lnk;
      }
    });
  });
  _itemSuggestions = Array.from(map.values()).sort((a, b) => b.count - a.count);
  const pc = new Map(), sc = new Map();
  _itemSuggestions.forEach(function (r) {
    if (r.purpose) pc.set(r.purpose, (pc.get(r.purpose) || 0) + r.count);
    if (r.supplier) sc.set(r.supplier, (sc.get(r.supplier) || 0) + r.count);
  });
  _topPurposes = Array.from(pc.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  _topSuppliers = Array.from(sc.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  return _itemSuggestions;
}

function invalidateSuggestions() { _itemSuggestions = null; _topPurposes = []; _topSuppliers = []; }

/* ============================================================
   ДРОПДАУН АВТОПОДСКАЗОК
   ============================================================ */
let _suggestEl = null;
function ensureSuggestEl() {
  if (_suggestEl) return _suggestEl;
  _suggestEl = document.createElement('div');
  _suggestEl.className = 'suggest-dropdown';
  _suggestEl.addEventListener('mousedown', function (e) { e.preventDefault(); });
  document.body.appendChild(_suggestEl);
  return _suggestEl;
}

function onDetNameInput(input) {
  const card = input.closest('.pos-card');
  const pv = card.querySelector('.pos-preview');
  const v = input.value.trim();
  pv.textContent = v || 'Без названия';
  pv.classList.toggle('empty', !v);
  calculateRowTotal(input);
  maybeAutoFillShortDesc();
  showSuggestions(input);
}

function showSuggestions(input) {
  const dd = ensureSuggestEl();
  const q = input.value.trim().toLowerCase();
  if (q.length < 2) { dd.classList.remove('open'); return; }
  const list = buildItemSuggestions().filter(function (r) { return r.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 8);
  if (!list.length) { dd.classList.remove('open'); return; }
  const rect = input.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.top = (rect.bottom + 4) + 'px';
  dd.style.left = rect.left + 'px';
  dd.style.width = rect.width + 'px';
  dd.innerHTML = list.map(function (r, idx) {
    return `<div class="suggest-item" data-idx="${idx}">
      <div class="suggest-name">${escapeHtml(r.name)}</div>
      <div class="suggest-meta">${r.price > 0 ? '<span class="s-price">' + r.price.toFixed(2) + ' ₽</span>' : ''}${r.supplier ? ' · ' + escapeHtml(r.supplier) : ''}${r.count > 1 ? ' · брали ' + r.count + ' раз' : ''}</div>
    </div>`;
  }).join('');
  dd.classList.add('open');
  dd._list = list;
  dd.onmousedown = function (e) {
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    e.preventDefault();
    const rec = dd._list[+item.dataset.idx];
    fillCardFromSuggestion(input.closest('.pos-card'), rec);
    dd.classList.remove('open');
  };
}

function hideSuggestions() { if (_suggestEl) _suggestEl.classList.remove('open'); }

function fillCardFromSuggestion(card, rec) {
  if (!rec) return;
  card.querySelector('.det-name').value = rec.name;
  if (rec.price > 0) card.querySelector('.det-price').value = rec.price;
  if (rec.qty > 0) card.querySelector('.det-qty').value = rec.qty;
  if (rec.supplier) card.querySelector('.det-supplier').value = rec.supplier;
  if (rec.purpose) card.querySelector('.det-purpose').value = rec.purpose;
  if (rec.link) card.querySelector('.det-link').value = rec.link;
  onDetNameInput(card.querySelector('.det-name'));
}

/* ============================================================
   УМНЫЙ ПАРСИНГ СТРОКИ (без ИИ, регулярками)
   ============================================================ */
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

/* ============================================================
   АВТОГЕНЕРАЦИЯ КРАТКОГО ОПИСАНИЯ
   ============================================================ */
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

/* ============================================================
   ВСТАВКА ИЗ EXCEL / WORD / ЧАТА
   ============================================================ */
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

/* ============================================================
   КАРТОЧКИ ПОЗИЦИЙ (сворачиваемые, необязательные)
   ============================================================ */
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

// ✅ ИСПРАВЛЕННАЯ функция клика по чипсу
function applyChip(chip) {
  if (window.event) {
    window.event.preventDefault();
    window.event.stopPropagation();
  }
  const val = chip.getAttribute('data-val');
  const group = chip.closest('.form-group');
  const input = group ? group.querySelector('input') : null;
  if (input) {
    input.value = val;
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
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

// ✅ ОБНОВЛЕННАЯ функция добавления строки (Порядок полей + Кнопка парсера + Data-атрибуты чипсов)
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
  
  const hasExtra = !!(supplierVal || articleVal || purposeVal || noteVal);
  
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
        <div class="form-group pg-price">
          <label>Цена с НДС</label>
          <div class="unit-input">
            <input type="number" class="det-price" step="0.01" placeholder="0.00" value="${priceVal}" oninput="calculateRowTotal(this)">
            <span class="unit">₽</span>
          </div>
        </div>
        <div class="form-group pg-qty">
          <label>Кол-во</label>
          <div class="unit-input">
            <input type="number" class="det-qty" step="1" placeholder="1" value="${qtyVal}" oninput="calculateRowTotal(this)">
            <span class="unit">шт.</span>
          </div>
        </div>
        <div class="form-group pg-link">
          <label>Ссылка</label>
          <div class="link-input-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <input type="url" class="det-link" placeholder="https://..." value="${escapeHtml(linkVal)}">
            <button type="button" class="btn-parse" onclick="handleLinkParse(this)" title="Парсить ссылку">Парсить</button>
          </div>
        </div>
      </div>
      <details class="pos-extra"${hasExtra ? ' open' : ''}>
        <summary>Дополнительно: цель, поставщик, артикул, примечание</summary>
        <div class="pos-grid">
          <div class="form-group pg-purpose">
            <label>Цель использования</label>
            <input type="text" class="det-purpose" value="${escapeHtml(purposeVal)}" placeholder="Зачем нужно">
            ${purposeChips}
          </div>
          <div class="form-group pg-supplier">
            <label>Поставщик</label>
            <input type="text" class="det-supplier" value="${escapeHtml(supplierVal)}" placeholder="Например: ОЗОН">
            ${supplierChips}
          </div>
          <div class="form-group pg-article">
            <label>Артикул</label>
            <input type="text" class="det-article" value="${escapeHtml(articleVal)}" placeholder="Код товара">
          </div>
          <div class="form-group pg-note">
            <label>Примечание</label>
            <input type="text" class="det-note" value="${escapeHtml(noteVal)}" placeholder="Особые отметки">
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

function updateHeaderSum() {
  const el = document.getElementById('create-header-sum');
  if (!el) return;
  const sum = parseFloat(document.getElementById('create-amount-product').value) || 0;
  el.innerText = sum.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  el.classList.toggle('hidden', sum <= 0);
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

/* ============================================================
   ПАРСИНГ ССЫЛОК (Через Cloudflare Worker)
   ============================================================ */
async function handleLinkParse(btn) {
  const card = btn.closest('.pos-card');
  const url = card.querySelector('.det-link').value.trim();
  if (!url) return showToast('Введите ссылку', 'error');

  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = '...';

  let success = false;
  try {
    if (url.includes('vseinstrumenti.ru/cart')) {
      success = await parseVseinstrumentiCart(url, card);
    }
    if (!success) {
      success = await parseLinkData(url, card);
    }
  } catch (e) {
    console.warn(e);
    showToast('Ошибка при загрузке страницы', 'error');
  }

  btn.disabled = false;
  btn.innerText = originalText;

  if (success) {
    showToast('Данные успешно подтянуты!', 'success');
  } else if (!url.includes('ozon.ru')) { 
    showToast('Не удалось распознать данные. Заполните вручную.', 'error');
  }
}

// Парсер ВсеИнструменты (Корзина)
async function parseVseinstrumentiCart(url, card) {
  try {
    const res = await fetch(MY_PROXY_URL + encodeURIComponent(url));
    if (!res.ok) throw new Error('Network error');
    const html = await res.text();

    const match = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});?\s*<\/script>/s);
    if (match && match[1]) {
      const state = JSON.parse(match[1]);
      const cartItems = state?.cart?.items || state?.cartItems || state?.basket?.items || [];
      if (cartItems.length > 0) {
        const item = cartItems[0];
        const name = item.name || item.title || '';
        const price = item.price || item.cost || 0;
        const qty = item.quantity || 1;
        const article = item.article || item.sku || item.vendorCode || '';

        if (name) {
          card.querySelector('.det-name').value = name;
          onDetNameInput(card.querySelector('.det-name'));
        }
        if (price) card.querySelector('.det-price').value = price;
        if (qty) card.querySelector('.det-qty').value = qty;
        if (article) card.querySelector('.det-article').value = article;
        card.querySelector('.det-supplier').value = 'ВсеИнструменты';

        calculateRowTotal(card.querySelector('.det-price'));
        return true;
      }
    }
  } catch (e) {
    console.warn('Vseinstrumenti parse error:', e);
  }
  return false;
}

// Универсальный парсер (JSON-LD -> OpenGraph -> Извлечение из URL)
async function parseLinkData(url, card) {
  try {
    const res = await fetch(MY_PROXY_URL + encodeURIComponent(url));
    if (!res.ok) throw new Error('Network error');
    const html = await res.text();
    
    if (html.includes('captcha') || html.includes('Доступ ограничен')) {
      showToast('Сайт запросил капчу. Попробуйте позже.', 'error');
      return false;
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    let parsedSomething = false;

    let title = '';
    let price = 0;
    let article = '';

    // 1. Пытаемся найти JSON-LD (Schema.org) - самый надежный источник
    const ldJsonScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldJsonScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const products = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);
        for (const prod of products) {
          if (prod['@type'] === 'Product' || prod['@type'] === 'http://schema.org/Product') {
            title = title || prod.name;
            article = article || prod.sku || prod.mpn || prod.productID;
            if (prod.offers) {
              const offer = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
              price = price || parseFloat(offer.price || offer.lowPrice || 0);
            }
            if (title && price) break;
          }
        }
      } catch (e) { /* ignore broken JSON */ }
    }

    // 2. OpenGraph (og:title, product:price:amount)
    if (!title) title = doc.querySelector('meta[property="og:title"]')?.content || doc.querySelector('h1')?.innerText?.trim() || '';
    if (!price) {
      const priceMeta = doc.querySelector('meta[property="product:price:amount"]')?.content || doc.querySelector('meta[property="og:price:amount"]')?.content || doc.querySelector('meta[itemprop="price"]')?.content;
      if (priceMeta) price = parseFloat(priceMeta.replace(/[^\d.,]/g, '').replace(',', '.'));
    }

    // 3. Специфичные селекторы (если мета-теги не сработали)
    if (!price) {
      const priceStr = doc.querySelector('.price, .product-price, [itemprop="price"], .product__price, .tsHeadline500Medium')?.innerText || '';
      if (priceStr) price = parseFloat(priceStr.replace(/[^\d.,]/g, '').replace(',', '.'));
    }
    
    if (!article) {
       const artStr = doc.querySelector('.article, .sku, [itemprop="sku"], [data-widget="webProductSku"]')?.innerText?.trim() || '';
       if (artStr) article = artStr.replace(/[^\d]/g, '');
    }

    // 4. Если артикул не найден на странице, пытаемся вытащить его из URL
    if (!article) {
      // Ozon: /product/name-123456789/
      const ozonMatch = url.match(/-(\d{6,})\/?$/);
      if (url.includes('ozon.ru') && ozonMatch) article = ozonMatch[1];
      // Wildberries: /catalog/12345678/detail.aspx
      const wbMatch = url.match(/\/catalog\/(\d+)\//);
      if (url.includes('wildberries.ru') && wbMatch) article = wbMatch[1];
    }

    // Заполнение полей
    if (title && title.length > 2) {
      card.querySelector('.det-name').value = title;
      onDetNameInput(card.querySelector('.det-name'));
      parsedSomething = true;
    }
    if (price > 0 && !card.querySelector('.det-price').value) {
      card.querySelector('.det-price').value = price;
      calculateRowTotal(card.querySelector('.det-price'));
      parsedSomething = true;
    }
    if (article) {
      card.querySelector('.det-article').value = article;
      parsedSomething = true;
    }

    // Установка поставщика по умолчанию на основе домена
    const host = new URL(url).hostname.replace('www.', '');
    let supplierName = '';
    if (host.includes('ozon.ru')) supplierName = 'Ozon';
    else if (host.includes('wildberries.ru')) supplierName = 'Wildberries';
    else if (host.includes('vseinstrumenti.ru')) supplierName = 'ВсеИнструменты';
    else if (host.includes('yandex.ru') || host.includes('ya.ru')) supplierName = 'Яндекс.Маркет';
    else if (host.includes('leroymerlin.ru')) supplierName = 'Леруа Мерлен';
    else if (host.includes('citilink.ru')) supplierName = 'Ситилинк';
    else {
      const parts = host.split('.');
      supplierName = parts.length >= 2 ? parts[parts.length - 2] : host;
      supplierName = supplierName.charAt(0).toUpperCase() + supplierName.slice(1);
    }

    if (!card.querySelector('.det-supplier').value) {
      card.querySelector('.det-supplier').value = supplierName;
      parsedSomething = true;
    }

    return parsedSomething;
  } catch (e) {
    console.warn('Ошибка разбора HTML:', e);
    return false;
  }
}

/* ============================================================
   МОДАЛКА "ВЫБРАТЬ ИЗ ПРОШЛЫХ"
   ============================================================ */
function openPastItemsModal() {
  buildItemSuggestions();
  const search = document.getElementById('past-search');
  if (search) search.value = '';
  renderPastItems();
  document.getElementById('modal-past').style.display = 'flex';
}

function renderPastItems() {
  const list = document.getElementById('past-list');
  if (!list) return;
  const q = (document.getElementById('past-search').value || '').trim().toLowerCase();
  const all = buildItemSuggestions();
  const filtered = q ? all.filter(function (r) { return r.name.toLowerCase().indexOf(q) !== -1 || (r.supplier || '').toLowerCase().indexOf(q) !== -1; }) : all;
  if (!filtered.length) {
    list.innerHTML = '<div class="past-empty">Ничего не найдено. Добавьте первую позицию вручную — она появится в истории после сохранения.</div>';
    return;
  }
  list.innerHTML = filtered.map(function (r, idx) {
    return `<label class="past-row">
      <input type="checkbox" class="past-check" data-idx="${idx}">
      <div class="past-info">
        <div class="past-name">${escapeHtml(r.name)}</div>
        <div class="past-meta">${r.price > 0 ? '<span class="p-price">' + r.price.toFixed(2) + ' ₽</span>' : ''}${r.supplier ? ' · ' + escapeHtml(r.supplier) : ''}${r.purpose ? ' · ' + escapeHtml(r.purpose) : ''}</div>
      </div>
      <span class="past-count">${r.count}×</span>
    </label>`;
  }).join('');
  list._filtered = filtered;
}

function addSelectedPastItems() {
  const list = document.getElementById('past-list');
  const checks = list.querySelectorAll('.past-check:checked');
  if (!checks.length) return showToast('Выберите хотя бы одну позицию', 'error');
  checks.forEach(function (ch) {
    const rec = list._filtered[+ch.dataset.idx];
    addDetailRow({
      name: rec.name, link: rec.link || '', qty: rec.qty || '', price: rec.price || '',
      supplier: rec.supplier || '', purpose: rec.purpose || ''
    });
  });
  closeModal('modal-past');
  showToast('Добавлено позиций: ' + checks.length, 'success');
  calculateAllTotals();
  maybeAutoFillShortDesc();
}

/* ============================================================
   ОТКРЫТИЕ МОДАЛОК
   ============================================================ */
function openCreateModal() {
  const deptSelect = document.getElementById('create-dept');
  deptSelect.innerHTML = '<option value="">-- Выберите отдел --</option>';
  let availableDepts = 0;
  departments.forEach(d => {
    if (settings.visibleDepts.includes(String(d.ID)) && settings.deptShortNames[d.ID]) {
      deptSelect.innerHTML += `<option value="${d.ID}">${d.NAME} (${settings.deptShortNames[d.ID]})</option>`;
      availableDepts++;
    }
  });
  if (availableDepts === 0) return showToast('Нет доступных отделов', 'error');

  document.getElementById('create-modal-title').innerText = 'Создать запрос на закупку';
  document.getElementById('form-create').reset();
  document.getElementById('edit-item-id').value = '';
  document.getElementById('purchase-items-container').innerHTML = '';
  
  document.getElementById('create-amount-product').value = '';
  updateHeaderSum();

  document.getElementById('btn-save-create').disabled = false;
  document.getElementById('btn-save-create').innerText = 'Сохранить';
  document.getElementById('create-modal-content').style.borderTop = '';
  document.querySelectorAll('#modal-create .field-error').forEach(el => el.classList.remove('field-error'));
  
  const sd = document.getElementById('create-short-desc');
  if (sd) delete sd.dataset.autofilled;

  populateCreateSection();
  buildItemSuggestions();
  renderEmptyState();
  goCreateStep(1, 'forward');
  document.getElementById('modal-create').style.display = 'flex';
}

function openEditModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  
  document.getElementById('create-modal-title').innerText = 'Редактировать закупку';
  document.getElementById('edit-item-id').value = item.id;

  const deptSelect = document.getElementById('create-dept');
  deptSelect.innerHTML = '';
  departments.forEach(d => {
    const sn = settings.deptShortNames[d.ID];
    if ((settings.visibleDepts.includes(String(d.ID)) && sn) || item[actualFields.dept] == d.ID) {
      deptSelect.innerHTML += `<option value="${d.ID}" ${item[actualFields.dept] == d.ID ? 'selected' : ''}>${d.NAME} (${sn || '—'})</option>`;
    }
  });

  document.getElementById('create-deadline').value = item[actualFields.deadlineZakup] ? item[actualFields.deadlineZakup].split('T')[0] : '';
  document.getElementById('create-short-desc').value = getShortDesc(item);
  document.getElementById('create-amount-product').value = parseAmount(item[actualFields.amountProduct]) || '';
  document.querySelectorAll('#modal-create .field-error').forEach(el => el.classList.remove('field-error'));

  populateCreateSection();
  const curSec = String(Array.isArray(item[actualFields.section]) ? item[actualFields.section][0] : (item[actualFields.section] || ''));
  const curDir = String(Array.isArray(item[actualFields.direction]) ? item[actualFields.direction][0] : (item[actualFields.direction] || ''));
  if (curSec) { 
    document.getElementById('create-section').value = curSec; 
    updateDirectionsCreate(curDir); 
  }

  const container = document.getElementById('purchase-items-container');
  container.innerHTML = '';

  const names = item[actualFields.detailName] || [];
  const purposes = item[actualFields.detailPurpose] || [];
  const prices = item[actualFields.detailPrice] || [];
  const qtys = item[actualFields.detailQty] || [];
  const links = item[actualFields.detailLink] || [];
  const suppliers = item[actualFields.detailSupplier] || [];
  const arrArt = actualFields.detailArticle ? (Array.isArray(item[actualFields.detailArticle]) ? item[actualFields.detailArticle] : (item[actualFields.detailArticle] ? [item[actualFields.detailArticle]] : [])) : [];
  const arrNote = actualFields.detailNote ? (Array.isArray(item[actualFields.detailNote]) ? item[actualFields.detailNote] : (item[actualFields.detailNote] ? [item[actualFields.detailNote]] : [])) : [];
  
  for (let i = 0; i < names.length; i++) {
    addDetailRow({
      name: names[i] || '',
      link: links[i] || '',
      qty: parseAmount(qtys[i]),
      price: parseAmount(prices[i]),
      supplier: suppliers[i] || '',
      article: arrArt[i] || '',
      purpose: purposes[i] || '',
      note: arrNote[i] || ''
    });
  }

  renderEmptyState();
  calculateAllTotals();

  const stage = spStages[item.stageId];
  document.getElementById('create-modal-content').style.borderTop = `6px solid ${stage ? stage.color : '#64748b'}`;
  goCreateStep(1, 'forward');
  document.getElementById('modal-create').style.display = 'flex';
}

/* ============================================================
   ОСТАЛЬНЫЕ ФОРМЫ
   ============================================================ */
function addDataDetailRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input type="text" class="data-det-name"></td>` +
    `<td><input type="text" class="data-det-purpose"></td>` +
    `<td><input type="number" class="data-det-price" step="0.01" oninput="calculateDataRowTotal(this)"></td>` +
    `<td><input type="number" class="data-det-qty" step="1" oninput="calculateDataRowTotal(this)"></td>` +
    `<td><input type="text" class="data-det-total" readonly></td>` +
    `<td><input type="text" class="data-det-supplier"></td>` +
    `<td><input type="url" class="data-det-link"></td>` +
    `<td style="text-align:center;"><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove();">&times;</button></td>`;
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

function submitDelegate(e) {
  e.preventDefault();
  const id = document.getElementById('delegate-id').value;
  const toUserId = document.getElementById('delegate-to').value;
  const note = document.getElementById('delegate-note').value.trim();
  if (!toUserId) return showToast('Выберите сотрудника', 'error');
  const btn = document.getElementById('btn-delegate-save');
  if (btn) { btn.disabled = true; btn.innerText = 'Делегирование...'; }
  delegatePurchase(parseInt(id), parseInt(toUserId), note, function (ok) {
    if (btn) { btn.disabled = false; btn.innerText = 'Делегировать'; }
    if (ok) closeModal('modal-delegate');
  });
}

function submitCreateRequest(e) {
  e.preventDefault();
  if (!validateCreateStep(1)) { goCreateStep(1, 'back'); return; }
  if (!validateCreateStep(2)) { goCreateStep(2, 'back'); return; }

  const btn = document.getElementById('btn-save-create');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.innerText = 'Создание...';
  logAction('Начало создания запроса...', 'info');

  const editId = document.getElementById('edit-item-id').value;
  const deadline = document.getElementById('create-deadline').value;
  const deptId = document.getElementById('create-dept').value;
  const shortDesc = document.getElementById('create-short-desc').value;
  const amountProduct = document.getElementById('create-amount-product').value;
  const section = document.getElementById('create-section').value;
  const direction = document.getElementById('create-direction').value;
  const secText = document.getElementById('create-section').options[document.getElementById('create-section').selectedIndex]?.text || '';
  const dirText = document.getElementById('create-direction').options[document.getElementById('create-direction').selectedIndex]?.text || '';
  let combinedText = '';
  if (secText && dirText) combinedText = `${secText} / ${dirText}`;
  else if (secText) combinedText = secText;

  const cards = document.querySelectorAll('.pos-card');
  const arrNames = [], arrPurposes = [], arrPrices = [], arrQtys = [], arrLinks = [], arrSuppliers = [], arrArticles = [], arrNotes = [];
  let hasDetails = false;

  cards.forEach(card => {
    const n = card.querySelector('.det-name').value.trim();
    const l = card.querySelector('.det-link').value.trim();
    const q = card.querySelector('.det-qty').value.trim();
    const pr = card.querySelector('.det-price').value.trim();
    const s = card.querySelector('.det-supplier').value.trim();
    const art = card.querySelector('.det-article') ? card.querySelector('.det-article').value.trim() : '';
    const p = card.querySelector('.det-purpose').value.trim();
    const note = card.querySelector('.det-note') ? card.querySelector('.det-note').value.trim() : '';
    
    if (n || l || q || pr || s || art || p || note) {
      arrNames.push(n);
      arrLinks.push(l);
      arrQtys.push(q);
      arrPrices.push(pr !== '' ? `${parseFloat(pr)}|RUB` : '0|RUB');
      arrSuppliers.push(s);
      if (actualFields.detailArticle) arrArticles.push(art);
      if (actualFields.detailNote) arrNotes.push(note);
      arrPurposes.push(p);
      hasDetails = true;
    }
  });

  const shortDept = settings.deptShortNames[deptId] || (departments.find(d => d.ID == deptId)?.NAME || 'Отдел');
  const dateStr = new Date().toLocaleDateString('ru-RU');
  const fields = {
    categoryId: currentCategoryId,
    [actualFields.shortDesc]: shortDesc,
    [actualFields.deadlineZakup]: deadline,
    [actualFields.dept]: deptId,
    [actualFields.creator]: currentUser.ID,
    [actualFields.amountProduct]: amountProduct ? parseFloat(amountProduct) : 0
  };
  if (section) fields[actualFields.section] = section;
  if (direction) fields[actualFields.direction] = direction;
  if (actualFields.combinedDir && combinedText) fields[actualFields.combinedDir] = combinedText;

  if (hasDetails) {
    fields[actualFields.detailName] = arrNames;
    fields[actualFields.detailPurpose] = arrPurposes;
    fields[actualFields.detailPrice] = arrPrices;
    fields[actualFields.detailQty] = arrQtys;
    fields[actualFields.detailLink] = arrLinks;
    if (actualFields.detailSupplier && fieldDefs[actualFields.detailSupplier]) fields[actualFields.detailSupplier] = arrSuppliers;
    if (actualFields.detailArticle && arrArticles.length) fields[actualFields.detailArticle] = arrArticles;
    if (actualFields.detailNote && arrNotes.length) fields[actualFields.detailNote] = arrNotes;
  } else {
    fields[actualFields.detailName] = [];
    fields[actualFields.detailPurpose] = [];
    fields[actualFields.detailPrice] = [];
    fields[actualFields.detailQty] = [];
    fields[actualFields.detailLink] = [];
    if (actualFields.detailSupplier && fieldDefs[actualFields.detailSupplier]) fields[actualFields.detailSupplier] = [];
  }

  const restoreBtn = () => { btn.disabled = false; btn.innerText = 'Сохранить'; };

  if (editId) {
    const oldItem = items.find(i => i.id == editId);
    const createdDate = oldItem ? new Date(oldItem.createdTime).toLocaleDateString('ru-RU') : dateStr;
    fields.title = `Закупка №${editId} отделом ${shortDept} от ${createdDate}`;
    BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: editId, fields: fields }, (res) => {
      if (res.error()) { logAction('Ошибка редактирования: ' + getApiErrorMessage(res), 'error'); showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); restoreBtn(); }
      else { logAction('Закупка обновлена', 'success'); showToast('Закупка обновлена'); closeModal('modal-create'); invalidateSuggestions(); restoreBtn(); loadAllData(); }
    });
  } else {
    fields.title = `Закупка отделом ${shortDept} от ${dateStr}`;
    fields.xmlId = isTestMode ? 'TEST_APP_' + Date.now() : 'APP_PURCHASE_' + Date.now();
    BX24.callMethod('crm.item.add', { entityTypeId: ENTITY_TYPE_ID, fields: fields }, (res) => {
      if (res.error()) { logAction('Ошибка создания: ' + getApiErrorMessage(res), 'error'); showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); restoreBtn(); }
      else {
        const newId = res.data().item.id;
        const finalTitle = `Закупка №${newId} отделом ${shortDept} от ${dateStr}`;
        BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: newId, fields: { title: finalTitle } }, () => {
          restoreBtn();
          logAction('Запрос создан ID: ' + newId, 'success');
          showToast('Запрос создан');
          closeModal('modal-create');
          invalidateSuggestions();
          loadAllData();
          if (isTestMode && currentScenario !== 'none') { setTimeout(() => { const createdItem = items.find(i => i.id === newId); if (createdItem) runScenarioAfterCreate(newId); }, 1500); }
        });
      }
    });
  }
}

function submitData(e) {
  e.preventDefault();
  const id = document.getElementById('data-id').value;
  const amountProduct = document.getElementById('data-amount-product').value;
  const amountDelivery = document.getElementById('data-amount-delivery').value;

  const rows = document.querySelectorAll('#data-detail-tbody tr');
  const arrNames = [], arrPurposes = [], arrPrices = [], arrQtys = [], arrLinks = [], arrSuppliers = [];
  let hasDetails = false;
  rows.forEach(tr => {
    const n = tr.querySelector('.data-det-name').value.trim();
    const p = tr.querySelector('.data-det-purpose').value.trim();
    const pr = tr.querySelector('.data-det-price').value.trim();
    const q = tr.querySelector('.data-det-qty').value.trim();
    const l = tr.querySelector('.data-det-link').value.trim();
    const s = tr.querySelector('.data-det-supplier').value.trim();
    if (n || p || q || l || pr || s) { arrNames.push(n); arrPurposes.push(p); arrPrices.push(pr !== '' ? `${parseFloat(pr)}|RUB` : '0|RUB'); arrQtys.push(q); arrLinks.push(l); arrSuppliers.push(s); hasDetails = true; }
  });

  const targetStageId = getStageIdByName('согласование');
  const fields = { [actualFields.amountProduct]: amountProduct ? parseFloat(amountProduct) : 0 };
  if (amountDelivery) fields[actualFields.amountDelivery] = parseFloat(amountDelivery);
  if (hasDetails) { fields[actualFields.detailName] = arrNames; fields[actualFields.detailPurpose] = arrPurposes; fields[actualFields.detailPrice] = arrPrices; fields[actualFields.detailQty] = arrQtys; fields[actualFields.detailLink] = arrLinks; if (actualFields.detailSupplier && fieldDefs[actualFields.detailSupplier]) fields[actualFields.detailSupplier] = arrSuppliers; }
  else { fields[actualFields.detailName] = []; fields[actualFields.detailPurpose] = []; fields[actualFields.detailPrice] = []; fields[actualFields.detailQty] = []; fields[actualFields.detailLink] = []; if (actualFields.detailSupplier && fieldDefs[actualFields.detailSupplier]) fields[actualFields.detailSupplier] = []; }

  const curItem = items.find(i => i.id == id);
  const curStage = curItem ? spStages[curItem.stageId] : null;
  const curName = curStage ? curStage.name.toLowerCase().replace(/ё/g, 'е') : '';
  const onApproval = curName.includes('согласование') && !curName.includes('обработка');
  if (!onApproval && targetStageId) fields.stageId = targetStageId;

  logAction('Сохранение данных расчета...', 'info');
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
    if (res.error()) { logAction('Ошибка сохранения: ' + getApiErrorMessage(res), 'error'); showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); }
    else {
      logAction('Данные сохранены', 'success');
      const item = items.find(i => i.id == id);
      if (!onApproval) {
        const taskSborId = item ? item[actualFields.taskSbor] : null;
        if (taskSborId && String(taskSborId).match(/^\d+$/)) {
          BX24.callMethod('tasks.task.update', { taskId: parseInt(taskSborId), fields: { STATUS: 5 } }, (trRes) => {
            if (trRes.error()) logAction('Ошибка завершения задачи сбора: ' + getApiErrorMessage(trRes), 'error');
            else logAction('Задача сбора завершена', 'success');
          });
        }
      }
      try {
        if (item) {
          item[actualFields.amountProduct] = amountProduct ? parseFloat(amountProduct) : 0;
          if (amountDelivery) item[actualFields.amountDelivery] = parseFloat(amountDelivery);
          if (!onApproval && targetStageId) item.stageId = targetStageId;
          const headId = resolveDeptHeadId(item, true);
          if (headId) {
            if (onApproval) { logAction(`Уведомление об изменении данных → ID ${headId}`, 'info'); notifyDataChangedOnApproval(headId, item); }
            else {
              logAction(`Уведомление о согласовании → ID ${headId}`, 'info');
              notifyApprovalNeeded(headId, item);
              groupStatusNotify(item, 'sent_to_approval');
            }
          } else logAction('Не удалось определить руководителя', 'error');
        }
      } catch (e) { logAction('Ошибка уведомления: ' + e.message, 'error'); }
      showToast('Данные сохранены');
      closeModal('modal-data');
      invalidateSuggestions();
      loadAllData();
    }
  });
}

function submitEditAmount(e) {
  e.preventDefault();
  const id = document.getElementById('edit-amount-id').value;
  const amount = document.getElementById('edit-amount-value').value;
  const fields = { [actualFields.amountProduct]: amount ? parseFloat(amount) : 0 };
  logAction('Обновление суммы...', 'info');
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
    if (res.error()) { logAction('Ошибка: ' + getApiErrorMessage(res), 'error'); showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); }
    else { logAction('Сумма обновлена', 'success'); showToast('Сумма обновлена'); closeModal('modal-edit-amount'); invalidateSuggestions(); loadAllData(); }
  });
}

function submitUpload(e) {
  e.preventDefault();
  const id = document.getElementById('upload-id').value;
  const fileInput = document.getElementById('upload-file');
  const deadline = document.getElementById('upload-deadline').value;
  const item = items.find(i => i.id == id);
  const existingFile = item ? getFileInfo(item, actualFields.fileInvoice) : null;
  const hasNewFile = fileInput.files.length > 0;
  if (!hasNewFile && !existingFile) return showToast('Выберите файл счёта', 'error');

  const doUpdate = (filePayload) => {
    const targetStageId = getStageIdByName('обработка');
    const fields = { [actualFields.deadlinePay]: deadline };
    if (filePayload) fields[actualFields.fileInvoice] = filePayload;
    if (targetStageId) fields.stageId = targetStageId;
    logAction('Сохранение счёта...', 'info');
    BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
      if (res.error()) { logAction('Ошибка загрузки счёта: ' + getApiErrorMessage(res), 'error'); showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); return; }
      logAction('Счёт загружен', 'success');
      if (item) {
        if (filePayload) item[actualFields.fileInvoice] = filePayload;
        item[actualFields.deadlinePay] = deadline;
        if (targetStageId) item.stageId = targetStageId;
      }
      BX24.callMethod('crm.item.get', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(id), select: ['*', 'UF_*'] }, function (gRes) {
        if (!gRes.error() && gRes.data() && gRes.data().item && item) {
          const fresh = gRes.data().item;
          try { item[actualFields.fileInvoice] = fresh[actualFields.fileInvoice]; } catch (e) {}
        }
        try { const econId = resolveDeptHeadId(item, true); if (econId) notifyInvoiceUploaded(econId, item); } catch (e) { logAction('Ошибка уведомления по счёту: ' + e.message, 'error'); }
        try { groupStatusNotify(item, 'invoice_received'); } catch (e) { logAction('Ошибка группового статуса по счёту: ' + e.message, 'error'); }
        closeModal('modal-upload');
        invalidateSuggestions();
        loadAllData();
      });
    });
  };

  if (hasNewFile) {
    const file = fileInput.files[0];
    logAction('Чтение файла...', 'info');
    const reader = new FileReader();
    reader.onload = function (evt) {
      const base64 = evt.target.result.split(',')[1];
      doUpdate([[file.name, base64]]);
    };
    reader.readAsDataURL(file);
  } else {
    doUpdate(null);
  }
}