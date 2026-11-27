// ============================================================
// МОДУЛЬ: roles.js
// ============================================================
// js/logic/roles.js — Роли и права доступа

// 🆕 Отдел, за которым «симулируется» руководитель (для currentRole==='head')
let simulatedHeadDeptId = '';

function toggleTestMode(val) {
	isTestMode = val;
	localStorage.setItem('purchase_test_mode', isTestMode);
	logAction(isTestMode ? 'Включен режим тестирования' : 'Выключен режим тестирования', 'info');
	showToast(isTestMode ? 'Режим тестирования ВКЛ' : 'Режим тестирования ВЫКЛ');
	render();
}

// ✅ Является ли текущий пользователь руководителем хотя бы одного отдела (по настройкам или UF_HEAD)?
function isRealDeptHead() {
	if (!currentUser) return false;
	const uid = String(currentUser.ID);
	const heads = settings.deptHeads || {};
	for (const k in heads) { if (String(heads[k]) === uid) return true; }
	for (const d of departments) { if (d.UF_HEAD && String(d.UF_HEAD) === uid) return true; }
	return false;
}

// ✅ Первый отдел, которым руководит пользователь (для симуляции head)
function getFirstManagedDeptId() {
	if (!currentUser) return '';
	const uid = String(currentUser.ID);
	const heads = settings.deptHeads || {};
	for (const k in heads) { if (String(heads[k]) === uid) return String(k); }
	for (const d of departments) { if (d.UF_HEAD && String(d.UF_HEAD) === uid) return String(d.ID); }
	return '';
}

function checkUserRoles() {
	if (!currentUser) return;
	actualRoles.isEcon = actualRoles.isAdmin;
	let userDeptIds = currentUser.UF_DEPARTMENT || [];
	if (!Array.isArray(userDeptIds)) userDeptIds = userDeptIds ? [userDeptIds] : [];
	userDeptIds.forEach(dId => {
		if (settings.econDepts.includes(String(dId))) actualRoles.isEcon = true;
	});
	actualRoles.isHead = isRealDeptHead();
	const rv = document.getElementById('role-viewer');
	if (!rv.value || rv.value === 'admin') {
		currentRole = actualRoles.isAdmin ? 'admin' : (actualRoles.isEcon ? 'econ' : (actualRoles.isHead ? 'head' : 'employee'));
		rv.value = currentRole;
	}
	if (currentRole === 'head' && !simulatedHeadDeptId) {
		simulatedHeadDeptId = getFirstManagedDeptId() || (userDeptIds[0] ? String(userDeptIds[0]) : '');
	}
	let roleName = 'Сотрудник';
	if (currentRole === 'admin') roleName = 'Администратор';
	else if (currentRole === 'econ') roleName = 'Экономист';
	else if (currentRole === 'manager') roleName = 'Менеджер';
	else if (currentRole === 'head') roleName = 'Руководитель';
	let userDeptName = userDepts[currentUser.ID] || '';
	if (userDeptIds.length > 0 && !userDeptName) {
		const firstDeptId = userDeptIds[0];
		userDeptName = settings.deptShortNames[firstDeptId] || (departments.find(d => String(d.ID) === String(firstDeptId))?.NAME || '');
	}
	// ✅ FIX: экранирование всех пользовательских данных перед вставкой в innerHTML (XSS)
	const userDisplay = document.getElementById('user-display');
	if (userDisplay) {
		userDisplay.innerHTML =
			`<b>${escapeHtml(currentUser.NAME)} ${escapeHtml(currentUser.LAST_NAME)}</b> ` +
			`(${escapeHtml(roleName)}${userDeptName ? ' • ' + escapeHtml(userDeptName) : ''})`;
	}
}

// ✅ Симуляция роли: для head подставляем ведомый отдел
function simulateRole(role) {
	currentRole = role;
	if (role === 'head') {
		let d = getFirstManagedDeptId();
		if (!d) {
			d = currentUser && currentUser.UF_DEPARTMENT ? (Array.isArray(currentUser.UF_DEPARTMENT) ? currentUser.UF_DEPARTMENT[0] : currentUser.UF_DEPARTMENT) : '';
		}
		if (!d && settings.visibleDepts && settings.visibleDepts.length) d = settings.visibleDepts[0];
		simulatedHeadDeptId = d ? String(d) : '';
	} else {
		simulatedHeadDeptId = '';
	}
	checkUserRoles();
	render();
}

function isManagerRole(item) {
	if (currentRole === 'admin') return true;
	if (currentRole === 'manager') return true;
	const mgrVal = item[actualFields.manager];
	const mgrIds = Array.isArray(mgrVal) ? mgrVal : (mgrVal ? [mgrVal] : []);
	if (mgrIds.some(id => String(id) === String(currentUser.ID))) return true;
	const deptVal = item[actualFields.dept];
	if (deptVal) {
		const deptId = Array.isArray(deptVal) ? deptVal[0] : deptVal;
		if (settings.deptHeads[deptId] === String(currentUser.ID)) return true;
		if (settings.deptManagers[deptId] === String(currentUser.ID)) return true;
		const deptObj = departments.find(d => String(d.ID) === String(deptId));
		if (deptObj && String(deptObj.UF_HEAD) === String(currentUser.ID)) return true;
	}
	return false;
}

window.toggleTestMode = toggleTestMode;
window.checkUserRoles = checkUserRoles;
window.simulateRole = simulateRole;
window.isManagerRole = isManagerRole;
// ============================================================
// КОНЕЦ МОДУЛЯ: logic/roles.js
// ============================================================