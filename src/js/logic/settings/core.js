// js/logic/settings/core.js — Ядро панели настроек (переключение вкладок, открытие, сохранение)

var adminActiveTab = 'main';

function switchAdminTab(tab) {
  adminActiveTab = tab;
  document.querySelectorAll('.admin-tab').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
  document.querySelectorAll('.admin-panel').forEach(function (p) {
    p.classList.toggle('active', p.getAttribute('data-panel') === tab);
  });
  if (tab === 'bot') renderBotStatus();
  if (tab === 'absence') renderUnavailableUsers();
}

function openAdminPanel() {
  if (!document.getElementById('modal-settings')) return;
  try {
    document.getElementById('set-entityid').value = settings.entityTypeId;
    document.getElementById('set-categoryid').value = settings.categoryId;
    document.getElementById('set-systemuserid').value = settings.systemUserId || 175;
    document.getElementById('set-clientid').value = settings.clientId || '';
    document.getElementById('set-clientsecret').value = settings.clientSecret || '';
    document.getElementById('set-chatid').value = settings.chatId || '';
    document.getElementById('set-botid').value = settings.botId || '';
    document.getElementById('set-bothandler').value = settings.botHandler || '';
    document.getElementById('set-absence-field').value = settings.absenceField || '';
    document.getElementById('set-absence-values').value = settings.absenceValues || 'отпуск,больничный,командировка';
    document.getElementById('set-deadline-red').value = settings.deadlineRedDays;
    document.getElementById('set-deadline-yellow').value = settings.deadlineYellowDays;
    renderSettingsTable();
    renderListDependencies();
    renderMappingSettings();
    renderFieldsStatus();
    renderUnavailableUsers();
    renderBotStatus();
    switchAdminTab('main');
    document.getElementById('modal-settings').style.display = 'flex';
  } catch (e) { console.error('Ошибка открытия настроек:', e); showToast('Ошибка: ' + e.message, 'error'); }
}

function saveSettings() {
  settings.entityTypeId = parseInt(document.getElementById('set-entityid').value) || 1072;
  settings.categoryId = parseInt(document.getElementById('set-categoryid').value) || 65;
  settings.systemUserId = parseInt(document.getElementById('set-systemuserid').value) || 175;
  settings.clientId = document.getElementById('set-clientid').value.trim();
  settings.clientSecret = document.getElementById('set-clientsecret').value.trim();
  settings.chatId = document.getElementById('set-chatid').value.trim();
  settings.botId = document.getElementById('set-botid').value.trim();
  settings.botHandler = document.getElementById('set-bothandler').value.trim();
  settings.absenceField = document.getElementById('set-absence-field').value.trim();
  settings.absenceValues = document.getElementById('set-absence-values').value.trim();
  settings.deadlineRedDays = parseInt(document.getElementById('set-deadline-red').value) || 3;
  settings.deadlineYellowDays = parseInt(document.getElementById('set-deadline-yellow').value) || 7;
  settings.deptHeads = {}; settings.deptManagers = {}; settings.deptShortNames = {}; settings.visibleDepts = []; settings.econDepts = []; settings.listDependencies = {}; settings.mapping = {}; settings.unavailableUsers = [];
  document.querySelectorAll('.short-input').forEach(inp => { if (inp.value.trim()) settings.deptShortNames[inp.getAttribute('data-dept')] = inp.value.trim(); });
  document.querySelectorAll('.visible-check').forEach(chk => { if (chk.checked) settings.visibleDepts.push(chk.getAttribute('data-dept')); });
  document.querySelectorAll('.head-select').forEach(sel => { if (sel.value) settings.deptHeads[sel.getAttribute('data-dept')] = sel.value; });
  document.querySelectorAll('.mgr-select').forEach(sel => { if (sel.value) settings.deptManagers[sel.getAttribute('data-dept')] = sel.value; });
  document.querySelectorAll('.econ-check').forEach(chk => { if (chk.checked) settings.econDepts.push(chk.getAttribute('data-dept')); });
  document.querySelectorAll('.dir-dep-check').forEach(chk => { if (chk.checked) { const secId = chk.getAttribute('data-sec'); const dirId = chk.value; if (!settings.listDependencies[secId]) settings.listDependencies[secId] = []; settings.listDependencies[secId].push(dirId); } });
  document.querySelectorAll('.map-select').forEach(sel => { if (sel.value) settings.mapping[sel.getAttribute('data-key')] = sel.value; });
  document.querySelectorAll('.unavail-check').forEach(chk => { if (chk.checked) settings.unavailableUsers.push(chk.getAttribute('data-uid')); });
  logAction('Сохранение настроек...', 'info');
  BX24.callMethod('app.option.set', { options: { settings: JSON.stringify(settings) } }, (res) => {
    if (res.error()) { showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); }
    else { showToast('Настройки сохранены'); setTimeout(() => location.reload(), 1000); }
  });
}

window.switchAdminTab = switchAdminTab;
window.openAdminPanel = openAdminPanel;
window.saveSettings = saveSettings;