// js/logic/settings/roles.js — Вкладка "Роли отделов"

function renderSettingsTable() {
  const tbody = document.querySelector('#dept-roles-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!departments || !allUsers) { tbody.innerHTML = '<tr><td colspan="6">Данные не загружены</td></tr>'; return; }
  departments.forEach(d => {
    const isEcon = settings.econDepts.includes(String(d.ID)) ? 'checked' : '';
    const isVisible = settings.visibleDepts.includes(String(d.ID)) ? 'checked' : '';
    const manualHead = settings.deptHeads[d.ID] || '';
    const manualMgr = settings.deptManagers[d.ID] || '';
    const shortName = settings.deptShortNames[d.ID] || '';
    const autoHeadId = d.UF_HEAD;
    const autoHeadName = autoHeadId ? (userNames[autoHeadId] || 'Сотрудник') : null;
    const autoInfo = autoHeadName ? `<span class="dept-auto">Б24: ${autoHeadName}</span>` : '';
    let userOptions = '<option value="">-- Не выбран --</option>';
    allUsers.forEach(u => { userOptions += `<option value="${u.ID}" ${manualHead == u.ID ? 'selected' : ''}>${u.LAST_NAME} ${u.NAME}</option>`; });
    let userOptionsMgr = '<option value="">-- Не выбран --</option>';
    allUsers.forEach(u => { userOptionsMgr += `<option value="${u.ID}" ${manualMgr == u.ID ? 'selected' : ''}>${u.LAST_NAME} ${u.NAME}</option>`; });
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="dept-name">${d.NAME} ${autoInfo}</td><td><input type="text" class="short-input" data-dept="${d.ID}" value="${shortName}"></td><td class="tc"><input type="checkbox" class="visible-check" data-dept="${d.ID}" ${isVisible}></td><td><select class="head-select" data-dept="${d.ID}">${userOptions}</select></td><td><select class="mgr-select" data-dept="${d.ID}">${userOptionsMgr}</select></td><td class="tc"><input type="checkbox" class="econ-check" data-dept="${d.ID}" ${isEcon}></td>`;
    tbody.appendChild(tr);
  });
}

function autoFillHeadsFromB24() {
  let filled = 0;
  departments.forEach(d => { if (d.UF_HEAD && !settings.deptHeads[d.ID]) { settings.deptHeads[d.ID] = String(d.UF_HEAD); filled++; } });
  showToast('Заполнено: ' + filled, 'success');
  renderSettingsTable();
}

window.renderSettingsTable = renderSettingsTable;
window.autoFillHeadsFromB24 = autoFillHeadsFromB24;