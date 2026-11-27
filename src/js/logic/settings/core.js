// ============================================================
// МОДУЛЬ: core.js (settings)
// ============================================================
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

// ✅ Единая функция сохранения в app.option + localStorage
function saveSettingsToBoth() {
	const json = JSON.stringify(settings);
	try { localStorage.setItem('purchase_settings_backup', json); } catch (e) {}
	BX24.callMethod('app.option.set', { options: { settings: json } }, function (res) {
		if (res && res.error()) logAction('Ошибка сохранения в app.option: ' + getApiErrorMessage(res), 'error');
		else logAction('Настройки сохранены в app.option + localStorage', 'success');
	});
}

// ✅ Безопасный парсинг числа с дефолтом
function safeInt(v, def) {
	const n = parseInt(v, 10);
	return Number.isFinite(n) ? n : def;
}

function saveSettings() {
	// ✅ FIX: НЕ сбрасываем объекты настроек. Собираем только то, что реально есть в DOM
	// (т.е. только из отрендеренных вкладок). Если вкладка не открывалась — её данные сохраняются.
	settings.entityTypeId = safeInt(document.getElementById('set-entityid').value, 1072);
	settings.categoryId = safeInt(document.getElementById('set-categoryid').value, 65);
	settings.systemUserId = safeInt(document.getElementById('set-systemuserid').value, 175);
	settings.clientId = document.getElementById('set-clientid').value.trim();
	settings.clientSecret = document.getElementById('set-clientsecret').value.trim();
	settings.chatId = document.getElementById('set-chatid').value.trim();
	settings.botId = document.getElementById('set-botid').value.trim();
	settings.botHandler = document.getElementById('set-bothandler').value.trim();
	settings.absenceField = document.getElementById('set-absence-field').value.trim();
	settings.absenceValues = document.getElementById('set-absence-values').value.trim();
	settings.deadlineRedDays = safeInt(document.getElementById('set-deadline-red').value, 3);
	settings.deadlineYellowDays = safeInt(document.getElementById('set-deadline-yellow').value, 7);

	// ✅ FIX: собираем только из DOM, не трогая остальные поля
	// Роли отделов — только если таблица отрендерена
	const shortInputs = document.querySelectorAll('.short-input');
	if (shortInputs.length > 0) {
		settings.deptShortNames = {};
		shortInputs.forEach(inp => { if (inp.value.trim()) settings.deptShortNames[inp.getAttribute('data-dept')] = inp.value.trim(); });
	}
	const visibleChecks = document.querySelectorAll('.visible-check');
	if (visibleChecks.length > 0) {
		settings.visibleDepts = [];
		visibleChecks.forEach(chk => { if (chk.checked) settings.visibleDepts.push(chk.getAttribute('data-dept')); });
	}
	const headSelects = document.querySelectorAll('.head-select');
	if (headSelects.length > 0) {
		settings.deptHeads = {};
		headSelects.forEach(sel => { if (sel.value) settings.deptHeads[sel.getAttribute('data-dept')] = sel.value; });
	}
	const mgrSelects = document.querySelectorAll('.mgr-select');
	if (mgrSelects.length > 0) {
		settings.deptManagers = {};
		mgrSelects.forEach(sel => { if (sel.value) settings.deptManagers[sel.getAttribute('data-dept')] = sel.value; });
	}
	const econChecks = document.querySelectorAll('.econ-check');
	if (econChecks.length > 0) {
		settings.econDepts = [];
		econChecks.forEach(chk => { if (chk.checked) settings.econDepts.push(chk.getAttribute('data-dept')); });
	}

	// Связи списков — только если контейнер отрендерен
	const dirDepChecks = document.querySelectorAll('.dir-dep-check');
	if (dirDepChecks.length > 0) {
		settings.listDependencies = {};
		dirDepChecks.forEach(chk => {
			if (chk.checked) {
				const secId = chk.getAttribute('data-sec');
				const dirId = chk.value;
				if (!settings.listDependencies[secId]) settings.listDependencies[secId] = [];
				settings.listDependencies[secId].push(dirId);
			}
		});
	}

	// Маппинг полей CRM — только если отрендерен
	const mapSelects = document.querySelectorAll('.map-select');
	if (mapSelects.length > 0) {
		settings.mapping = {};
		mapSelects.forEach(sel => { if (sel.value) settings.mapping[sel.getAttribute('data-key')] = sel.value; });
	}

	// Отсутствия — только если отрендерены
	const unavailChecks = document.querySelectorAll('.unavail-check');
	if (unavailChecks.length > 0) {
		settings.unavailableUsers = [];
		unavailChecks.forEach(chk => { if (chk.checked) settings.unavailableUsers.push(chk.getAttribute('data-uid')); });
	}

	logAction('Сохранение настроек...', 'info');
	saveSettingsToBoth();
	showToast('Настройки сохранены');
	closeModal('modal-settings');
}

// ✅ FIX: createField теперь использует xmlId вместо code (BX24 REST API)
function createField(key) {
	const code = settings.mapping[key];
	if (!code) { showToast('Для поля "' + key + '" не задан код', 'error'); return; }
	if (fieldDefs[code]) { showToast('Поле "' + code + '" уже существует', 'info'); return; }
	logAction('Создание поля: ' + code, 'info');
	BX24.callMethod('crm.item.field.add', {
		entityTypeId: ENTITY_TYPE_ID,
		fields: {
			name: 'Тех: ' + key,
			xmlId: code,
			type: 'string',
			multiple: 'N',
			isRequired: 'N'
		}
	}, function(res) {
		if (res.error()) { showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); }
		else { showToast('Поле создано. Обновите страницу (F5).', 'success'); }
	});
}

window.switchAdminTab = switchAdminTab;
window.openAdminPanel = openAdminPanel;
window.saveSettings = saveSettings;
window.createField = createField;
// ============================================================
// КОНЕЦ МОДУЛЯ: core.js (settings)
// ============================================================