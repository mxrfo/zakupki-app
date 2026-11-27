// ============================================================
// МОДУЛЬ: data.js
// ============================================================
// js/ui/modals/data.js — Модалка сбора данных и расчёта

function openDataModal(id) {
	const item = items.find(i => i.id === id);
	if (!item) return;
	const stage = spStages[item.stageId];
	const stName = stage ? stage.name.toLowerCase().replace(/ё/g, 'е') : '';
	const isAdminUI = currentRole === 'admin';
	const isMgrUI = isAdminUI || currentRole === 'manager';
	const allowSbor = stName.includes('сбор данных') || stName.includes('корректировк');
	const allowApprovalEdit = stName.includes('согласование') && !stName.includes('обработка') && isMgrUI;
	if (!allowSbor && !allowApprovalEdit) {
		showToast('Данные уже отправлены дальше — редактирование недоступно', 'info');
		return;
	}
	document.getElementById('form-data').reset();
	document.getElementById('data-id').value = id;
	document.getElementById('data-modal-title').innerText = cleanText(item.title);
	document.getElementById('data-modal-desc').innerText = getShortDesc(item);
	document.getElementById('data-amount-product').value = parseAmount(item[actualFields.amountProduct]) || '';
	document.getElementById('data-amount-delivery').value = parseAmount(item[actualFields.amountDelivery]) || '';
	const tbody = document.getElementById('data-detail-tbody');
	tbody.innerHTML = '';
	const names = item[actualFields.detailName] || [];
	const purposes = item[actualFields.detailPurpose] || [];
	const prices = item[actualFields.detailPrice] || [];
	const qtys = item[actualFields.detailQty] || [];
	const links = item[actualFields.detailLink] || [];
	const suppliers = item[actualFields.detailSupplier] || [];
	const arrN = Array.isArray(names) ? names : (names ? [names] : []);
	const arrP = Array.isArray(purposes) ? purposes : (purposes ? [purposes] : []);
	const arrPr = Array.isArray(prices) ? prices : (prices ? [prices] : []);
	const arrQ = Array.isArray(qtys) ? qtys : (qtys ? [qtys] : []);
	const arrL = Array.isArray(links) ? links : (links ? [links] : []);
	const arrS = Array.isArray(suppliers) ? suppliers : (suppliers ? [suppliers] : []);
	// ✅ FIX: maxLen должен учитывать все массивы, чтобы не потерять данные (например, цену без имени)
	const maxLen = Math.max(arrN.length, arrP.length, arrPr.length, arrQ.length, arrL.length, arrS.length, 1);
	for (let i = 0; i < maxLen; i++) {
		const tr = document.createElement('tr');
		const priceVal = parseAmount(arrPr[i]);
		const qtyVal = parseAmount(arrQ[i]);
		const totalVal = (parseFloat(priceVal) * parseFloat(qtyVal)) || '';
		// ✅ FIX: XSS — экранирование всех полей перед вставкой в innerHTML
		tr.innerHTML = `<td><input type="text" class="data-det-name" value="${escapeHtml(arrN[i] || '')}"></td>` +
			`<td><input type="text" class="data-det-purpose" value="${escapeHtml(arrP[i] || '')}"></td>` +
			`<td><input type="number" class="data-det-price" step="0.01" value="${escapeHtml(String(priceVal))}" oninput="calculateDataRowTotal(this)"></td>` +
			`<td><input type="number" class="data-det-qty" step="1" value="${escapeHtml(String(qtyVal))}" oninput="calculateDataRowTotal(this)"></td>` +
			`<td><input type="text" class="data-det-total" value="${totalVal ? escapeHtml(totalVal.toFixed(2)) : ''}" readonly></td>` +
			`<td><input type="text" class="data-det-supplier" value="${escapeHtml(arrS[i] || '')}"></td>` +
			`<td><input type="url" class="data-det-link" value="${escapeHtml(arrL[i] || '')}"></td>` +
			`<td class="text-center" style="text-align:center;"><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove();">&times;</button></td>`;
		tbody.appendChild(tr);
	}
	const modalTitle = document.querySelector('#modal-data .modal-header h2');
	const submitBtn = document.querySelector('#form-data button[type="submit"]');
	if (allowApprovalEdit) {
		if (modalTitle) modalTitle.innerText = 'Редактирование данных (согласование)';
		if (submitBtn) { submitBtn.innerText = 'Сохранить изменения'; submitBtn.className = 'btn btn-primary'; }
	} else if (stName.includes('корректировк')) {
		if (modalTitle) modalTitle.innerText = 'Корректировка данных';
		if (submitBtn) { submitBtn.innerText = 'Отправить на согласование'; submitBtn.className = 'btn btn-primary'; }
	} else {
		if (modalTitle) modalTitle.innerText = 'Сбор данных и расчет';
		if (submitBtn) { submitBtn.innerText = 'Отправить на согласование'; submitBtn.className = 'btn btn-primary'; }
	}
	const modal = document.querySelector('#modal-data .modal');
	if (modal) modal.style.borderTop = `6px solid ${stage ? stage.color : '#64748b'}`;
	document.getElementById('modal-data').style.display = 'flex';
	setTimeout(function () { initResizableTable('data-detail-table'); }, 50);
}

window.openDataModal = openDataModal;
// ============================================================
// КОНЕЦ МОДУЛЯ: data.js
// ============================================================