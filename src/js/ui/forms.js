// js/forms.js — Обработка форм (создание, редактирование, загрузка)

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

  if (availableDepts === 0) {
    return showToast('Нет доступных отделов для создания запроса (проверьте настройки)', 'error');
  }

  document.getElementById('create-modal-title').innerText = 'Создать запрос на закупку';
  document.getElementById('form-create').reset();
  document.getElementById('edit-item-id').value = '';
  document.getElementById('detail-tbody').innerHTML = '';
  document.getElementById('create-amount-product').value = '';
  document.getElementById('create-amount-product').readOnly = false;
  document.getElementById('create-amount-product').style.backgroundColor = '#fff';
  document.getElementById('create-amount-product').style.color = '#0f172a';
  document.getElementById('btn-save-create').disabled = false;
  document.getElementById('btn-save-create').innerText = 'Сохранить';
  document.getElementById('create-modal-content').style.borderTop = 'none';

  addDetailRow();
  document.getElementById('modal-create').style.display = 'flex';
}

function addDetailRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input type="text" class="det-name" oninput="calculateAllTotals()"></td><td><input type="text" class="det-purpose"></td><td><input type="number" class="det-price" step="0.01" oninput="calculateRowTotal(this)"></td><td><input type="number" class="det-qty" step="1" oninput="calculateRowTotal(this)"></td><td><input type="text" class="det-total" readonly></td><td><input type="url" class="det-link"></td><td style="text-align:center;"><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove(); calculateAllTotals();">&times;</button></td>`;
  document.getElementById('detail-tbody').appendChild(tr);
}

function addDataDetailRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input type="text" class="data-det-name"></td><td><input type="text" class="data-det-purpose"></td><td><input type="number" class="data-det-price" step="0.01" oninput="calculateDataRowTotal(this)"></td><td><input type="number" class="data-det-qty" step="1" oninput="calculateDataRowTotal(this)"></td><td><input type="text" class="data-det-total" readonly></td><td><input type="url" class="data-det-link"></td><td style="text-align:center;"><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove();">&times;</button></td>`;
  document.getElementById('data-detail-tbody').appendChild(tr);
}

function calculateRowTotal(input) {
  const tr = input.closest('tr');
  const price = parseFloat(tr.querySelector('.det-price').value) || 0;
  const qty = parseFloat(tr.querySelector('.det-qty').value) || 0;
  const total = price * qty;
  tr.querySelector('.det-total').value = total > 0 ? total.toFixed(2) : '';
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
  if (hasDetails) {
    amountInput.value = sum > 0 ? sum.toFixed(2) : '';
    amountInput.readOnly = true;
    amountInput.style.backgroundColor = '#f8fafc';
    amountInput.style.color = '#64748b';
  } else {
    amountInput.readOnly = false;
    amountInput.style.backgroundColor = '#fff';
    amountInput.style.color = '#0f172a';
  }
}

function calculateDataRowTotal(input) {
  const tr = input.closest('tr');
  const price = parseFloat(tr.querySelector('.data-det-price').value) || 0;
  const qty = parseFloat(tr.querySelector('.data-det-qty').value) || 0;
  const total = price * qty;
  tr.querySelector('.data-det-total').value = total > 0 ? total.toFixed(2) : '';
}

function updateDirections(selectedDirId = null) {
  const secSelect = document.getElementById('data-section');
  const secId = secSelect.value;
  const dirSelect = document.getElementById('data-direction');

  dirSelect.innerHTML = '<option value="">-- Выберите направление --</option>';
  if (!secId) return;

  const dirDef = fieldDefs[actualFields.direction];
  if (!dirDef || !dirDef.items) return;

  const allowedDirs = settings.listDependencies[secId] || [];
  dirDef.items.forEach(item => {
    if (allowedDirs.length > 0 && allowedDirs.includes(String(item.ID))) {
      const isSel = String(selectedDirId) === String(item.ID) ? 'selected' : '';
      dirSelect.innerHTML += `<option value="${item.ID}" ${isSel}>${item.VALUE}</option>`;
    } else if (allowedDirs.length === 0) {
      const isSel = String(selectedDirId) === String(item.ID) ? 'selected' : '';
      dirSelect.innerHTML += `<option value="${item.ID}" ${isSel}>${item.VALUE}</option>`;
    }
  });
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

  const rows = document.querySelectorAll('#detail-tbody tr');
  const arrNames = [], arrPurposes = [], arrPrices = [], arrQtys = [], arrLinks = [];
  let hasDetails = false;

  rows.forEach(tr => {
    const n = tr.querySelector('.det-name').value.trim();
    const p = tr.querySelector('.det-purpose').value.trim();
    const pr = tr.querySelector('.det-price').value.trim();
    const q = tr.querySelector('.det-qty').value.trim();
    const l = tr.querySelector('.det-link').value.trim();
    if (n || p || q || l || pr) {
      arrNames.push(n);
      arrPurposes.push(p);
      arrPrices.push(pr !== '' ? `${parseFloat(pr)}|RUB` : '0|RUB');
      arrQtys.push(q);
      arrLinks.push(l);
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

  if (hasDetails) {
    fields[actualFields.detailName] = arrNames;
    fields[actualFields.detailPurpose] = arrPurposes;
    fields[actualFields.detailPrice] = arrPrices;
    fields[actualFields.detailQty] = arrQtys;
    fields[actualFields.detailLink] = arrLinks;
  } else {
    fields[actualFields.detailName] = [];
    fields[actualFields.detailPurpose] = [];
    fields[actualFields.detailPrice] = [];
    fields[actualFields.detailQty] = [];
    fields[actualFields.detailLink] = [];
  }

  if (editId) {
    const oldItem = items.find(i => i.id == editId);
    const createdDate = oldItem ? new Date(oldItem.createdTime).toLocaleDateString('ru-RU') : dateStr;
    fields.title = `Закупка №${editId} отделом ${shortDept} от ${createdDate}`;

    BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: editId, fields: fields }, (res) => {
      if (res.error()) {
        logAction('Ошибка редактирования: ' + getApiErrorMessage(res), 'error');
        showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
        btn.disabled = false;
        btn.innerText = 'Сохранить';
      } else {
        logAction('Закупка обновлена', 'success');
        showToast('Закупка обновлена');
        closeModal('modal-create');
        btn.disabled = false;
        btn.innerText = 'Сохранить';
        loadAllData();
      }
    });
  } else {
    fields.title = `Закупка отделом ${shortDept} от ${dateStr}`;
    fields.xmlId = isTestMode ? 'TEST_APP_' + Date.now() : 'APP_PURCHASE_' + Date.now();

    BX24.callMethod('crm.item.add', { entityTypeId: ENTITY_TYPE_ID, fields: fields }, (res) => {
      if (res.error()) {
        logAction('Ошибка создания: ' + getApiErrorMessage(res), 'error');
        showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
        btn.disabled = false;
        btn.innerText = 'Сохранить';
      } else {
        const newId = res.data().item.id;
        const finalTitle = `Закупка №${newId} отделом ${shortDept} от ${dateStr}`;

        BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: newId, fields: { title: finalTitle } }, (updateRes) => {
          btn.disabled = false;
          btn.innerText = 'Сохранить';
          logAction('Запрос создан ID: ' + newId, 'success');
          showToast('Запрос создан');
          closeModal('modal-create');
          loadAllData();

          if (isTestMode && currentScenario !== 'none') {
            setTimeout(() => {
              const createdItem = items.find(i => i.id === newId);
              if (createdItem) {
                runScenarioAfterCreate(newId);
              }
            }, 1500);
          }
        });
      }
    });
  }
}

function submitData(e) {
  e.preventDefault();
  const id = document.getElementById('data-id').value;
  const secSelect = document.getElementById('data-section');
  const dirSelect = document.getElementById('data-direction');
  const section = secSelect.value;
  const direction = dirSelect.value;
  const amountProduct = document.getElementById('data-amount-product').value;
  const amountDelivery = document.getElementById('data-amount-delivery').value;

  const secText = secSelect.options[secSelect.selectedIndex]?.text || '';
  const dirText = dirSelect.options[dirSelect.selectedIndex]?.text || '';
  let combinedText = '';
  if (secText && dirText) combinedText = `${secText} / ${dirText}`;
  else if (secText) combinedText = secText;

  const rows = document.querySelectorAll('#data-detail-tbody tr');
  const arrNames = [], arrPurposes = [], arrPrices = [], arrQtys = [], arrLinks = [];
  let hasDetails = false;

  rows.forEach(tr => {
    const n = tr.querySelector('.data-det-name').value.trim();
    const p = tr.querySelector('.data-det-purpose').value.trim();
    const pr = tr.querySelector('.data-det-price').value.trim();
    const q = tr.querySelector('.data-det-qty').value.trim();
    const l = tr.querySelector('.data-det-link').value.trim();
    if (n || p || q || l || pr) {
      arrNames.push(n);
      arrPurposes.push(p);
      arrPrices.push(pr !== '' ? `${parseFloat(pr)}|RUB` : '0|RUB');
      arrQtys.push(q);
      arrLinks.push(l);
      hasDetails = true;
    }
  });

  const targetStageId = getStageIdByName('согласование');

  const fields = {
    [actualFields.section]: section,
    [actualFields.direction]: direction,
    [actualFields.amountProduct]: parseFloat(amountProduct) || 0
  };

  if (amountDelivery) fields[actualFields.amountDelivery] = parseFloat(amountDelivery);
  if (actualFields.combinedDir && combinedText) fields[actualFields.combinedDir] = combinedText;

  if (hasDetails) {
    fields[actualFields.detailName] = arrNames;
    fields[actualFields.detailPurpose] = arrPurposes;
    fields[actualFields.detailPrice] = arrPrices;
    fields[actualFields.detailQty] = arrQtys;
    fields[actualFields.detailLink] = arrLinks;
  } else {
    fields[actualFields.detailName] = [];
    fields[actualFields.detailPurpose] = [];
    fields[actualFields.detailPrice] = [];
    fields[actualFields.detailQty] = [];
    fields[actualFields.detailLink] = [];
  }

  if (targetStageId) fields.stageId = targetStageId;

  logAction('Сохранение данных расчета...', 'info');
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
    if (res.error()) {
      logAction('Ошибка сохранения: ' + getApiErrorMessage(res), 'error');
      showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
    } else {
      logAction('Данные сохранены, стадия изменена', 'success');

      const item = items.find(i => i.id == id);
      const taskSborId = item ? item[actualFields.taskSbor] : null;
      if (taskSborId && String(taskSborId).match(/^\d+$/)) {
        logAction(`Завершение задачи сбора данных ID ${taskSborId}...`, 'info');
        BX24.callMethod('tasks.task.update', {
          taskId: parseInt(taskSborId),
          fields: { STATUS: 5 }
        }, (trRes) => {
          if (trRes.error()) {
            logAction('Ошибка завершения задачи сбора: ' + getApiErrorMessage(trRes), 'error');
          } else {
            logAction('Задача сбора данных завершена', 'success');
          }
        });
      }

      try {
        if (item) {
          const headId = resolveDeptHeadId(item, true);
          if (headId) {
            logAction(`Отправка уведомления о согласовании руководителю ID ${headId}`, 'info');
            notifyApprovalNeeded(headId, item);
          } else {
            logAction('Не удалось определить руководителя — уведомление о согласовании НЕ отправлено. Проверьте: поле deptHead в карточке, settings.deptHeads, UF_HEAD отдела.', 'error');
          }
        }
      } catch (e) {
        logAction('Ошибка при отправке уведомления о согласовании: ' + e.message, 'error');
      }

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
  const fields = { [actualFields.amountProduct]: parseFloat(amount) || 0 };

  logAction('Обновление суммы товаров...', 'info');
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
    if (res.error()) {
      logAction('Ошибка сохранения суммы: ' + getApiErrorMessage(res), 'error');
      showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
    } else {
      logAction('Сумма обновлена', 'success');
      showToast('Сумма обновлена');
      closeModal('modal-edit-amount');
      loadAllData();
    }
  });
}

function submitUpload(e) {
  e.preventDefault();
  const id = document.getElementById('upload-id').value;
  const fileInput = document.getElementById('upload-file');
  const deadline = document.getElementById('upload-deadline').value;

  if (!fileInput.files.length) return showToast('Выберите файл', 'error');
  const file = fileInput.files[0];

  logAction('Чтение файла счета...', 'info');
  const reader = new FileReader();

  reader.onload = function (evt) {
    const base64 = evt.target.result.split(',')[1];
    const targetStageId = getStageIdByName('обработка');
    const fields = {
      [actualFields.deadlinePay]: deadline,
      [actualFields.fileInvoice]: [[file.name, base64]]
    };
    if (targetStageId) fields.stageId = targetStageId;

    logAction('Загрузка счета в CRM (Закупка)...', 'info');
    BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
      if (res.error()) {
        logAction('Ошибка загрузки счета: ' + getApiErrorMessage(res), 'error');
        showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
      } else {
        logAction('Счет загружен в Закупку, стадия изменена', 'success');
        const currentItem = items.find(i => i.id == id);
        if (currentItem) {
          logAction('Создание связанной записи во Входящих счетах...', 'info');
          const invSum = currentItem[actualFields.amountProduct] || 0;
          const invPayFor = currentItem[actualFields.shortDesc] || currentItem.title;
          const invFields = {
            title: `Счет по закупке ${currentItem.title}`,
            [INVOICE_MAPPING.invoiceTitle]: currentItem.title,
            [INVOICE_MAPPING.invoiceSum]: invSum,
            [INVOICE_MAPPING.invoicePayFor]: invPayFor,
            [INVOICE_MAPPING.invoiceFile]: [[file.name, base64]],
            [INVOICE_MAPPING.invoiceDeadline]: deadline
          };
          BX24.callMethod('crm.item.add', { entityTypeId: INVOICE_ENTITY_ID, fields: invFields }, (invRes) => {
            if (invRes.error()) {
              logAction('Ошибка создания счета: ' + getApiErrorMessage(invRes), 'error');
            } else {
              logAction(`Успех: Создан входящий счет (ID: ${invRes.data().item.id})`, 'success');
              showToast('Счет создан во Входящих', 'success');
            }
          });
        }
        closeModal('modal-upload');
        loadAllData();
      }
    });
  };

  reader.readAsDataURL(file);
}