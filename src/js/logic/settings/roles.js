// js/logic/settings/roles.js — Вкладка "Роли отделов"

function renderSettingsTable() {
	const tbody = document.querySelector('#dept-roles-table tbody');
	if (!tbody) return;
	tbody.innerHTML = '';
	if (!departments || !allUsers) {
		tbody.innerHTML = '<tr><td colspan="6">Данные не загружены</td></tr>';
		return;
	}
	// ✅ FIX: DocumentFragment + createElement/textContent вместо innerHTML с пользовательскими данными (XSS)
	const fragment = document.createDocumentFragment();
	departments.forEach(d => {
		const isEcon = settings.econDepts.includes(String(d.ID));
		const isVisible = settings.visibleDepts.includes(String(d.ID));
		const manualHead = settings.deptHeads[d.ID] || '';
		const manualMgr = settings.deptManagers[d.ID] || '';
		const shortName = settings.deptShortNames[d.ID] || '';
		const autoHeadId = d.UF_HEAD;
		const autoHeadName = autoHeadId ? (userNames[autoHeadId] || 'Сотрудник') : null;

		const tr = document.createElement('tr');

		// ── Отдел (d.NAME + авто-руководитель из Б24) ──
		const tdName = document.createElement('td');
		tdName.className = 'dept-name';
		tdName.appendChild(document.createTextNode(String(d.NAME || '')));
		if (autoHeadName) {
			tdName.appendChild(document.createTextNode(' '));
			const span = document.createElement('span');
			span.className = 'dept-auto';
			span.textContent = 'Б24: ' + autoHeadName;
			tdName.appendChild(span);
		}
		tr.appendChild(tdName);

		// ── Краткое имя ──
		const tdShort = document.createElement('td');
		const inpShort = document.createElement('input');
		inpShort.type = 'text';
		inpShort.className = 'short-input';
		inpShort.setAttribute('data-dept', String(d.ID));
		inpShort.value = shortName;
		tdShort.appendChild(inpShort);
		tr.appendChild(tdShort);

		// ── Выводить ──
		const tdVisible = document.createElement('td');
		tdVisible.className = 'tc';
		const chkVisible = document.createElement('input');
		chkVisible.type = 'checkbox';
		chkVisible.className = 'visible-check';
		chkVisible.setAttribute('data-dept', String(d.ID));
		chkVisible.checked = isVisible;
		tdVisible.appendChild(chkVisible);
		tr.appendChild(tdVisible);

		// ── Руководитель (ФИО сотрудников через textContent) ──
		const tdHead = document.createElement('td');
		const selHead = document.createElement('select');
		selHead.className = 'head-select';
		selHead.setAttribute('data-dept', String(d.ID));
		const optEmptyHead = document.createElement('option');
		optEmptyHead.value = '';
		optEmptyHead.textContent = '-- Не выбран --';
		selHead.appendChild(optEmptyHead);
		allUsers.forEach(u => {
			const opt = document.createElement('option');
			opt.value = String(u.ID);
			opt.textContent = (u.LAST_NAME || '') + ' ' + (u.NAME || '');
			if (String(manualHead) === String(u.ID)) opt.selected = true;
			selHead.appendChild(opt);
		});
		tdHead.appendChild(selHead);
		tr.appendChild(tdHead);

		// ── Менеджер по умолчанию ──
		const tdMgr = document.createElement('td');
		const selMgr = document.createElement('select');
		selMgr.className = 'mgr-select';
		selMgr.setAttribute('data-dept', String(d.ID));
		const optEmptyMgr = document.createElement('option');
		optEmptyMgr.value = '';
		optEmptyMgr.textContent = '-- Не выбран --';
		selMgr.appendChild(optEmptyMgr);
		allUsers.forEach(u => {
			const opt = document.createElement('option');
			opt.value = String(u.ID);
			opt.textContent = (u.LAST_NAME || '') + ' ' + (u.NAME || '');
			if (String(manualMgr) === String(u.ID)) opt.selected = true;
			selMgr.appendChild(opt);
		});
		tdMgr.appendChild(selMgr);
		tr.appendChild(tdMgr);

		// ── Экономисты? ──
		const tdEcon = document.createElement('td');
		tdEcon.className = 'tc';
		const chkEcon = document.createElement('input');
		chkEcon.type = 'checkbox';
		chkEcon.className = 'econ-check';
		chkEcon.setAttribute('data-dept', String(d.ID));
		chkEcon.checked = isEcon;
		tdEcon.appendChild(chkEcon);
		tr.appendChild(tdEcon);

		fragment.appendChild(tr);
	});
	tbody.appendChild(fragment);
}

function autoFillHeadsFromB24() {
	let filled = 0;
	departments.forEach(d => {
		if (d.UF_HEAD && !settings.deptHeads[d.ID]) {
			settings.deptHeads[d.ID] = String(d.UF_HEAD);
			filled++;
		}
	});
	showToast('Заполнено: ' + filled, 'success');
	renderSettingsTable();
}

window.renderSettingsTable = renderSettingsTable;
window.autoFillHeadsFromB24 = autoFillHeadsFromB24;
