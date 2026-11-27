// js/logic/settings/absence.js — Вкладка "Отсутствия"

function renderUnavailableUsers() {
	const container = document.getElementById('unavailable-users-container');
	if (!container) return;
	container.innerHTML = '';
	const meta = document.getElementById('absence-meta');
	if (meta) {
		meta.textContent = 'Проверено: ' + (localStorage.getItem('b24_absence_check_date') || '—') +
			' · сейчас отсутствуют: ' + ((settings.unavailableUsers || []).length);
	}
	if (!allUsers || !allUsers.length) {
		container.innerHTML = '<p class="empty-note">Список не загружен</p>';
		return;
	}
	const list = (settings.unavailableUsers || []).map(String);
	// ✅ FIX: DocumentFragment + createElement/textContent вместо innerHTML (XSS)
	const fragment = document.createDocumentFragment();
	allUsers.forEach(u => {
		if (String(u.ACTIVE) === 'N') return;
		const checked = list.includes(String(u.ID));
		const deptName = userDepts[u.ID] || '';

		const label = document.createElement('label');
		label.className = 'user-row';

		const input = document.createElement('input');
		input.type = 'checkbox';
		input.className = 'unavail-check';
		input.setAttribute('data-uid', String(u.ID));
		input.checked = checked;

		const nameSpan = document.createElement('span');
		nameSpan.className = 'ur-name';
		nameSpan.textContent = (u.LAST_NAME || '') + ' ' + (u.NAME || '');

		const deptSpan = document.createElement('span');
		deptSpan.className = 'ur-dept';
		deptSpan.textContent = deptName;

		label.appendChild(input);
		label.appendChild(nameSpan);
		label.appendChild(deptSpan);
		fragment.appendChild(label);
	});
	container.appendChild(fragment);
}

function runManualAbsenceCheck() {
	const btn = document.getElementById('btn-absence-check');
	if (btn) { btn.disabled = true; btn.textContent = 'Проверка...'; }
	refreshUnavailableUsersForce(function () {
		if (btn) { btn.disabled = false; btn.textContent = 'Проверить отсутствия сейчас'; }
		renderUnavailableUsers();
		showToast('Проверка отсутствий выполнена', 'success');
	});
}

window.renderUnavailableUsers = renderUnavailableUsers;
window.runManualAbsenceCheck = runManualAbsenceCheck;