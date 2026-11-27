// ============================================================
// МОДУЛЬ: crm.js
// ============================================================
// js/logic/settings/crm.js — Вкладка "Поля CRM"

function renderFieldsStatus() {
	const container = document.getElementById('fields-status-container');
	if (!container) return;
	container.innerHTML = '';
	const required = ['manager', 'deptHead', 'approver', 'taskVyborSotr', 'taskSbor', 'taskZagruz', 'delegateHistory', 'combinedDir', 'postponeDate', 'detailSupplier', 'section', 'direction', 'creator', 'comment', 'fileInvoice', 'deadlineZakup', 'deadlinePay'];
	// ✅ FIX: DocumentFragment + createElement/textContent вместо innerHTML (XSS)
	const fragment = document.createDocumentFragment();
	required.forEach(key => {
		const code = settings.mapping[key];
		const exists = code && fieldDefs[code];

		const row = document.createElement('div');
		row.className = 'field-status-row';

		const nameSpan = document.createElement('span');
		nameSpan.className = 'fs-name';
		nameSpan.textContent = key + ' ';
		const codeChip = document.createElement('code');
		codeChip.textContent = code || '—';
		nameSpan.appendChild(codeChip);

		const badge = document.createElement('span');
		badge.className = 'fs-badge ' + (exists ? 'ok' : 'bad');
		badge.textContent = exists ? '✓' : '✗';

		row.appendChild(nameSpan);
		row.appendChild(badge);
		fragment.appendChild(row);
	});
	container.appendChild(fragment);
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

function autoMapFields() {
	const titleMap = {
		shortDesc: ['что нужно закупить', 'кратко'],
		amountProduct: ['сумма закупки', 'сумма товаров'],
		amountDelivery: ['доставка'],
		deadlineZakup: ['крайний срок закупки'],
		deadlinePay: ['крайний срок оплаты'],
		section: ['раздел направления', 'раздел расхода'],
		direction: ['направление расхода'],
		combinedDir: ['раздел+направление', 'раздел + направление'],
		fileInvoice: ['копия сч', 'счёт'],
		comment: ['комментарий'],
		postponeDate: ['дата отложения'],
		manager: ['менеджер отдела', 'исполнитель'],
		deptHead: ['руководитель отдела'],
		approver: ['согласующий'],
		detailSupplier: ['поставщик', 'supplier'],
		creator: ['кто создал', 'создал запрос', 'автор запроса']
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
	logAction('Автонастройка: ' + changed + ' полей', 'info');
	showToast('Автонастройка: ' + changed + ' полей. Сохраните.', 'success');
	renderMappingSettings();
	renderFieldsStatus();
}

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
		{ key: 'section', label: 'Раздел' },
		{ key: 'direction', label: 'Направление' },
		{ key: 'combinedDir', label: 'Раздел+Направление' },
		{ key: 'fileInvoice', label: 'Копия счета' },
		{ key: 'comment', label: 'Комментарий' },
		{ key: 'postponeDate', label: 'Дата отложения' },
		{ key: 'detailName', label: 'Детализация: Наименование' },
		{ key: 'detailPurpose', label: 'Детализация: Цель' },
		{ key: 'detailSupplier', label: 'Детализация: Поставщик' },
		{ key: 'detailPrice', label: 'Детализация: Цена' },
		{ key: 'detailQty', label: 'Детализация: Количество' },
		{ key: 'detailLink', label: 'Детализация: Ссылка' },
		{ key: 'manager', label: 'Менеджер отдела' },
		{ key: 'deptHead', label: 'Руководитель отдела' },
		{ key: 'approver', label: 'Согласующий' },
		{ key: 'creator', label: 'Кто создал запрос' },
		{ key: 'taskVyborSotr', label: '[Тех] ID задачи выбора сотрудника' },
		{ key: 'taskSbor', label: '[Тех] ID задачи сбора' },
		{ key: 'taskZagruz', label: '[Тех] ID задачи загрузки' },
		{ key: 'delegateHistory', label: '[Тех] История делегирований' }
	];
	// ✅ FIX: DocumentFragment + createElement/textContent вместо innerHTML (XSS)
	const fragment = document.createDocumentFragment();
	const skipCodes = ['id', 'xmlId', 'createdTime', 'updatedTime', 'createdBy', 'updatedBy', 'opened', 'webformId', 'assignedById', 'categoryId', 'previousStageId', 'movedTime', 'movedBy'];

	fieldsToMap.forEach(f => {
		const item = document.createElement('div');
		item.className = 'map-item';

		const label = document.createElement('label');
		label.textContent = f.label + ' ';
		const exists = settings.mapping[f.key] && fieldDefs[settings.mapping[f.key]];
		const status = document.createElement('span');
		status.className = exists ? 'ok' : 'bad';
		status.textContent = exists ? '✓' : '✗';
		label.appendChild(status);

		const select = document.createElement('select');
		select.className = 'map-select';
		select.setAttribute('data-key', f.key);

		const optEmpty = document.createElement('option');
		optEmpty.value = '';
		optEmpty.textContent = '-- Не выбрано --';
		select.appendChild(optEmpty);

		Object.keys(fieldDefs).forEach(code => {
			if (skipCodes.includes(code)) return;
			const opt = document.createElement('option');
			opt.value = code;
			opt.textContent = fieldDefs[code].title + ' (' + code + ')';
			if (settings.mapping[f.key] === code) opt.selected = true;
			select.appendChild(opt);
		});

		item.appendChild(label);
		item.appendChild(select);
		fragment.appendChild(item);
	});
	container.appendChild(fragment);
}

window.renderFieldsStatus = renderFieldsStatus;
window.createField = createField;
window.autoMapFields = autoMapFields;
window.renderMappingSettings = renderMappingSettings;
// ============================================================
// КОНЕЦ МОДУЛЯ: settings/crm.js
// ============================================================