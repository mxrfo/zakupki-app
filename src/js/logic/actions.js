// js/actions.js — Действия: согласование, отклонение, доработка, откат, отправка в работу

function saveApprovedInvoices() {
	try {
		localStorage.setItem('approved_invoices_1088', JSON.stringify(approvedInvoices));
	} catch (e) {
		console.warn('Ошибка сохранения approved_invoices_1088:', e);
	}
}

function saveApprovedAmounts() {
	try {
		localStorage.setItem('approved_amounts_1088', JSON.stringify(approvedAmounts));
	} catch (e) {
		console.warn('Ошибка сохранения approved_amounts_1088:', e);
	}
}

// ✅ Расширенный поиск стадии по синонимам (защита от переименования в CRM)
function getStageIdByName(keyword) {
	var search = keyword.toLowerCase().replace(/ё/g, 'е');
	// Синонимы для каждой ключевой стадии
	var synonyms = {
		'создание': ['создание', 'новая', 'начало'],
		'сбор данных': ['сбор данных', 'сбор', 'заполнение'],
		'согласование': ['согласование', 'утверждение', 'рассмотрение'],
		'корректировк': ['корректировк', 'доработк', 'правка', 'изменен'],
		'загрузка': ['загрузка', 'загрузк', 'upload'],
		'обработка': ['обработка', 'обработк', 'processing'],
		'ожидание': ['ожидание', 'ожидан', 'pending', 'ожидает'],
		'получение': ['получение', 'получен', 'received'],
		'отмен': ['отмен', 'провал', 'cancel', 'rejected', 'отклонен'],
		'успех': ['успех', 'исполн', 'заверш', 'success', 'done', 'completed', 'оплачен'],
		'загрузка': ['загрузка', 'upload'],
		'исполн': ['исполн', 'успех', 'заверш', 'success', 'done']
	};
	var stage = spStagesSorted.find(function (s) {
		var n = s.name.toLowerCase().replace(/ё/g, 'е');
		if (n === search) return true;
		var syns = synonyms[search] || [search];
		return syns.some(function (syn) { return n.includes(syn); });
	});
	if (stage) return stage.id;
	// Fallback: прямой поиск по подстроке
	stage = spStagesSorted.find(function (s) { return s.name.toLowerCase().replace(/ё/g, 'е').includes(search); });
	return stage ? stage.id : null;
}

function getNextStageId(currentStageId) {
	var currentIndex = spStagesSorted.findIndex(function (s) { return s.id === currentStageId; });
	if (currentIndex === -1) return null;
	for (var i = currentIndex + 1; i < spStagesSorted.length; i++) {
		var stName = spStagesSorted[i].name.toLowerCase().replace(/ё/g, 'е');
		if (!stName.includes('успех') && !stName.includes('провал') && !stName.includes('отмен')) return spStagesSorted[i].id;
	}
	return null;
}

function submitAction(e) {
	if (e && typeof e.preventDefault === 'function') e.preventDefault();
	const id = parseInt(document.getElementById('action-id').value, 10);
	const type = document.getElementById('action-type').value;
	const comment = document.getElementById('action-comment').value;
	const postponeDate = document.getElementById('action-postpone-date').value;
	if (!id) {
		showToast('Некорректный ID закупки', 'error');
		return;
	}
	let targetStageId = null;
	const fields = {};
	logAction(`Инициализация действия: ${type} для закупки ID ${id}`, 'info');

	if (type === 'remove_postpone') {
		// ✅ FIX: проверка fieldDefs[postponeDate] перед использованием
		const pf = actualFields.postponeDate;
		if (!pf || !fieldDefs[pf]) {
			logAction('Поле отложения не найдено в CRM', 'error');
			showToast('Поле «Дата отложения» не найдено в CRM — обратитесь к администратору (проверьте маппинг postponeDate)', 'error');
			return;
		}
		fields[pf] = null;
		if (comment && actualFields.comment && fieldDefs[actualFields.comment]) {
			fields[actualFields.comment] = comment;
		}
		BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
			if (res.error()) {
				const err = getApiErrorMessage(res);
				logAction('Ошибка снятия отложки: ' + err, 'error');
				showToast('Ошибка снятия отложки: ' + err, 'error');
			} else {
				showToast('Отложка снята');
				closeModal('modal-action');
				loadAllData();
			}
		});
		return;
	}

	if (type === 'send_to_work') {
		if (sendToWorkInProgress[id]) return;
		const item = items.find(i => i.id == id);
		if (!item) {
			showToast('Закупка не найдена', 'error');
			return;
		}
		const existingTaskId = item[actualFields.taskVyborSotr];
		if (existingTaskId && String(existingTaskId).match(/^\d+$/)) {
			showToast(`Задача уже создана (ID: ${existingTaskId})`, 'info');
			closeModal('modal-action');
			return;
		}
		const submitBtn = document.querySelector('#action-footer-buttons button[type="submit"]');
		if (submitBtn) {
			submitBtn.disabled = true;
			submitBtn.dataset.originalText = submitBtn.innerText;
			submitBtn.innerText = 'Создание...';
		}
		sendToWorkInProgress[id] = true;
		const resetWorkState = () => {
			sendToWorkInProgress[id] = false;
			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.innerText = submitBtn.dataset.originalText || 'Отправить';
			}
		};
		const shortDescText = cleanText(item[actualFields.shortDesc]) || item.title;
		let headId = null;
		if (isTestMode && currentUser) {
			headId = parseInt(currentUser.ID, 10);
		} else {
			const deptId = String(Array.isArray(item[actualFields.dept]) ? item[actualFields.dept][0] : (item[actualFields.dept] || ''));
			headId = settings.deptHeads[deptId] ? parseInt(settings.deptHeads[deptId], 10) : null;
			if (!headId) {
				const b24Dept = departments.find(d => String(d.ID) === deptId);
				if (b24Dept && b24Dept.UF_HEAD) headId = parseInt(b24Dept.UF_HEAD, 10);
			}
			if (!headId) {
				const existingHead = item[actualFields.deptHead];
				// ✅ FIX: обработка null для UF-поля
				const arr = Array.isArray(existingHead) ? existingHead : (existingHead ? [existingHead] : []);
				if (arr.length) headId = parseInt(arr[0], 10);
			}
			if (!headId && currentUser) headId = parseInt(currentUser.ID, 10);
			// ✅ FIX: проверка fieldDefs перед записью
			if (headId && actualFields.deptHead && fieldDefs[actualFields.deptHead]) {
				fields[actualFields.deptHead] = [String(headId)];
			}
		}
		if (comment && actualFields.comment && fieldDefs[actualFields.comment]) {
			fields[actualFields.comment] = comment;
		}
		const headIdNum = parseInt(headId, 10);
		if (!headIdNum) {
			showToast('Не определён руководитель отдела', 'error');
			resetWorkState();
			return;
		}
		const proceedToTask = () => {
			const adminUserId = parseInt(settings.systemUserId, 10) || 1;
			const taskPayload = {
				TITLE: '[🛒] Утверждение исполняющего сотрудника по закупке',
				RESPONSIBLE_ID: headIdNum,
				CREATED_BY: adminUserId,
				DESCRIPTION: `Задача:
1. Выбрать в качестве СОИСПОЛНИТЕЛЯ сотрудника, который будет выполнять сбор данных и расчёт примерной стоимости закупки
2. Завершить задачу
Необходимо закупить:
${shortDescText}`,
				STATUS: 2,
				ADD_IN_REPORT: 'Y'
			};
			if (item[actualFields.deadlineZakup]) {
				const d = new Date(item[actualFields.deadlineZakup]);
				if (!isNaN(d.getTime())) {
					d.setDate(d.getDate() - 1);
					taskPayload.DEADLINE = d.toISOString();
				}
			}
			BX24.callMethod('tasks.task.add', { fields: taskPayload }, (taskRes) => {
				if (taskRes.error()) {
					showToast('Ошибка создания задачи: ' + getApiErrorMessage(taskRes), 'error');
					resetWorkState();
					return;
				}
				const taskId = taskRes.data().task.id;
				logAction(`Задача для руководителя создана (ID: ${taskId})`, 'success');
				try {
					notifySelectExecutor(headIdNum, item, taskId, comment);
				} catch (err) {
					logAction('Ошибка уведомления руководителю: ' + err.message, 'error');
				}
				const finish = () => {
					sendToWorkInProgress[id] = false;
					showToast('Задача создана', 'success');
					closeModal('modal-action');
					loadAllData();
				};
				if (actualFields.taskVyborSotr && fieldDefs[actualFields.taskVyborSotr]) {
					BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: { [actualFields.taskVyborSotr]: String(taskId) } }, (saveRes) => {
						if (saveRes.error()) logAction('Ошибка сохранения ID задачи: ' + getApiErrorMessage(saveRes), 'error');
						else item[actualFields.taskVyborSotr] = String(taskId);
						finish();
					});
				} else {
					finish();
				}
			});
		};
		if (Object.keys(fields).length === 0) {
			proceedToTask();
			return;
		}
		BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
			if (res.error()) {
				showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
				resetWorkState();
				return;
			}
			try {
				Object.keys(fields).forEach(function (k) { item[k] = fields[k]; });
			} catch (err) {}
			proceedToTask();
		});
		return;
	}

	const item = items.find(i => i.id == id);
	if (!item) {
		showToast('Закупка не найдена', 'error');
		return;
	}

	if (type === 'send_to_rework') {
		if (!comment || !comment.trim()) {
			showToast('Для отправки на доработку обязательно укажите комментарий', 'error');
			return;
		}
		// ✅ FIX: расширенный поиск (синонимы)
		targetStageId = getStageIdByName('корректировк') || getStageIdByName('доработк');
		if (!targetStageId) {
			showToast('Не найдена стадия "Корректировка"/"Доработка". Добавьте её в справочник статусов.', 'error');
			return;
		}
		fields.stageId = targetStageId;
		if (actualFields.comment && fieldDefs[actualFields.comment]) {
			fields[actualFields.comment] = comment;
		}
		BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
			if (res.error()) {
				showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
			} else {
				showToast('Отправлено на доработку', 'success');
				try {
					const mgrArr = Array.isArray(item[actualFields.manager]) ? item[actualFields.manager] : (item[actualFields.manager] ? [item[actualFields.manager]] : []);
					const mgrId = mgrArr.length > 0 ? parseInt(mgrArr[0], 10) : null;
					if (mgrId) notifyReworkNeeded(mgrId, item, comment);
					item.stageId = targetStageId;
					if (comment) item[actualFields.comment] = comment;
					groupStatusNotify(item, 'rework');
				} catch (err) {}
				closeModal('modal-action');
				loadAllData();
			}
		});
		return;
	}

	if (type === 'approve_terms') {
		targetStageId = getStageIdByName('загрузка');
	} else if (type === 'reject_terms') {
		// ✅ FIX: расширенный поиск
		targetStageId = getStageIdByName('отмен') || getStageIdByName('провал');
	} else if (type === 'approve_invoice') {
		approvedInvoices[id] = true;
		saveApprovedInvoices();
		targetStageId = item.stageId;
	} else if (type === 'reject_invoice') {
		targetStageId = getStageIdByName('отмен') || getStageIdByName('провал');
	} else if (type === 'confirm_payment') {
		targetStageId = getStageIdByName('получение') || getStageIdByName('ожидание') || getStageIdByName('успех');
	} else if (type === 'confirm_receipt') {
		// ✅ FIX: расширенный поиск
		targetStageId = getStageIdByName('исполн') || getStageIdByName('успех') || getStageIdByName('заверш');
	}

	if (!targetStageId) {
		showToast('Критическая ошибка: не найдена стадия для перехода.', 'error');
		return;
	}

	fields.stageId = targetStageId;
	// ✅ FIX: проверка fieldDefs перед записью
	if (comment && actualFields.comment && fieldDefs[actualFields.comment]) {
		fields[actualFields.comment] = comment;
	}
	// ✅ FIX: проверка fieldDefs[postponeDate] перед использованием
	if (postponeDate && actualFields.postponeDate && fieldDefs[actualFields.postponeDate]) {
		fields[actualFields.postponeDate] = postponeDate;
	}

	if (type === 'approve_terms') {
		// ✅ FIX: проверка fieldDefs перед записью
		if (currentUser && actualFields.approver && fieldDefs[actualFields.approver]) {
			fields[actualFields.approver] = [String(currentUser.ID)];
		}
		const amt = calculateTotalAmount(item);
		approvedAmounts[id] = amt;
		saveApprovedAmounts();
	}

	BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
		if (res.error()) {
			showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
		} else {
			showToast('Статус обновлен', 'success');
			try {
				item.stageId = targetStageId;
				if (comment) item[actualFields.comment] = comment;
			} catch (err) {}
			if (type === 'approve_terms' || type === 'reject_terms') {
				try {
					const mgrArr = Array.isArray(item[actualFields.manager]) ? item[actualFields.manager] : (item[actualFields.manager] ? [item[actualFields.manager]] : []);
					const mgrId = mgrArr.length > 0 ? parseInt(mgrArr[0], 10) : null;
					if (mgrId) notifyAfterDecision(mgrId, item, type === 'approve_terms');
				} catch (err) {}
				try {
					groupStatusNotify(item, type === 'approve_terms' ? 'approved' : 'rejected');
				} catch (err) {}
			}
			if (type === 'approve_invoice') {
				try { notifyInvoiceEvent(item, 'approved'); } catch (err) {}
			}
			if (type === 'confirm_payment') {
				try { notifyInvoiceEvent(item, 'paid'); } catch (err) {}
				try { groupStatusNotify(item, 'invoice_paid'); } catch (err) {}
			}
			if (type === 'reject_invoice') {
				try { notifyInvoiceEvent(item, 'rejected'); } catch (err) {}
			}
			closeModal('modal-action');
			loadAllData();
		}
	});
}

function rollbackItem(id) {
	if (!confirm('Вернуть закупку на предыдущую стадию?')) return;
	const item = items.find(i => i.id === id);
	if (!item) {
		showToast('Закупка не найдена', 'error');
		return;
	}
	const currentStage = spStages[item.stageId];
	const stName = currentStage ? String(currentStage.name || '').toLowerCase().replace(/ё/g, 'е') : '';
	let prevStageId = null;
	if (stName.includes('отмен') || stName.includes('провал')) {
		prevStageId = getStageIdByName('сбор данных') || getStageIdByName('создание');
	} else {
		const currentIndex = spStagesSorted.findIndex(s => s.id === item.stageId);
		if (currentIndex <= 0) {
			showToast('Это первая стадия', 'error');
			return;
		}
		for (let i = currentIndex - 1; i >= 0; i--) {
			const prevStName = String(spStagesSorted[i].name || '').toLowerCase().replace(/ё/g, 'е');
			if (!prevStName.includes('успех') && !prevStName.includes('провал') && !prevStName.includes('отмен')) {
				prevStageId = spStagesSorted[i].id;
				break;
			}
		}
	}
	if (!prevStageId) {
		showToast('Не найдена предыдущая рабочая стадия для возврата.', 'error');
		return;
	}
	BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(id, 10), fields: { stageId: prevStageId } }, (res) => {
		if (res.error()) showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
		else {
			showToast('Стадия откачена');
			loadAllData();
		}
	});
}

window.submitAction = submitAction;
window.rollbackItem = rollbackItem;
window.getStageIdByName = getStageIdByName;
window.getNextStageId = getNextStageId;