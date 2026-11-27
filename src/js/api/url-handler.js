// js/api/url-handler.js — Обработка URL-параметров при открытии приложения

var lastHandledAction = '';
var urlCheckInterval = null;

function clearUrlCheckInterval() {
	if (urlCheckInterval) {
		clearInterval(urlCheckInterval);
		urlCheckInterval = null;
	}
}

// ✅ FIX: очистка setInterval при уходе со страницы
window.addEventListener('beforeunload', clearUrlCheckInterval);

function handleUrlParams() {
	var params = getIncomingParams();
	var itemId = params.itemId;
	var action = params.action;
	var tab = params.tab;
	if (!itemId) return;

	// ✅ FIX: поддержка повторного вызова с другим action (раньше игнорировался, если itemId совпадал)
	var isSameItem = String(itemId) === String(lastHandledItemId);
	var isSameAction = String(action) === String(lastHandledAction);

	if (isSameItem && isSameAction && urlParamsProcessed) return;

	lastHandledItemId = itemId;
	lastHandledAction = action;
	urlParamsProcessed = true;

	// ✅ FIX: очистка предыдущего интервала, если он ещё висит
	clearUrlCheckInterval();

	var attempts = 0;
	var maxAttempts = 20;
	urlCheckInterval = setInterval(function () {
		attempts++;
		var readyOrDone = items.length > 0 || (!loadAllDataInProgress && attempts >= 4) || attempts >= maxAttempts;
		if (!readyOrDone) return;
		clearUrlCheckInterval();

		var id = parseInt(itemId, 10);
		var found = items.some(function (i) { return parseInt(i.id, 10) === id; });
		if (found) {
			if (tab) {
				try {
					if (typeof switchTab === 'function') switchTab(tab);
				} catch (e) {}
			}
			if (action === 'fill') openDataModal(id);
			else if (action === 'upload') openUploadModal(id);
			else if (action === 'approve') openActionModal(id, 'approve_terms');
			else if (action === 'reject') openActionModal(id, 'reject_terms');
			else if (action === 'rework') openActionModal(id, 'send_to_rework');
			else if (action === 'select_executor') openExecutorModal(id);
			else if (action === 'approve_invoice') openActionModal(id, 'approve_invoice');
			else if (action === 'reject_invoice') openActionModal(id, 'reject_invoice');
			else if (action === 'confirm_payment') openActionModal(id, 'confirm_payment');
			else if (action === 'confirm_receipt') openActionModal(id, 'confirm_receipt');
			else openViewModal(id);
			try {
				window.history.replaceState({}, '', window.location.protocol + '//' + window.location.host + window.location.pathname);
			} catch (e) {}
		} else if (items.length === 0 && loadAllDataInProgress) {
			showToast('Не удалось загрузить данные', 'error');
		} else {
			showToast('Закупка #' + id + ' не найдена', 'info');
		}
	}, 500);
}

function getIncomingParams() {
	try {
		if (typeof BX24 !== 'undefined' && BX24.placement && typeof BX24.placement.info === 'function') {
			const info = BX24.placement.info();
			const o = (info && info.options) || {};
			if (o.id) return { action: o.action || 'view', itemId: o.id, tab: o.tab || '' };
		}
	} catch (e) {}
	try {
		const up = new URLSearchParams(window.location.search);
		if (up.get('id')) return { action: up.get('action') || 'view', itemId: up.get('id'), tab: up.get('tab') || '' };
	} catch (e) {}
	try {
		const h = (window.location.hash || '').replace(/^#/, '');
		if (h) {
			const hp = new URLSearchParams(h);
			if (hp.get('id')) return { action: hp.get('action') || 'view', itemId: hp.get('id'), tab: hp.get('tab') || '' };
		}
	} catch (e) {}
	return { action: '', itemId: '', tab: '' };
}

window.handleUrlParams = handleUrlParams;
window.getIncomingParams = getIncomingParams;