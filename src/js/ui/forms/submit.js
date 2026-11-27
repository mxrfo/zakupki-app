// js/ui/forms/submit.js — Отправка форм на сервер (create, data, edit-amount, upload)

function submitCreateRequest(e) {
	e.preventDefault();
	if (!validateCreateStep(1)) { goCreateStep(1, 'back'); return; }
	if (!validateCreateStep(2)) { goCreateStep(2, 'back'); return; }
	const btn = document.getElementById('btn-save-create');
	if (btn.disabled) return;
	btn.disabled = true;
	btn.innerText = 'Создание...';
	logAction('Начало создания запроса...', 'info');

	const editId = document.getElementById('edit-item-id').value;
	const deadline = document.getElementById('create-deadline').value;
	const deptId = document.getElementById('create-dept').value;
	const shortDesc = document.getElementById('create-short-desc').value;
	const amountProduct = document.getElementById('create-amount-product').value;
	const section = document.getElementById('create-section').value;
	const direction = document.getElementById('create-direction').value;
	const secText = document.getElementById('create-section').options[document.getElementById('create-section').selectedIndex]?.text || '';
	const dirText = document.getElementById('create-direction').options[document.getElementById('create-direction').selectedIndex]?.text || '';
	let combinedText = '';
	if (secText && dirText) combinedText = `${secText} / ${dirText}`;
	else if (secText) combinedText = secText;

	const cards = document.querySelectorAll('.pos-card');
	const arrNames = [], arrPurposes = [], arrPrices = [], arrQtys = [], arrLinks = [], arrSuppliers = [], arrArticles = [], arrNotes = [];
	let hasDetails = false;
	cards.forEach(card => {
		const n = card.querySelector('.det-name').value.trim();
		const l = card.querySelector('.det-link').value.trim();
		const q = card.querySelector('.det-qty').value.trim();
		const pr = card.querySelector('.det-price').value.trim();
		const s = card.querySelector('.det-supplier').value.trim();
		const art = card.querySelector('.det-article') ? card.querySelector('.det-article').value.trim() : '';
		const p = card.querySelector('.det-purpose').value.trim();
		const note = card.querySelector('.det-note') ? card.querySelector('.det-note').value.trim() : '';
		if (n || l || q || pr || s || art || p || note) {
			arrNames.push(n);
			arrLinks.push(l);
			arrQtys.push(q);
			// ✅ FIX: нормализация цены через parseAmount + isFinite
			const parsedPrice = parseAmount(pr);
			const safePrice = Number.isFinite(parsedPrice) ? parsedPrice : 0;
			arrPrices.push(pr !== '' ? `${safePrice}|RUB` : '0|RUB');
			arrSuppliers.push(s);
			if (actualFields.detailArticle) arrArticles.push(art);
			if (actualFields.detailNote) arrNotes.push(note);
			arrPurposes.push(p);
			hasDetails = true;
		}
	});

	const shortDept = settings.deptShortNames[deptId] || (departments.find(d => d.ID == deptId)?.NAME || 'Отдел');
	const dateStr = new Date().toLocaleDateString('ru-RU');
	const fields = {
		categoryId: currentCategoryId,
		[actualFields.shortDesc]: shortDesc,
		[actualFields.deadlineZakup]: deadline,
		[actualFields.dept]: deptId,
		[actualFields.creator]: currentUser.ID,
		// ✅ FIX: нормализация суммы через parseAmount + isFinite
		[actualFields.amountProduct]: amountProduct ? (Number.isFinite(parseAmount(amountProduct)) ? parseAmount(amountProduct) : 0) : 0
	};
	if (section) fields[actualFields.section] = section;
	if (direction) fields[actualFields.direction] = direction;
	if (actualFields.combinedDir && combinedText) fields[actualFields.combinedDir] = combinedText;
	if (hasDetails) {
		fields[actualFields.detailName] = arrNames;
		fields[actualFields.detailPurpose] = arrPurposes;
		fields[actualFields.detailPrice] = arrPrices;
		fields[actualFields.detailQty] = arrQtys;
		fields[actualFields.detailLink] = arrLinks;
		if (actualFields.detailSupplier && fieldDefs[actualFields.detailSupplier]) fields[actualFields.detailSupplier] = arrSuppliers;
		if (actualFields.detailArticle && arrArticles.length) fields[actualFields.detailArticle] = arrArticles;
		if (actualFields.detailNote && arrNotes.length) fields[actualFields.detailNote] = arrNotes;
	} else {
		fields[actualFields.detailName] = [];
		fields[actualFields.detailPurpose] = [];
		fields[actualFields.detailPrice] = [];
		fields[actualFields.detailQty] = [];
		fields[actualFields.detailLink] = [];
		if (actualFields.detailSupplier && fieldDefs[actualFields.detailSupplier]) fields[actualFields.detailSupplier] = [];
	}

	const restoreBtn = () => { btn.disabled = false; btn.innerText = 'Сохранить'; };

	if (editId) {
		const oldItem = items.find(i => i.id == editId);
		const createdDate = oldItem ? new Date(oldItem.createdTime).toLocaleDateString('ru-RU') : dateStr;
		fields.title = `Закупка №${editId} отделом ${shortDept} от ${createdDate}`;
		BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: editId, fields: fields }, (res) => {
			if (res.error()) { logAction('Ошибка редактирования: ' + getApiErrorMessage(res), 'error'); showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); restoreBtn(); }
			else { logAction('Закупка обновлена', 'success'); showToast('Закупка обновлена'); closeModal('modal-create'); invalidateSuggestions(); restoreBtn(); loadAllData(); }
		});
	} else {
		fields.title = `Закупка отделом ${shortDept} от ${dateStr}`;
		// ✅ FIX: xmlId с рандомом для защиты от коллизий при параллельном создании
		fields.xmlId = isTestMode
			? 'TEST_APP_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
			: 'APP_PURCHASE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
		BX24.callMethod('crm.item.add', { entityTypeId: ENTITY_TYPE_ID, fields: fields }, (res) => {
			if (res.error()) { logAction('Ошибка создания: ' + getApiErrorMessage(res), 'error'); showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); restoreBtn(); }
			else {
				const newId = res.data().item.id;
				const finalTitle = `Закупка №${newId} отделом ${shortDept} от ${dateStr}`;
				BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: newId, fields: { title: finalTitle } }, () => {
					restoreBtn();
					logAction('Запрос создан ID: ' + newId, 'success');
					showToast('Запрос создан');
					closeModal('modal-create');
					invalidateSuggestions();
					loadAllData();
					if (isTestMode && currentScenario !== 'none') { setTimeout(() => { const createdItem = items.find(i => i.id === newId); if (createdItem) runScenarioAfterCreate(newId); }, 1500); }
				});
			}
		});
	}
}

function submitData(e) {
	e.preventDefault();
	const id = document.getElementById('data-id').value;
	const amountProduct = document.getElementById('data-amount-product').value;
	const amountDelivery = document.getElementById('data-amount-delivery').value;
	const rows = document.querySelectorAll('#data-detail-tbody tr');
	const arrNames = [], arrPurposes = [], arrPrices = [], arrQtys = [], arrLinks = [], arrSuppliers = [];
	let hasDetails = false;
	rows.forEach(tr => {
		const n = tr.querySelector('.data-det-name').value.trim();
		const p = tr.querySelector('.data-det-purpose').value.trim();
		const pr = tr.querySelector('.data-det-price').value.trim();
		const q = tr.querySelector('.data-det-qty').value.trim();
		const l = tr.querySelector('.data-det-link').value.trim();
		const s = tr.querySelector('.data-det-supplier').value.trim();
		if (n || p || q || l || pr || s) {
			arrNames.push(n);
			arrPurposes.push(p);
			// ✅ FIX: нормализация цены через parseAmount + isFinite
			const parsedPrice = parseAmount(pr);
			const safePrice = Number.isFinite(parsedPrice) ? parsedPrice : 0;
			arrPrices.push(pr !== '' ? `${safePrice}|RUB` : '0|RUB');
			arrQtys.push(q);
			arrLinks.push(l);
			arrSuppliers.push(s);
			hasDetails = true;
		}
	});

	const targetStageId = getStageIdByName('согласование');
	const fields = {
		// ✅ FIX: нормализация суммы через parseAmount + isFinite
		[actualFields.amountProduct]: amountProduct ? (Number.isFinite(parseAmount(amountProduct)) ? parseAmount(amountProduct) : 0) : 0
	};
	if (amountDelivery) {
		const parsedDelivery = parseAmount(amountDelivery);
		fields[actualFields.amountDelivery] = Number.isFinite(parsedDelivery) ? parsedDelivery : 0;
	}
	if (hasDetails) {
		fields[actualFields.detailName] = arrNames;
		fields[actualFields.detailPurpose] = arrPurposes;
		fields[actualFields.detailPrice] = arrPrices;
		fields[actualFields.detailQty] = arrQtys;
		fields[actualFields.detailLink] = arrLinks;
		if (actualFields.detailSupplier && fieldDefs[actualFields.detailSupplier]) fields[actualFields.detailSupplier] = arrSuppliers;
	} else {
		fields[actualFields.detailName] = [];
		fields[actualFields.detailPurpose] = [];
		fields[actualFields.detailPrice] = [];
		fields[actualFields.detailQty] = [];
		fields[actualFields.detailLink] = [];
		if (actualFields.detailSupplier && fieldDefs[actualFields.detailSupplier]) fields[actualFields.detailSupplier] = [];
	}

	const curItem = items.find(i => i.id == id);
	const curStage = curItem ? spStages[curItem.stageId] : null;
	const curName = curStage ? curStage.name.toLowerCase().replace(/ё/g, 'е') : '';
	const onApproval = curName.includes('согласование') && !curName.includes('обработка');
	if (!onApproval && targetStageId) fields.stageId = targetStageId;

	logAction('Сохранение данных расчета...', 'info');
	BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
		if (res.error()) { logAction('Ошибка сохранения: ' + getApiErrorMessage(res), 'error'); showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); }
		else {
			logAction('Данные сохранены', 'success');
			const item = items.find(i => i.id == id);
			if (!onApproval) {
				const taskSborId = item ? item[actualFields.taskSbor] : null;
				if (taskSborId && String(taskSborId).match(/^\d+$/)) {
					BX24.callMethod('tasks.task.update', { taskId: parseInt(taskSborId), fields: { STATUS: 5 } }, (trRes) => {
						if (trRes.error()) logAction('Ошибка завершения задачи сбора: ' + getApiErrorMessage(trRes), 'error');
						else logAction('Задача сбора завершена', 'success');
					});
				}
			}
			try {
				if (item) {
					// ✅ FIX: нормализация сумм при обновлении локального объекта
					const parsedProd = parseAmount(amountProduct);
					item[actualFields.amountProduct] = Number.isFinite(parsedProd) ? parsedProd : 0;
					if (amountDelivery) {
						const parsedDel = parseAmount(amountDelivery);
						item[actualFields.amountDelivery] = Number.isFinite(parsedDel) ? parsedDel : 0;
					}
					if (!onApproval && targetStageId) item.stageId = targetStageId;
					const headId = resolveDeptHeadId(item, true);
					if (headId) {
						if (onApproval) { logAction(`Уведомление об изменении данных → ID ${headId}`, 'info'); notifyDataChangedOnApproval(headId, item); }
						else {
							logAction(`Уведомление о согласовании → ID ${headId}`, 'info');
							notifyApprovalNeeded(headId, item);
							groupStatusNotify(item, 'sent_to_approval');
						}
					} else logAction('Не удалось определить руководителя', 'error');
				}
			} catch (e) { logAction('Ошибка уведомления: ' + e.message, 'error'); }
			showToast('Данные сохранены');
			closeModal('modal-data');
			invalidateSuggestions();
			loadAllData();
		}
	});
}

window.submitCreateRequest = submitCreateRequest;
window.submitData = submitData;