// js/forms.js — Обработка форм

/* ============================================================
   RESIZABLE COLUMNS для таблиц детализации (модалка данных)
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
      void p.offsetWidth; // перезапуск анимации
      p.classList.add(dir === 'forward' ? 'from-right' : 'from-left');
    }
  });
  document.querySelectorAll('.cs-step').forEach(function (s) {
    const sn = +s.dataset.step;
    s.classList.toggle('active', sn === n);
    s.classList.toggle('done', sn < n);
  });
  const fill = document.getElementById('cs-fill');
  if (fill) fill.style.width = ((n - 1) / 2 * 100) + '%';
  const back = document.getElementById('btn-create-back');
  const next = document.getElementById('btn-create-next');
  const save = document.getElementById('btn-save-create');
  if (back) back.style.display = n > 1 ? '' : 'none';
  if (next) next.style.display = n < 3 ? '' : 'none';
  if (save) save.style.display = n === 3 ? '' : 'none';
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
    let hasName = false;
    document.querySelectorAll('.pos-card .det-name').forEach(function (i) { if (i.value.trim()) hasName = true; });
    if (badDesc) { showToast('Укажите краткое описание', 'error'); return false; }
    if (!hasName) { showToast('Добавьте хотя бы одну позицию с наименованием', 'error'); return false; }
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
      <div class="review-item"><div class="review-label">Позиций закупки</div><div class="review-value">${posCount}</div></div>
      <div class="review-item full"><div class="review-label">Краткое описание</div><div class="review-value">${escapeHtml(shortDesc)}</div></div>
      <div class="review-item full"><div class="review-label">Сумма позиций (без доставки)</div><div class="review-value amount">${sumText}</div></div>
    </div>
    <div class="review-note">Проверьте данные перед сохранением. После сохранения запрос уйдёт в работу.</div>`;
}

/* ============================================================
   КАРТОЧКИ ПОЗИЦИЙ (сворачиваемые)
   ============================================================ */
function addDetailRow(data) {
  data = data || {};
  const container = document.getElementById('purchase-items-container');
  const details = document.createElement('details');
  details.className = 'pos-card';
  details.open = true;
  const nameVal = data.name || '';
  const priceVal = data.price || '';
  const qtyVal = data.qty || '';
  const totalVal = (parseFloat(priceVal) * parseFloat(qtyVal)) || 0;
  details.innerHTML = `
    <summary class="pos-head">
      <span class="pos-chev"></span>
      <span class="pos-num">Позиция</span>
      <span class="pos-preview ${nameVal ? '' : 'empty'}">${escapeHtml(nameVal || 'Без названия')}</span>
      <span class="pos-total">${totalVal > 0 ? totalVal.toFixed(2) + ' ₽' : '0.00 ₽'}</span>
      <button type="button" class="pos-del" title="Удалить позицию" onclick="event.preventDefault(); event.stopPropagation(); removeDetailRow(this);">&times;</button>
    </summary>
    <div class="pos-body">
      <div class="pos-grid">
        <div class="form-group pg-name">
          <label>Наименование *</label>
          <input type="text" class="det-name" placeholder="Например: Ацетонитрил ОСЧ, 1л" value="${escapeHtml(nameVal)}" oninput="onDetNameInput(this); calculateRowTotal(this);">
        </div>
        <div class="form-group pg-price">
          <label>Цена с НДС (без доставки)</label>
          <input type="number" class="det-price" step="0.01" placeholder="0.00" value="${priceVal}" oninput="calculateRowTotal(this)">
        </div>
        <div class="form-group pg-qty">
          <label>Кол-во</label>
          <input type="number" class="det-qty" step="1" placeholder="1" value="${qtyVal}" oninput="calculateRowTotal(this)">
        </div>
        <div class="form-group pg-total">
          <label>Всего</label>
          <div class="pos-total-value det-total">${totalVal > 0 ? totalVal.toFixed(2) + ' ₽' : '0.00 ₽'}</div>
        </div>
        <div class="form-group pg-purpose">
          <label>Цель использования</label>
          <input type="text" class="det-purpose" placeholder="Например: Для ВЭЖХ анализа" value="${escapeHtml(data.purpose || '')}">
        </div>
        <div class="form-group pg-supplier">
          <label>Поставщик</label>
          <input type="text" class="det-supplier" placeholder="Например: Химмед" value="${escapeHtml(data.supplier || '')}">
        </div>
        <div class="form-group pg-link">
          <label>Ссылка</label>
          <div class="link-input-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <input type="url" class="det-link" placeholder="https://..." value="${escapeHtml(data.link || '')}">
          </div>
        </div>
      </div>
    </div>`;
  container.appendChild(details);
  updatePositionNumbers();
}

function removeDetailRow(btn) {
  const card = btn.closest('.pos-card');
  if (card) card.remove();
  const c = document.getElementById('purchase-items-container');
  if (c && !c.children.length) addDetailRow();
  updatePositionNumbers();
  calculateAllTotals();
}

function updatePositionNumbers() {
  document.querySelectorAll('#purchase-items-container .pos-card').forEach(function (card, idx) {
    const num = card.querySelector('.pos-num');
    if (num) num.textContent = 'Позиция ' + (idx + 1);
  });
}

function onDetNameInput(input) {
  const card = input.closest('.pos-card');
  const pv = card.querySelector('.pos-preview');
  const v = input.value.trim();
  pv.textContent = v || 'Без названия';
  pv.classList.toggle('empty', !v);
}

function calculateRowTotal(input) {
  const card = input.closest('.pos-card');
  const price = parseFloat(card.querySelector('.det-price').value) || 0;
  const qty = parseFloat(card.querySelector('.det-qty').value) || 0;
  const total = price * qty;
  const txt = total > 0 ? total.toFixed(2) + ' ₽' : '0.00 ₽';
  card.querySelector('.det-total').textContent = txt;
  card.querySelector('.pos-total').textContent = txt;
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
  const totalEl = document.getElementById('create-total-sum');
  if (totalEl) totalEl.innerText = sum > 0 ? sum.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽' : '0.00 ₽';
  if (createStep === 3) renderCreateSummary();
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
  document.getElementById('create-total-sum').innerText = '0.00 ₽';
  document.getElementById('btn-save-create').disabled = false;
  document.getElementById('btn-save-create').innerText = 'Сохранить';
  document.getElementById('create-modal-content').style.borderTop = '';
  document.querySelectorAll('#modal-create .field-error').forEach(el => el.classList.remove('field-error'));

  populateCreateSection();
  addDetailRow();
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
  if (curSec) { document.getElementById('create-section').value = curSec; updateDirectionsCreate(curDir); }

  const container = document.getElementById('purchase-items-container');
  container.innerHTML = '';

  const names = item[actualFields.detailName] || [];
  const purposes = item[actualFields.detailPurpose] || [];
  const prices = item[actualFields.detailPrice] || [];
  const qtys = item[actualFields.detailQty] || [];
  const links = item[actualFields.detailLink] || [];
  const suppliers = item[actualFields.detailSupplier] || [];

  const arrN = Array.isArray(names) ? names : (names ? [names] : []);
  const arrP = Array.isArray(purposes) ? purposes : (purposes ? [purposes] : []);
  const arrPr = Array.isArray(prices) ? prices : (prices ? [prices] : []);
  const arrQ = Array.isArray(qtys) ? qtys : (qtys ? [qtys] : []);
  const arrL = Array.isArray(links) ? links : (links ? [links] : []);
  const arrS = Array.isArray(suppliers) ? suppliers : (suppliers ? [suppliers] : []);

  const maxLen = Math.max(arrN.length, 1);
  for (let i = 0; i < maxLen; i++) {
    addDetailRow({
      name: arrN[i] || '',
      purpose: arrP[i] || '',
      price: parseAmount(arrPr[i]),
      qty: parseAmount(arrQ[i]),
      link: arrL[i] || '',
      supplier: arrS[i] || ''
    });
  }

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
  const arrNames = [], arrPurposes = [], arrPrices = [], arrQtys = [], arrLinks = [], arrSuppliers = [];
  let hasDetails = false;

  cards.forEach(card => {
    const n = card.querySelector('.det-name').value.trim();
    const p = card.querySelector('.det-purpose').value.trim();
    const pr = card.querySelector('.det-price').value.trim();
    const q = card.querySelector('.det-qty').value.trim();
    const l = card.querySelector('.det-link').value.trim();
    const s = card.querySelector('.det-supplier').value.trim();
    if (n || p || q || l || pr || s) {
      arrNames.push(n);
      arrPurposes.push(p);
      arrPrices.push(pr !== '' ? `${parseFloat(pr)}|RUB` : '0|RUB');
      arrQtys.push(q);
      arrLinks.push(l);
      arrSuppliers.push(s);
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
      else { logAction('Закупка обновлена', 'success'); showToast('Закупка обновлена'); closeModal('modal-create'); restoreBtn(); loadAllData(); }
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
    else { logAction('Сумма обновлена', 'success'); showToast('Сумма обновлена'); closeModal('modal-edit-amount'); loadAllData(); }
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