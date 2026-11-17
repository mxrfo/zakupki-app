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

    document.getElementById('modal-settings').style.display = 'flex';
  } catch (e) {
    console.error('Ошибка при открытии настроек:', e);
    showToast('Ошибка открытия настроек: ' + e.message, 'error');
  }
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
    // 🆕 Новые поля
    { key: 'manager', label: 'Менеджер отдела (Привязка к сотруднику)' },
    { key: 'deptHead', label: 'Руководитель отдела-исполнителя' },
    { key: 'approver', label: 'Согласующий сумму' },
    { key: 'taskVyborSotr', label: '[Тех] ID задачи по выбору сотрудника' },
    { key: 'taskSbor', label: '[Тех] ID задачи по сбору данных' },
    { key: 'taskZagruz', label: '[Тех] ID задачи по загрузке счёта' }
  ];

  fieldsToMap.forEach(f => {
    let options = '<option value="">-- Не выбрано --</option>';
    Object.keys(fieldDefs).forEach(code => {
      if (['id', 'xmlId', 'createdTime', 'updatedTime', 'createdBy', 'updatedBy', 'opened', 'webformId', 'assignedById', 'categoryId', 'previousStageId', 'movedTime', 'movedBy'].includes(code)) return;
      const isSel = settings.mapping[f.key] === code ? 'selected' : '';
      options += `<option value="${code}" ${isSel}>${fieldDefs[code].title} (${code})</option>`;
    });
    container.innerHTML += `<div class="form-group" style="margin-bottom:12px;"><label>${f.label}</label><select class="map-select" data-key="${f.key}">${options}</select></div>`;
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