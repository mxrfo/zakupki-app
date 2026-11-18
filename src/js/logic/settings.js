// js/settings.js — Панель настроек

// Открытие панели настроек
function openAdminPanel() {
  if (!document.getElementById('modal-settings')) return;
  try {
    document.getElementById('set-entityid').value = settings.entityTypeId;
    document.getElementById('set-invoiceentityid').value = settings.invoiceEntityTypeId;
    document.getElementById('set-categoryid').value = settings.categoryId;
    document.getElementById('set-systemuserid').value = settings.systemUserId || 175;
    document.getElementById('set-clientid').value = settings.clientId || '';
    document.getElementById('set-clientsecret').value = settings.clientSecret || '';
    document.getElementById('set-deadline-red').value = settings.deadlineRedDays;
    document.getElementById('set-deadline-yellow').value = settings.deadlineYellowDays;

    renderSettingsTable();
    renderListDependencies();
    renderMappingSettings();
    renderFieldsStatus();
    renderUnavailableUsers();

    document.getElementById('modal-settings').style.display = 'flex';
  } catch (e) {
    console.error('Ошибка при открытии настроек:', e);
    showToast('Ошибка открытия настроек: ' + e.message, 'error');
  }
}

// ✅ Статус полей CRM: какие маппинги найдены, какие нет
function renderFieldsStatus() {
  const container = document.getElementById('fields-status-container');
  if (!container) return;
  container.innerHTML = '';

  const required = ['manager', 'deptHead', 'approver', 'taskVyborSotr', 'taskSbor', 'taskZagruz', 'delegateHistory', 'combinedDir', 'postponeDate'];
  required.forEach(key => {
    const code = settings.mapping[key];
    const exists = code && fieldDefs[code];
    const status = exists ? '<span style="color:#10b981; font-weight:600;">✓ найдено</span>' : '<span style="color:#ef4444; font-weight:600;">✗ отсутствует</span>';
    container.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border-color);"><span style="font-size:13px;">${key} <code style="font-size:11px; color:#64748b;">${code || '—'}</code></span><span>${status}</span></div>`;
  });
}

// ✅ Создание недостающего технического поля через crm.item.field.add
function createField(key) {
  const code = settings.mapping[key];
  if (!code) {
    showToast('Для поля "' + key + '" не задан код. Укажите код в маппинге.', 'error');
    return;
  }
  if (fieldDefs[code]) {
    showToast('Поле "' + code + '" уже существует', 'info');
    return;
  }
  logAction('Создание поля CRM: ' + code + ' (' + key + ')...', 'info');
  BX24.callMethod('crm.item.field.add', {
    entityTypeId: ENTITY_TYPE_ID,
    fields: {
      name: 'Тех: ' + key,
      code: code,
      type: 'string',
      multiple: 'N',
      isRequired: 'N'
    }
  }, function(res) {
    if (res.error()) {
      logAction('Ошибка создания поля ' + code + ': ' + getApiErrorMessage(res), 'error');
      showToast('Ошибка создания поля: ' + getApiErrorMessage(res), 'error');
    } else {
      logAction('Поле ' + code + ' создано', 'success');
      showToast('Поле создано. Обновите страницу (F5) для подгрузки.', 'success');
    }
  });
}

// ✅ Автонастройка маппинга по названиям полей
function autoMapFields() {
  const titleMap = {
    shortDesc: ['что нужно закупить', 'кратко'],
    amountProduct: ['сумма закупки', 'сумма товаров', 'сумма позиций'],
    amountDelivery: ['доставка'],
    deadlineZakup: ['крайний срок закупки', 'срок закупки'],
    deadlinePay: ['крайний срок оплаты', 'срок оплаты'],
    section: ['раздел направления', 'раздел расхода'],
    direction: ['направление расхода', 'направление'],
    combinedDir: ['раздел+направление', 'раздел + направление'],
    fileInvoice: ['копия сч', 'счёт', 'счет'],
    comment: ['комментарий'],
    postponeDate: ['дата отложения', 'отложить'],
    manager: ['менеджер отдела', 'исполнитель сотрудник'],
    deptHead: ['руководитель отдела', 'отдел исполнителя рук'],
    approver: ['согласующий', 'согласующий сумму']
  };
  let changed = 0;
  for (const key in titleMap) {
    const needles = titleMap[key];
    const found = Object.keys(fieldDefs).find(code => {
      const t = (fieldDefs[code].title || '').toLowerCase().replace(/ё/g, 'е');
      return needles.some(n => t.includes(n));
    });
    if (found && settings.mapping[key] !== found) {
      settings.mapping[key] = found;
      changed++;
    }
  }
  logAction('Автонастройка маппинга: обновлено ' + changed + ' полей', 'info');
  showToast('Автонастройка: ' + changed + ' полей обновлено. Сохраните настройки.', 'success');
  renderMappingSettings();
  renderFieldsStatus();
}

// ✅ Авто-заполнение руководителей отделов из Б24 (UF_HEAD)
function autoFillHeadsFromB24() {
  let filled = 0;
  departments.forEach(d => {
    if (d.UF_HEAD && !settings.deptHeads[d.ID]) {
      settings.deptHeads[d.ID] = String(d.UF_HEAD);
      filled++;
    }
  });
  logAction('Авто-руководители из Б24: заполнено ' + filled, 'info');
  showToast('Заполнено руководителей: ' + filled, 'success');
  renderSettingsTable();
}

// Рендер таблицы ролей отделов
function renderSettingsTable() {
  const tbody = document.querySelector('#dept-roles-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!departments || !allUsers) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Данные не загружены. Обновите страницу.</td></tr>';
    return;
  }

  departments.forEach(d => {
    const isEcon = settings.econDepts.includes(String(d.ID)) ? 'checked' : '';
    const isVisible = settings.visibleDepts.includes(String(d.ID)) ? 'checked' : '';
    const manualHead = settings.deptHeads[d.ID] || '';
    const manualMgr = settings.deptManagers[d.ID] || '';
    const shortName = settings.deptShortNames[d.ID] || '';

    const autoHeadId = d.UF_HEAD;
    const autoHeadName = autoHeadId ? (userNames[autoHeadId] || `Сотрудник`) : null;
    const autoInfo = autoHeadName ? `<span class="auto-head-info">Б24: ${autoHeadName}</span>` : '';

    let userOptions = '<option value="">-- Не выбран --</option>';
    allUsers.forEach(u => {
      userOptions += `<option value="${u.ID}" ${manualHead == u.ID ? 'selected' : ''}>${u.LAST_NAME} ${u.NAME}</option>`;
    });

    let userOptionsMgr = '<option value="">-- Не выбран --</option>';
    allUsers.forEach(u => {
      userOptionsMgr += `<option value="${u.ID}" ${manualMgr == u.ID ? 'selected' : ''}>${u.LAST_NAME} ${u.NAME}</option>`;
    });

    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="font-weight:600; color:#334155; min-width:150px;">${d.NAME} ${autoInfo}</td><td style="min-width:100px;"><input type="text" class="short-input" data-dept="${d.ID}" value="${shortName}" style="width:100px;" placeholder="Сокр. имя"></td><td style="text-align:center;"><input type="checkbox" class="visible-check" data-dept="${d.ID}" ${isVisible} style="width:20px;height:20px;cursor:pointer;"></td><td><select class="head-select" data-dept="${d.ID}">${userOptions}</select></td><td><select class="mgr-select" data-dept="${d.ID}">${userOptionsMgr}</select></td><td style="text-align:center;"><input type="checkbox" class="econ-check" data-dept="${d.ID}" ${isEcon} style="width:20px;height:20px;cursor:pointer;"></td>`;
    tbody.appendChild(tr);
  });
}

// Рендер зависимостей списков
function renderListDependencies() {
  const container = document.getElementById('list-dependencies-container');
  if (!container) return;
  container.innerHTML = '';

  const secDef = fieldDefs[actualFields.section];
  const dirDef = fieldDefs[actualFields.direction];

  if (!secDef || !secDef.items || !dirDef || !dirDef.items) {
    container.innerHTML = '<p style="color:var(--danger)">Не удалось найти поля "Раздел" или "Направление" типа "Список". Проверьте настройки полей в CRM.</p>';
    return;
  }

  secDef.items.forEach(sec => {
    const secId = String(sec.ID);
    const checkedDirs = settings.listDependencies[secId] || [];
    let optionsHtml = '';

    dirDef.items.forEach(dir => {
      const isChecked = checkedDirs.includes(String(dir.ID)) ? 'checked' : '';
      optionsHtml += `<label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;"><input type="checkbox" class="dir-dep-check" data-sec="${secId}" value="${dir.ID}" ${isChecked}> ${dir.VALUE}</label>`;
    });

    container.innerHTML += `<div class="list-dependency-block" style="border:1px solid var(--border-color); border-radius:6px; padding:12px; margin-bottom:12px; background:#f8fafc;"><div style="font-weight:700; color:var(--brand-blue); margin-bottom:8px; font-size:13px;">Раздел: ${sec.VALUE}</div><div style="display:flex; flex-wrap:wrap; gap:12px;">${optionsHtml}</div></div>`;
  });
}

// ✅ Рендер списка недоступных сотрудников (отпуск/больничный)
function renderUnavailableUsers() {
  const container = document.getElementById('unavailable-users-container');
  if (!container) return;
  container.innerHTML = '';
  if (!allUsers || !allUsers.length) {
    container.innerHTML = '<p style="color:#64748b;">Список сотрудников не загружен.</p>';
    return;
  }
  const list = (settings.unavailableUsers || []).map(String);
  allUsers.forEach(u => {
    if (String(u.ACTIVE) === 'N') return;
    const checked = list.includes(String(u.ID)) ? 'checked' : '';
    const deptName = userDepts[u.ID] || '';
    container.innerHTML += `<label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; padding:4px 0;"><input type="checkbox" class="unavail-check" data-uid="${u.ID}" ${checked}> ${u.LAST_NAME} ${u.NAME} <span style="color:#94a3b8; font-size:11px;">${deptName}</span></label>`;
  });
}

// Рендер настроек маппинга полей
function renderMappingSettings() {
  const container = document.getElementById('mapping-container');
  if (!container) return;
  container.innerHTML = '';

  const fieldsToMap = [
    { key: 'shortDesc', label: 'Что закупить (Кратко)' },
    { key: 'amountProduct', label: 'Сумма товаров' },
    { key: 'amountDelivery', label: 'Сумма доставки' },
    { key: 'deadlineZakup', label: 'Крайний срок закупки' },
    { key: 'deadlinePay', label: 'Крайний срок оплаты' },
    { key: 'section', label: 'Раздел (Список)' },
    { key: 'direction', label: 'Направление (Список)' },
    { key: 'combinedDir', label: 'Раздел+Направление (Строка)' },
    { key: 'fileInvoice', label: 'Копия счета (Файл)' },
    { key: 'comment', label: 'Комментарий' },
    { key: 'postponeDate', label: 'Дата отложения' },
    { key: 'detailName', label: 'Детализация: Наименование (Список)' },
    { key: 'detailPurpose', label: 'Детализация: Цель (Список)' },
    { key: 'detailPrice', label: 'Детализация: Цена за 1 шт. (Список)' },
    { key: 'detailQty', label: 'Детализация: Количество (Список)' },
    { key: 'detailLink', label: 'Детализация: Ссылка (Список)' },
    { key: 'manager', label: 'Менеджер отдела (Привязка к сотруднику)' },
    { key: 'deptHead', label: 'Руководитель отдела-исполнителя' },
    { key: 'approver', label: 'Согласующий сумму' },
    { key: 'taskVyborSotr', label: '[Тех] ID задачи по выбору сотрудника' },
    { key: 'taskSbor', label: '[Тех] ID задачи по сбору данных' },
    { key: 'taskZagruz', label: '[Тех] ID задачи по загрузке счёта' },
    { key: 'delegateHistory', label: '[Тех] История делегирований' }
  ];

  fieldsToMap.forEach(f => {
    let options = '<option value="">-- Не выбрано --</option>';
    Object.keys(fieldDefs).forEach(code => {
      if (['id', 'xmlId', 'createdTime', 'updatedTime', 'createdBy', 'updatedBy', 'opened', 'webformId', 'assignedById', 'categoryId', 'previousStageId', 'movedTime', 'movedBy'].includes(code)) return;
      const isSel = settings.mapping[f.key] === code ? 'selected' : '';
      options += `<option value="${code}" ${isSel}>${fieldDefs[code].title} (${code})</option>`;
    });
    const exists = settings.mapping[f.key] && fieldDefs[settings.mapping[f.key]];
    const badge = exists ? '<span style="color:#10b981; font-size:11px; margin-left:6px;">✓</span>' : '<span style="color:#ef4444; font-size:11px; margin-left:6px;">✗</span>';
    container.innerHTML += `<div class="form-group" style="margin-bottom:12px;"><label>${f.label}${badge}</label><select class="map-select" data-key="${f.key}">${options}</select></div>`;
  });
}

// Сохранение настроек
function saveSettings() {
  settings.entityTypeId = parseInt(document.getElementById('set-entityid').value) || 1072;
  settings.invoiceEntityTypeId = parseInt(document.getElementById('set-invoiceentityid').value) || 15;
  settings.categoryId = parseInt(document.getElementById('set-categoryid').value) || 65;
  settings.systemUserId = parseInt(document.getElementById('set-systemuserid').value) || 175;
  settings.clientId = document.getElementById('set-clientid').value.trim();
  settings.clientSecret = document.getElementById('set-clientsecret').value.trim();
  settings.deadlineRedDays = parseInt(document.getElementById('set-deadline-red').value) || 3;
  settings.deadlineYellowDays = parseInt(document.getElementById('set-deadline-yellow').value) || 7;

  settings.deptHeads = {};
  settings.deptManagers = {};
  settings.deptShortNames = {};
  settings.visibleDepts = [];
  settings.econDepts = [];
  settings.listDependencies = {};
  settings.mapping = {};
  settings.unavailableUsers = [];

  document.querySelectorAll('.short-input').forEach(inp => {
    if (inp.value.trim()) settings.deptShortNames[inp.getAttribute('data-dept')] = inp.value.trim();
  });
  document.querySelectorAll('.visible-check').forEach(chk => {
    if (chk.checked) settings.visibleDepts.push(chk.getAttribute('data-dept'));
  });
  document.querySelectorAll('.head-select').forEach(sel => {
    if (sel.value) settings.deptHeads[sel.getAttribute('data-dept')] = sel.value;
  });
  document.querySelectorAll('.mgr-select').forEach(sel => {
    if (sel.value) settings.deptManagers[sel.getAttribute('data-dept')] = sel.value;
  });
  document.querySelectorAll('.econ-check').forEach(chk => {
    if (chk.checked) settings.econDepts.push(chk.getAttribute('data-dept'));
  });
  document.querySelectorAll('.dir-dep-check').forEach(chk => {
    if (chk.checked) {
      const secId = chk.getAttribute('data-sec');
      const dirId = chk.value;
      if (!settings.listDependencies[secId]) settings.listDependencies[secId] = [];
      settings.listDependencies[secId].push(dirId);
    }
  });
  document.querySelectorAll('.map-select').forEach(sel => {
    if (sel.value) settings.mapping[sel.getAttribute('data-key')] = sel.value;
  });
  document.querySelectorAll('.unavail-check').forEach(chk => {
    if (chk.checked) settings.unavailableUsers.push(chk.getAttribute('data-uid'));
  });

  logAction('Сохранение настроек...', 'info');
  BX24.callMethod('app.option.set', { options: { settings: JSON.stringify(settings) } }, (res) => {
    if (res.error()) {
      logAction('Ошибка сохранения настроек: ' + getApiErrorMessage(res), 'error');
      showToast('Ошибка сохранения: ' + getApiErrorMessage(res), 'error');
    } else {
      logAction('Настройки успешно сохранены', 'success');
      showToast('Настройки успешно сохранены');
      setTimeout(() => location.reload(), 1000);
    }
  });
}