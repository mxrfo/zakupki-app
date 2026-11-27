// js/ui/modals/executor.js — Модалка выбора исполнителя

// ✅ Promise-обёртка над BX24.callMethod для async/await
function bx24Call(method, params) {
	return new Promise(function (resolve, reject) {
		BX24.callMethod(method, params, function (res) {
			if (res && res.error()) reject(new Error(getApiErrorMessage(res)));
			else resolve(res);
		});
	});
}

function openExecutorModal(id) {
	const item = items.find(i => i.id === id);
	if (!item) return;
	const taskId = item[actualFields.taskVyborSotr];
	if (!taskId || !String(taskId).match(/^\d+$/)) { showToast('Задача на выбор исполнителя не найдена', 'error'); return; }
	if (item[actualFields.manager] && (Array.isArray(item[actualFields.manager]) ? item[actualFields.manager].length : true)) {
		showToast('Исполнитель уже выбран. Откройте карточку закупки.', 'info');
		openViewModal(id);
		return;
	}
	document.getElementById('executor-id').value = id;
	document.getElementById('executor-task-id').value = taskId;
	document.getElementById('executor-title').innerText = 'Выбор исполнителя — закупка №' + id;
	document.getElementById('executor-desc').value = getShortDesc(item);
	let deptId = '';
	const deptVal = item[actualFields.dept];
	if (deptVal) deptId = String(Array.isArray(deptVal) ? deptVal[0] : deptVal);
	const sel = document.getElementById('executor-to');
	sel.innerHTML = '';
	const optEmpty = document.createElement('option');
	optEmpty.value = '';
	optEmpty.textContent = '-- Выберите сотрудника из отдела --';
	sel.appendChild(optEmpty);

	const addedIds = new Set();
	let added = 0;

	// ✅ FIX: XSS — опции создаются через createElement/textContent
	allUsers.forEach(u => {
		if (String(u.ACTIVE) === 'N') return;
		const depts = Array.isArray(u.UF_DEPARTMENT) ? u.UF_DEPARTMENT : (u.UF_DEPARTMENT ? [u.UF_DEPARTMENT] : []);
		const inDept = deptId ? depts.some(d => String(d) === deptId) : false;
		const isSelf = String(u.ID) === String(currentUser.ID);
		if (inDept || isSelf) {
			const opt = document.createElement('option');
			opt.value = String(u.ID);
			opt.textContent = (u.LAST_NAME || '') + ' ' + (u.NAME || '') +
				(isSelf ? ' (я)' : '') +
				(isUserUnavailable(u.ID) ? ' (недоступен)' : '');
			sel.appendChild(opt);
			addedIds.add(String(u.ID));
			added++;
		}
	});
	if (added === 0) {
		allUsers.forEach(u => {
			if (String(u.ACTIVE) === 'N') return;
			const isSelf = String(u.ID) === String(currentUser.ID);
			const opt = document.createElement('option');
			opt.value = String(u.ID);
			opt.textContent = (u.LAST_NAME || '') + ' ' + (u.NAME || '') +
				(isSelf ? ' (я)' : '') +
				(isUserUnavailable(u.ID) ? ' (недоступен)' : '');
			sel.appendChild(opt);
			addedIds.add(String(u.ID));
		});
	}
	if (currentUser && currentUser.ID && !addedIds.has(String(currentUser.ID))) {
		const cu = allUsers.find(u => String(u.ID) === String(currentUser.ID));
		const opt = document.createElement('option');
		opt.value = String(currentUser.ID);
		opt.textContent = (cu ? (cu.LAST_NAME + ' ' + cu.NAME) : (userNames[currentUser.ID] || 'Я')) + ' (я)';
		sel.appendChild(opt);
	}
	document.getElementById('modal-executor').style.display = 'flex';
}

// ✅ FIX: callback-hell разбит на async/await + try/finally (кнопка всегда разблокируется)
async function submitExecutor(e) {
	e.preventDefault();
	const id = parseInt(document.getElementById('executor-id').value);
	const taskId = parseInt(document.getElementById('executor-task-id').value);
	const toUserId = parseInt(document.getElementById('executor-to').value);
	if (!toUserId) return showToast('Выберите сотрудника', 'error');
	if (isUserUnavailable(toUserId)) return showToast('Сотрудник недоступен (отсутствие)', 'error');

	const btn = document.getElementById('btn-executor-save');
	if (btn) { btn.disabled = true; btn.innerText = 'Утверждение...'; }

	const item = items.find(i => i.id === id);
	logAction('Утверждение исполнителя ' + toUserId + ' для закупки ' + id, 'info');

	try {
		// 1. Закрываем задачу на выбор исполнителя
		try {
			await bx24Call('tasks.task.update', { taskId: taskId, fields: { ACCOMPLICES: [toUserId], STATUS: 5 } });
			logAction('Задача закрыта, соисполнитель назначен', 'success');
		} catch (err) {
			logAction('Ошибка обновления задачи: ' + err.message, 'error');
		}

		// 2. Записываем менеджера и переводим стадию
		const sborStageId = getStageIdByName('сбор данных');
		const updFields = {};
		updFields[actualFields.manager] = [String(toUserId)];
		if (sborStageId) updFields.stageId = sborStageId;

		await bx24Call('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: updFields });

		if (item) {
			item[actualFields.manager] = [String(toUserId)];
			if (sborStageId) item.stageId = sborStageId;
		}

		closeModal('modal-executor');
		showToast('Исполнитель утверждён: ' + (userNames[toUserId] || toUserId), 'success');

		// 3. Групповой статус
		try {
			if (item) groupStatusNotify(item, 'assigned', 'group_assigned_' + item.id + '_' + toUserId);
		} catch (err) {
			logAction('Ошибка группового статуса: ' + err.message, 'error');
		}

		// 4. Создание задачи сбора данных (если ещё нет)
		try {
			if (item && !item[actualFields.taskSbor]) {
				const shortDescText = getShortDesc(item);
				const headId = resolveDeptHeadId(item, true);
				const taskPayload = {
					TITLE: '[🛒] Сбор данных и расчет по закупке',
					RESPONSIBLE_ID: toUserId,
					CREATED_BY: parseInt(systemUserId) || 1,
					DESCRIPTION: 'Необходимо собрать данные по закупке "' + shortDescText + '".',
					STATUS: 2,
					ADD_IN_REPORT: 'Y'
				};
				if (headId) taskPayload.OBSERVERS = [headId];

				const tr2 = await bx24Call('tasks.task.add', { fields: taskPayload });
				const newTaskId = tr2.data().task.id;
				notifyCollectData(toUserId, item);
				await bx24Call('crm.item.update', {
					entityTypeId: ENTITY_TYPE_ID,
					id: id,
					fields: { [actualFields.taskSbor]: String(newTaskId) }
				});
				loadAllData();
			} else {
				notifyCollectData(toUserId, item);
				loadAllData();
			}
		} catch (err) {
			logAction('Ошибка уведомления менеджера: ' + err.message, 'error');
			loadAllData();
		}
	} catch (err) {
		logAction('Ошибка утверждения исполнителя: ' + err.message, 'error');
		showToast('Ошибка: ' + err.message, 'error');
	} finally {
		// ✅ Кнопка всегда разблокируется
		if (btn) { btn.disabled = false; btn.innerText = 'Утвердить'; }
	}
}

window.openExecutorModal = openExecutorModal;
window.submitExecutor = submitExecutor;