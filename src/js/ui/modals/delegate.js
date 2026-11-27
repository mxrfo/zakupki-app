// js/ui/modals/delegate.js — Модалка делегирования закупки

function openDelegateModal(id) {
	const item = items.find(i => i.id === id);
	if (!item) return;
	document.getElementById('delegate-id').value = id;
	document.getElementById('delegate-note').value = '';
	let deptId = '';
	const deptVal = item[actualFields.dept];
	if (deptVal) deptId = String(Array.isArray(deptVal) ? deptVal[0] : deptVal);
	if (!deptId) {
		const cu = allUsers.find(u => String(u.ID) === String(item.createdBy));
		if (cu && cu.UF_DEPARTMENT) deptId = String(Array.isArray(cu.UF_DEPARTMENT) ? cu.UF_DEPARTMENT[0] : cu.UF_DEPARTMENT);
	}
	const deptObj = departments.find(d => String(d.ID) === deptId);
	const mgrVal = item[actualFields.manager];
	const mgrIds = Array.isArray(mgrVal) ? mgrVal : (mgrVal ? [mgrVal] : []);
	const currentMgr = mgrIds[0] || '';
	const displayMgr = currentMgr ? (userNames[currentMgr] || currentMgr) : (userNames[item.createdBy] || '—');
	document.getElementById('delegate-title').innerText = 'Делегировать закупку №' + item.id;
	document.getElementById('delegate-from').value = displayMgr;
	document.getElementById('delegate-dept').value = deptObj ? deptObj.NAME : (deptId || '—');

	// ✅ FIX: XSS — опции создаются через createElement/textContent, а не через innerHTML
	const sel = document.getElementById('delegate-to');
	sel.innerHTML = '';
	const optEmpty = document.createElement('option');
	optEmpty.value = '';
	optEmpty.textContent = '-- Выберите сотрудника --';
	sel.appendChild(optEmpty);

	let added = 0;
	allUsers.forEach(u => {
		if (String(u.ID) === String(currentMgr)) return;
		if (String(u.ACTIVE) === 'N') return;
		const depts = Array.isArray(u.UF_DEPARTMENT) ? u.UF_DEPARTMENT : (u.UF_DEPARTMENT ? [u.UF_DEPARTMENT] : []);
		const inDept = deptId ? depts.some(d => String(d) === deptId) : true;
		const isSelf = String(u.ID) === String(currentUser.ID);
		if (inDept || isSelf) {
			const opt = document.createElement('option');
			opt.value = String(u.ID);
			opt.textContent = (u.LAST_NAME || '') + ' ' + (u.NAME || '') +
				(isSelf ? ' (я)' : '') +
				(isUserUnavailable(u.ID) ? ' (недоступен)' : '');
			sel.appendChild(opt);
			added++;
		}
	});
	if (added === 0) {
		allUsers.forEach(u => {
			if (String(u.ID) !== String(currentMgr) && String(u.ACTIVE) !== 'N') {
				const opt = document.createElement('option');
				opt.value = String(u.ID);
				opt.textContent = (u.LAST_NAME || '') + ' ' + (u.NAME || '') +
					(isUserUnavailable(u.ID) ? ' (недоступен)' : '');
				sel.appendChild(opt);
			}
		});
	}
	document.getElementById('modal-delegate').style.display = 'flex';
}

function submitDelegate(e) {
	e.preventDefault();
	const id = document.getElementById('delegate-id').value;
	const toUserId = document.getElementById('delegate-to').value;
	const note = document.getElementById('delegate-note').value.trim();
	if (!toUserId) return showToast('Выберите сотрудника', 'error');
	const btn = document.getElementById('btn-delegate-save');
	if (btn) { btn.disabled = true; btn.innerText = 'Делегирование...'; }
	delegatePurchase(parseInt(id), parseInt(toUserId), note, function (ok) {
		if (btn) { btn.disabled = false; btn.innerText = 'Делегировать'; }
		if (ok) closeModal('modal-delegate');
	});
}

window.openDelegateModal = openDelegateModal;
window.submitDelegate = submitDelegate;