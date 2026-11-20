// js/forms.js — Обработка форм

/* ============================================================
   RESIZABLE COLUMNS для таблиц детализации
   ============================================================ */
function initResizableTable(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const ths = table.querySelectorAll('thead th');
  ths.forEach(function (th, idx) {
    if (idx === ths.length - 1) return; // пропуск кнопки удаления
    if (th.querySelector('.resize-handle')) return;
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    th.appendChild(handle);
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      handle.classList.add('active');
      const startX = e.pageX;
      const startWidth = th.offsetWidth;
      function onMove(ev) {
        const newWidth = Math.max(60, startWidth + (ev.pageX - startX));
        th.style.width = newWidth + 'px';
      }
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

// Поставщик всегда в таблице — динамическая вставка колонки не нужна
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
    if (allowedDirs.length > 0 && allowedDirs.includes(String(item.ID))) { const isSel = String(selectedDirId) === String(item.ID) ? 'selected' : ''; dirSelect.innerHTML += `<option value="${item.ID}" ${isSel}>${item.VALUE}</option>`; }
    else if (allowedDirs.length === 0) { const isSel = String(selectedDirId) === String(item.ID) ? 'selected' : ''; dirSelect.innerHTML += `<option value="${item.ID}" ${isSel}>${item.VALUE}</option>`; }
  });
}

function openCreateModal() {
  const deptSelect = document.getElementById('create-dept');
  deptSelect.innerHTML = '<option value="">-- Выберите отдел --</option>';
  let availableDepts = 0;
  departments.forEach(d => { if (settings.visibleDepts.includes(String(d.ID)) && settings.deptShortNames[d.ID]) { deptSelect.innerHTML += `<option value="${d.ID}">${d.NAME} (${settings.deptShortNames[d.ID]})</option>`; availableDepts++; } });
  if (availableDepts === 0) return showToast('Нет доступных отделов', 'error');
  document.getElementById('create-modal-title').innerText = 'Создать запрос на закупку';
  document.getElementById('form-create').reset();
  document.getElementById('edit-item-id').value = '';
  document.getElementById('detail-tbody').innerHTML = '';
  const amountInput = document.getElementById('create-amount-product');
  amountInput.value = '';
  amountInput.readOnly = false; // стили readonly берутся из CSS [readonly]
  document.getElementById('btn-save-create').disabled = false;
  document.getElementById('btn-save-create').innerText = 'Сохранить';
  document.getElementById('create-modal-content').style.borderTop = ''; // сброс после edit
  populateCreateSection();
  addDetailRow();
  document.getElementById('modal-create').style.display = 'flex';
  setTimeout(function () { initResizableTable('detail-table'); }, 50);
}

// Порядок: Наименование, Цель, Цена с НДС, Кол-во, Всего, Поставщик, Ссылка
function addDetailRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input type="text" class="det-name" oninput="calculateAllTotals()"></td>` +
    `<td><input type="text" class="det-purpose"></td>` +
    `<td><input type="number" class="det-price" step="0.01" oninput="calculateRowTotal(this)"></td>` +
    `<td><input type="number" class="det-qty" step="1" oninput="calculateRowTotal(this)"></td>` +
    `<td><input type="text" class="det-total" readonly></td>` +
    `<td><input type="text" class="det-supplier"></td>` +
    `<td><input type="url" class="det-link"></td>` +
    `<td style="text-align:center;"><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove(); calculateAllTotals();">&times;</button></td>`;
  document.getElementById('detail-tbody').appendChild(tr);
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
    `<td style="text-align:center;"><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove();">&times;</button></td>`;
  document.getElementById('data-detail-tbody').appendChild(tr);
}

function calculateRowTotal(input) {
  const tr = input.closest('tr');
  const price = parseFloat(tr.querySelector('.det-price').value) || 0;
  const qty = parseFloat(tr.querySelector('.det-qty').value) || 0;
  tr.querySelector('.det-total').value = (price * qty) > 0 ? (price * qty).toFixed(2) : '';
  calculateAllTotals();
}

function calculateAllTotals() {
  let sum = 0;
  let hasDetails = false;
  document.querySelectorAll('#detail-tbody tr').forEach(tr => {
    const name = tr.querySelector('.det-name').value.trim();
    const qty = tr.querySelector('.det-qty').value.trim();
    const price = tr.querySelector('.det-price').value.trim();
    const total = parseFloat(tr.querySelector('.det-total').value) || 0;
    if (name || qty || price) hasDetails = true;
    sum += total;
  });
  const amountInput = document.getElementById('create-amount-product');
  if (hasDetails) { amountInput.value = sum > 0 ? sum.toFixed(2) : ''; amountInput.readOnly = true; }
  else { amountInput.readOnly = false; }
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
  delegatePurchase(parseInt(id), parseInt(toUserId), note, function(ok) {
    if (btn) { btn.disabled = false; btn.innerText = 'Делегировать'; }
    if (ok) closeModal('modal-delegate');
  });
}

function submitCreateRequest(e) {
  e.preventDefault();
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

  const rows = document.querySelectorAll('#detail-tbody tr');
  const arrNames = [], arrPurposes = [], arrPrices = [], arrQtys = [], arrLinks = [], arrSuppliers = [];
  let hasDetails = false;
  rows.forEach(tr => {
    const n = tr.querySelector('.det-name').value.trim();
    const p = tr.querySelector('.det-purpose').value.trim();
    const pr = tr.querySelector('.det-price').value.trim();
    const q = tr.querySelector('.det-qty').value.trim();
    const l = tr.querySelector('.det-link').value.trim();
    const s = tr.querySelector('.det-supplier').value.trim();
    if (n || p || q || l || pr || s) { arrNames.push(n); arrPurposes.push(p); arrPrices.push(pr !== '' ? `${parseFloat(pr)}|RUB` : '0|RUB'); arrQtys.push(q); arrLinks.push(l); arrSuppliers.push(s); hasDetails = true; }
  });
  const shortDept = settings.deptShortNames[deptId] || (departments.find(d => d.ID == deptId)?.NAME || 'Отдел');
  const dateStr = new Date().toLocaleDateString('ru-RU');
  const fields = { categoryId: currentCategoryId, [actualFields.shortDesc]: shortDesc, [actualFields.deadlineZakup]: deadline, [actualFields.dept]: deptId, [actualFields.creator]: currentUser.ID, [actualFields.amountProduct]: amountProduct ? parseFloat(amountProduct) : 0 };
  if (section) fields[actualFields.section] = section;
  if (direction) fields[actualFields.direction] = direction;
  if (actualFields.combinedDir && combinedText) fields[actualFields.combinedDir] = combinedText;
  if (hasDetails) { fields[actualFields.detailName] = arrNames; fields[actualFields.detailPurpose] = arrPurposes; fields[actualFields.detailPrice] = arrPrices; fields[actualFields.detailQty] = arrQtys; fields[actualFields.detailLink] = arrLinks; if (actualFields.detailSupplier && fieldDefs[actualFields.detailSupplier]) fields[actualFields.detailSupplier] = arrSuppliers; }
  else { fields[actualFields.detailName] = []; fields[actualFields.detailPurpose] = []; fields[actualFields.detailPrice] = []; fields[actualFields.detailQty] = []; fields[actualFields.detailLink] = []; if (actualFields.detailSupplier && fieldDefs[actualFields.detailSupplier]) fields[actualFields.detailSupplier] = []; }

  if (editId) {
    const oldItem = items.find(i => i.id == editId);
    const createdDate = oldItem ? new Date(oldItem.createdTime).toLocaleDateString('ru-RU') : dateStr;
    fields.title = `Закупка №${editId} отделом ${shortDept} от ${createdDate}`;
    BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: editId, fields: fields }, (res) => {
      if (res.error()) { logAction('Ошибка редактирования: ' + getApiErrorMessage(res), 'error'); showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); btn.disabled = false; btn.innerText = 'Сохранить'; }
      else { logAction('Закупка обновлена', 'success'); showToast('Закупка обновлена'); closeModal('modal-create'); btn.disabled = false; btn.innerText = 'Сохранить'; loadAllData(); }
    });
  } else {
    fields.title = `Закупка отделом ${shortDept} от ${dateStr}`;
    fields.xmlId = isTestMode ? 'TEST_APP_' + Date.now() : 'APP_PURCHASE_' + Date.now();
    BX24.callMethod('crm.item.add', { entityTypeId: ENTITY_TYPE_ID, fields: fields }, (res) => {
      if (res.error()) { logAction('Ошибка создания: ' + getApiErrorMessage(res), 'error'); showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); btn.disabled = false; btn.innerText = 'Сохранить'; }
      else {
        const newId = res.data().item.id;
        const finalTitle = `Закупка №${newId} отделом ${shortDept} от ${dateStr}`;
        BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: newId, fields: { title: finalTitle } }, (updateRes) => {
          btn.disabled = false; btn.innerText = 'Сохранить';
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