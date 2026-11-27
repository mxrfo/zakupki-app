// ============================================================
// МОДУЛЬ: render.js
// ============================================================
// js/ui/render.js — Рендер карточек и таблицы

function getManagedDeptIds() {
	let d = (currentUser && currentUser.UF_DEPARTMENT) || [];
	if (!Array.isArray(d)) d = d ? [d] : [];
	let ids = d.map(String);
	if (currentRole === 'head' && simulatedHeadDeptId) ids = [simulatedHeadDeptId];
	return ids;
}

function getUserDeptIds() {
	let d = (currentUser && currentUser.UF_DEPARTMENT) || [];
	if (!Array.isArray(d)) d = d ? [d] : [];
	let ids = d.map(String);
	if (ids.length === 0) {
		Object.keys(settings.deptHeads || {}).forEach(k => { if (String(settings.deptHeads[k]) === String(currentUser.ID)) ids.push(String(k)); });
		Object.keys(settings.deptManagers || {}).forEach(k => { if (String(settings.deptManagers[k]) === String(currentUser.ID)) ids.push(String(k)); });
	}
	if (ids.length === 0 && (currentRole === 'admin' || currentRole === 'econ') && settings.visibleDepts && settings.visibleDepts.length) ids = settings.visibleDepts.map(String);
	return ids;
}

function isDeptHeadForItem(item) {
	if (currentRole === 'admin') return true;
	const deptVal = item[actualFields.dept];
	const deptId = Array.isArray(deptVal) ? deptVal[0] : deptVal;
	if (!deptId) return false;
	if (currentRole === 'head' && getManagedDeptIds().includes(String(deptId))) return true;
	if (settings.deptHeads[deptId] === String(currentUser.ID)) return true;
	const deptObj = departments.find(d => String(d.ID) === String(deptId));
	if (deptObj && String(deptObj.UF_HEAD) === String(currentUser.ID)) return true;
	return false;
}

function isDataAlreadySent(item, stName) {
	return stName.includes('загрузка') || stName.includes('обработка') || stName.includes('ожидание') || stName.includes('получение') || stName.includes('исполн') || stName.includes('успех');
}

function switchTab(tab) {
	activeTab = tab;
	document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
	const activeBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
	if (activeBtn) activeBtn.classList.add('active');
	render();
}

// ✅ Debounce для поиска (300 мс)
let _searchDebounceTimer = null;
function onSearchChange(val) {
	clearTimeout(_searchDebounceTimer);
	_searchDebounceTimer = setTimeout(() => {
		searchQuery = String(val || '').toLowerCase().trim();
		render();
	}, 300);
}

function changeSort(val) { currentSort = val; render(); }

function switchView(view) {
	currentView = view;
	const gridBtn = document.getElementById('view-btn-grid');
	const tableBtn = document.getElementById('view-btn-table');
	if (gridBtn) gridBtn.classList.toggle('active', view === 'grid');
	if (tableBtn) tableBtn.classList.toggle('active', view === 'table');
	render();
}

function render() {
	const container = document.getElementById('app-container');
	if (!container) return;
	container.innerHTML = '';
	if (activeTab === 'settings') return;
	if (!currentUser || !currentUser.ID) return;
	const isAdminUI = currentRole === 'admin';
	const isEconUI = isAdminUI || currentRole === 'econ';
	const isMgrUI = isAdminUI || currentRole === 'manager';
	const isHeadUI = isAdminUI || currentRole === 'head';
	let funnelItems = items.filter(i => String(i.categoryId) === String(currentCategoryId));
	if (isTestMode) {
		funnelItems = funnelItems.filter(i => String(i.createdBy) === String(currentUser.ID) && i.xmlId && String(i.xmlId).startsWith('TEST_APP_'));
	}
	let filtered = [];
	if (activeTab === 'my_requests') {
		filtered = funnelItems.filter(i => String(i.createdBy) === String(currentUser.ID));
	} else if (activeTab === 'inbox') {
		filtered = funnelItems.filter(i => {
			const st = spStages[i.stageId];
			if (!st) return false;
			const stName = String(st.name || '').toLowerCase().replace(/ё/g, 'е');
			if (stName.includes('создание')) return false;
			if (isAdminUI) return true;
			if (isEconUI && (stName.includes('согласование') || stName.includes('обработка') || stName.includes('ожидание'))) return true;
			const deptId = String(Array.isArray(i[actualFields.dept]) ? i[actualFields.dept][0] : (i[actualFields.dept] || ''));
			if (isHeadUI && getManagedDeptIds().includes(deptId) && (stName.includes('согласование') || stName.includes('корректировк') || stName.includes('сбор данных') || stName.includes('загрузка') || stName.includes('обработка') || stName.includes('ожидание') || stName.includes('получение'))) return true;
			if (isMgrUI && (stName.includes('сбор данных') || stName.includes('загрузка') || stName.includes('согласование') || stName.includes('корректировк'))) {
				const mgrVal = i[actualFields.manager];
				const mgrIds = Array.isArray(mgrVal) ? mgrVal : (mgrVal ? [mgrVal] : []);
				if (mgrIds.some(id => String(id) === String(currentUser.ID))) return true;
				if (settings.deptManagers[deptId] === String(currentUser.ID)) return true;
				if (settings.deptHeads[deptId] === String(currentUser.ID)) return true;
				const deptObj = departments.find(d => String(d.ID) === String(deptId));
				if (deptObj && String(deptObj.UF_HEAD) === String(currentUser.ID)) return true;
				return false;
			}
			return false;
		});
	} else if (activeTab === 'all') {
		if (isAdminUI || isEconUI) {
			filtered = funnelItems;
		} else {
			const userDeptIds = getUserDeptIds();
			filtered = funnelItems.filter(i => {
				const deptVal = i[actualFields.dept];
				const deptId = Array.isArray(deptVal) ? deptVal[0] : deptVal;
				return deptId && userDeptIds.includes(String(deptId));
			});
		}
	}
	if (searchQuery) {
		filtered = filtered.filter(i => {
			const shortTitle = String(i[actualFields.shortDesc] || i.title || '').toLowerCase();
			const creator = String(userNames[i.createdBy] || '').toLowerCase();
			const deptName = String(getDisplayValue(i, actualFields.dept, 'dept') || '').toLowerCase();
			return shortTitle.includes(searchQuery) || creator.includes(searchQuery) || deptName.includes(searchQuery);
		});
	}
	if (currentSort !== 'default') {
		filtered.sort((a, b) => {
			if (currentSort === 'deadline_asc') {
				const dateA = a[actualFields.deadlineZakup] ? new Date(a[actualFields.deadlineZakup]).getTime() : Infinity;
				const dateB = b[actualFields.deadlineZakup] ? new Date(b[actualFields.deadlineZakup]).getTime() : Infinity;
				return (isNaN(dateA) ? Infinity : dateA) - (isNaN(dateB) ? Infinity : dateB);
			}
			if (currentSort === 'date_desc') return (new Date(b.createdTime).getTime() || 0) - (new Date(a.createdTime).getTime() || 0);
			if (currentSort === 'amount_desc') return calculateTotalAmount(b) - calculateTotalAmount(a);
			if (currentSort === 'amount_asc') return calculateTotalAmount(a) - calculateTotalAmount(b);
			return 0;
		});
	} else {
		filtered.sort((a, b) => {
			const idxA = customOrder.indexOf(a.id);
			const idxB = customOrder.indexOf(b.id);
			if (idxA !== -1 && idxB !== -1) return idxA - idxB;
			if (idxA !== -1) return -1;
			if (idxB !== -1) return 1;
			return b.id - a.id;
		});
	}
	if (filtered.length === 0) {
		container.innerHTML = '<div class="loading loading-full">Нет закупок для отображения</div>';
		return;
	}
	if (currentView === 'grid') {
		container.className = 'notes-grid';
		renderGrid(container, filtered, isAdminUI, isEconUI, isMgrUI);
	} else {
		container.className = 'table-view';
		renderTable(container, filtered, isAdminUI, isEconUI, isMgrUI);
	}
}

function isTerminalStage(stName) {
	return stName.includes('успех') || stName.includes('провал') || stName.includes('отмен') || stName.includes('исполн') || stName.includes('заверш');
}

function hasBeenSentToWork(item, stName) {
	const taskId = item[actualFields.taskVyborSotr];
	const hasTask = taskId && String(taskId).match(/^\d+$/);
	const mgrVal = item[actualFields.manager];
	const hasManager = Array.isArray(mgrVal) ? mgrVal.length > 0 : !!mgrVal;
	return !!(hasTask || hasManager);
}

function approvalButtonsIcon(item) {
	const safeId = parseInt(item.id, 10);
	return `<button class="action-icon-btn approve" title="Согласовать" onclick="event.stopPropagation(); openActionModal(${safeId}, 'approve_terms')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>` +
	`<button class="action-icon-btn rework" title="На доработку" onclick="event.stopPropagation(); openActionModal(${safeId}, 'send_to_rework')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6a3 3 0 0 0-4.2 4.2L4 16.7V20h3.3l6.5-6.5a3 3 0 0 0 0-4.2z"/><path d="M18 8l2-2"/></svg></button>` +
	`<button class="action-icon-btn reject" title="Отклонить" onclick="event.stopPropagation(); openActionModal(${safeId}, 'reject_terms')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
}

const CLOCK_ICON = `<svg class="icon-clock" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="Отложено"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const ALERT_TRIANGLE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

function renderGrid(container, filtered, isAdminUI, isEconUI, isMgrUI) {
	const isHeadUI = isAdminUI || currentRole === 'head';
	const fragment = document.createDocumentFragment();
	const nowMs = Date.now();
	filtered.forEach((item, index) => {
		try {
			const safeId = parseInt(item.id, 10);
			const stage = spStages[item.stageId] || { name: 'Неизвестно', color: '#64748b' };
			const stName = String(stage.name || '').toLowerCase().replace(/ё/g, 'е');
			const isCreator = String(item.createdBy) === String(currentUser.ID);
			const stageColor = /^#[0-9a-fA-F]{3,8}$/.test(String(stage.color || '')) ? stage.color : '#64748b';
			const postponeDate = item[actualFields.postponeDate];
			const postponeMs = postponeDate ? new Date(postponeDate).getTime() : NaN;
			const isPostponed = !isNaN(postponeMs) && postponeMs > nowMs;
			const currentTotalAmount = Number(calculateTotalAmount(item)) || 0;
			const savedAmountRaw = approvedAmounts[item.id];
			const savedAmount = savedAmountRaw !== undefined ? Number(savedAmountRaw) : undefined;
			const isAmountChanged = savedAmount !== undefined && !isNaN(savedAmount) && Math.abs(savedAmount - currentTotalAmount) > 0.009;
			const dataSent = isDataAlreadySent(item, stName);
			const canDelegate = !isAdminUI && isDeptHeadForItem(item);
			let buttonsHtml = '';
			if (isCreator && stName.includes('создание') && !hasBeenSentToWork(item, stName)) {
				buttonsHtml += `<button class="btn btn-primary btn-full" onclick="event.stopPropagation(); openActionModal(${safeId}, 'send_to_work')" title="Отправить в работу">В работу</button>`;
				buttonsHtml += `<button class="action-icon-btn" title="Редактировать" onclick="event.stopPropagation(); openEditModal(${safeId})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
				buttonsHtml += `<button class="action-icon-btn delete" title="Удалить" onclick="event.stopPropagation(); deleteItem(${safeId}, event)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>`;
			} else if (isCreator && stName.includes('создание') && hasBeenSentToWork(item, stName)) {
				buttonsHtml += `<button class="btn btn-full btn-disabled-state" disabled title="Запрос отправлен в работу"><svg class="btn-icon-left" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Отправлено в работу</button>`;
			}
			if (isCreator && (stName.includes('ожидание получение') || stName.includes('получение заказа'))) {
				buttonsHtml += `<button class="btn btn-primary btn-full" onclick="event.stopPropagation(); openActionModal(${safeId}, 'confirm_receipt')" title="Подтвердить получение">Получено</button>`;
			}
			if (activeTab === 'inbox') {
				if (isMgrUI && stName.includes('сбор данных') && !dataSent) {
					buttonsHtml += `<button class="btn btn-full btn-dark" onclick="event.stopPropagation(); openDataModal(${safeId})"><svg class="btn-icon-left" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Заполнить</button>`;
				}
				if ((isMgrUI || isHeadUI) && stName.includes('корректировк') && !dataSent) {
					buttonsHtml += `<button class="btn btn-full btn-dark" onclick="event.stopPropagation(); openDataModal(${safeId})"><svg class="btn-icon-left" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Исправить данные</button>`;
				}
				if (isMgrUI && stName.includes('согласование') && !stName.includes('обработка')) {
					buttonsHtml += `<button class="btn btn-primary btn-full" onclick="event.stopPropagation(); openDataModal(${safeId})">Изменить данные</button>`;
				}
				if (isMgrUI && stName.includes('загрузка')) {
					buttonsHtml += `<button class="btn btn-full btn-dark" onclick="event.stopPropagation(); openUploadModal(${safeId})"><svg class="btn-icon-left" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Загрузить счет</button>`;
				}
				if (isEconUI && stName.includes('согласование условий')) {
					buttonsHtml += approvalButtonsIcon(item);
				}
				if (isEconUI && stName.includes('обработка входящего счета')) {
					if (!approvedInvoices[item.id]) {
						buttonsHtml += `<button class="action-icon-btn approve" title="Утвердить счет" onclick="event.stopPropagation(); openActionModal(${safeId}, 'approve_invoice')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>`;
					} else {
						buttonsHtml += `<button class="action-icon-btn approve" title="Подтвердить оплату" onclick="event.stopPropagation(); openActionModal(${safeId}, 'confirm_payment')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></button>`;
					}
					buttonsHtml += `<button class="action-icon-btn reject" title="Отклонить счет" onclick="event.stopPropagation(); openActionModal(${safeId}, 'reject_invoice')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
				}
			}
			const mgrVal2 = item[actualFields.manager];
			const hasMgr = Array.isArray(mgrVal2) ? mgrVal2.length > 0 : !!mgrVal2;
			if (canDelegate && hasMgr && !isTerminalStage(stName)) {
				buttonsHtml += `<button class="action-icon-btn" title="Делегировать" onclick="event.stopPropagation(); openDelegateModal(${safeId})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></button>`;
			}
			let adminActionsHtml = '';
			if (isAdminUI) {
				adminActionsHtml += `<button class="action-icon-btn" title="Редактировать" onclick="event.stopPropagation(); openEditModal(${safeId})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
				if (isPostponed) adminActionsHtml += `<button class="action-icon-btn" title="Снять отложку" onclick="event.stopPropagation(); openActionModal(${safeId}, 'remove_postpone')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="4" y1="4" x2="20" y2="20"/></svg></button>`;
				if (!stName.includes('создание')) adminActionsHtml += `<button class="action-icon-btn" title="Откатить" onclick="event.stopPropagation(); rollbackItem(${safeId})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg></button>`;
				if (hasMgr && !isTerminalStage(stName)) adminActionsHtml += `<button class="action-icon-btn" title="Делегировать" onclick="event.stopPropagation(); openDelegateModal(${safeId})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></button>`;
				adminActionsHtml += `<button class="action-icon-btn delete" title="Удалить" onclick="deleteItem(${safeId}, event)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>`;
			}
			const deptName = escapeHtml(getDisplayValue(item, actualFields.dept, 'dept'));
			// ✅ getDeadlineDisplay уже возвращает безопасный HTML — НЕ экранируем повторно
			const deadlineDisplay = getDeadlineDisplay(item[actualFields.deadlineZakup]);
			const amount = escapeHtml(formatMoney(currentTotalAmount));
			const mainTitle = escapeHtml(cleanText(item.title) || 'Без названия');
			const shortDesc = escapeHtml(getShortDesc(item));
			const fileInfo = getFileInfo(item, actualFields.fileInvoice);
			const econComment = escapeHtml(cleanText(item[actualFields.comment]));
			const creatorDept = escapeHtml(userDepts[item.createdBy] || '—');
			const isInvoiceStageOrLater = stName.includes('загрузка') || stName.includes('обработка') || stName.includes('ожидание') || stName.includes('получение') || stName.includes('исполнено') || stName.includes('успех');
			const canSeeInvoice = !(activeTab === 'all' && currentRole !== 'admin' && currentRole !== 'econ');
			const showInvoice = !!(fileInfo && isSafeHttpUrl(fileInfo.url) && isInvoiceStageOrLater && canSeeInvoice);
			const combinedDirText = escapeHtml(resolveCombinedDir(item) || '—');
			let mgrUnavailableBadge = '';
			const mgrIds2 = Array.isArray(item[actualFields.manager]) ? item[actualFields.manager] : (item[actualFields.manager] ? [item[actualFields.manager]] : []);
			if (mgrIds2.length && isUserUnavailable(mgrIds2[0])) {
				mgrUnavailableBadge = `<span class="badge-unavailable">${ALERT_TRIANGLE_ICON} недоступен</span>`;
			}
			const card = document.createElement('div');
			card.className = 'note-card';
			card.setAttribute('data-stage-color', 'true');
			card.setAttribute('data-id', safeId);
			card.setAttribute('draggable', 'true');
			card.style.setProperty('--stage-color', stageColor);
			card.style.setProperty('--i', index);
			card.onclick = () => openViewModal(safeId);
			// ✅ isFullView = inbox (полная карточка), иначе — компактная
			const isFullView = (activeTab === 'inbox');
			const safeFileName = showInvoice ? escapeHtml(fileInfo.name.length > 15 ? fileInfo.name.substring(0, 12) + '...' : fileInfo.name) : '—';
			const safeFileUrl = showInvoice ? escapeHtml(fileInfo.url) : '';
			const safeStageName = escapeHtml(stage.name || 'Неизвестно');
			const infoHtml = `
<div class="note-info-grid">
<div class="note-info-item"><span class="note-info-label">Срок</span><span class="note-info-value">${deadlineDisplay}</span></div>
<div class="note-info-item"><span class="note-info-label">Заказчик (Отдел)</span><span class="note-info-value">${creatorDept}</span></div>
${currentRole !== 'manager' ? `<div class="note-info-item"><span class="note-info-label">Исполнитель</span><span class="note-info-value">${deptName}</span></div>` : ''}
${isFullView ? `
<div class="note-info-item"><span class="note-info-label">Сумма</span><span class="note-info-value amount-highlight">${amount}</span></div>
<div class="note-info-item"><span class="note-info-label">Раздел/Напр</span><span class="note-info-value">${combinedDirText}</span></div>${isInvoiceStageOrLater && canSeeInvoice ? `<div class="note-info-item"><span class="note-info-label">Счет</span><span class="note-info-value">${showInvoice ? `<a class="file-link" href="${safeFileUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${safeFileName}</a>` : '—'}</span></div>` : ''}
` : `<div class="note-info-item"><span class="note-info-label">Сумма (примерно)</span><span class="note-info-value amount-highlight">${amount}</span></div>`}
</div>
${isFullView && econComment ? `<div class="note-comment-box"><b>Комментарий:</b> ${econComment}</div>` : ''}
${isFullView && isAmountChanged ? `<div class="note-warning-box">${ALERT_TRIANGLE_ICON} Сумма изменена! Было согласовано: ${escapeHtml(formatMoney(savedAmount))}, сейчас: ${escapeHtml(formatMoney(currentTotalAmount))}</div>` : ''}
`;
			let badgeHtml = `<span class="note-badge" style="background:${stageColor}">${safeStageName}</span>`;
			if (isPostponed) badgeHtml = `<span class="note-badge" style="background:${stageColor}">${safeStageName}</span>${CLOCK_ICON}`;
			card.innerHTML = `
<div class="note-header"><h3 class="note-title">${mainTitle}${mgrUnavailableBadge}</h3>${badgeHtml}</div>
<div class="note-desc">${shortDesc}</div>
${infoHtml}
<div class="note-footer">${buttonsHtml ? `<div class="note-actions">${buttonsHtml}</div>` : ''}${adminActionsHtml ? `<div class="note-admin-actions">${adminActionsHtml}</div>` : ''}</div>
`;
			card.addEventListener('dragstart', handleDragStart);
			card.addEventListener('dragover', handleDragOver);
			card.addEventListener('drop', handleDrop);
			card.addEventListener('dragend', handleDragEnd);
			fragment.appendChild(card);
		} catch (err) {
			console.error('Ошибка рендера:', err, item);
			logAction(`Ошибка рендера ID ${item && item.id}: ${err.message}`, 'error');
		}
	});
	container.appendChild(fragment);
}

function renderTable(container, filtered, isAdminUI, isEconUI, isMgrUI) {
	const isHeadUI = isAdminUI || currentRole === 'head';
	const nowMs = Date.now();
	let html = `<table class="data-table">
<thead><tr><th>Название</th><th>Статус</th><th class="col-sec">Заказчик / Отдел</th><th class="col-sec">Исполнитель</th><th>Сумма</th><th>Срок</th><th class="col-sec">Раздел/Напр</th><th class="actions-cell">Действия</th>${isAdminUI ? `<th class="actions-cell">Админ</th>` : ''}</tr></thead><tbody>`;
	filtered.forEach((item, index) => {
		const safeId = parseInt(item.id, 10);
		const stage = spStages[item.stageId] || { name: 'Неизвестно', color: '#64748b' };
		const stName = String(stage.name || '').toLowerCase().replace(/ё/g, 'е');
		const isCreator = String(item.createdBy) === String(currentUser.ID);
		const stageColor = /^#[0-9a-fA-F]{3,8}$/.test(String(stage.color || '')) ? stage.color : '#64748b';
		const currentTotalAmount = Number(calculateTotalAmount(item)) || 0;
		// ✅ Экранирование всех полей CRM
		const deptName = escapeHtml(getDisplayValue(item, actualFields.dept, 'dept'));
		const deadlineDisplay = getDeadlineDisplay(item[actualFields.deadlineZakup]);
		const mainTitle = escapeHtml(cleanText(item.title) || 'Без названия');
		const creatorName = escapeHtml(userNames[item.createdBy] || '—');
		const creatorDept = escapeHtml(userDepts[item.createdBy] || '—');
		const econCommentRaw = cleanText(item[actualFields.comment]);
		const econComment = escapeHtml(econCommentRaw);
		const dataSent = isDataAlreadySent(item, stName);
		const combinedDirText = escapeHtml(resolveCombinedDir(item) || '—');
		const canDelegate = !isAdminUI && isDeptHeadForItem(item);
		const postponeDate = item[actualFields.postponeDate];
		const postponeMs = postponeDate ? new Date(postponeDate).getTime() : NaN;
		const isPostponed = !isNaN(postponeMs) && postponeMs > nowMs;
		let buttonsHtml = '';
		if (isCreator && stName.includes('создание') && !hasBeenSentToWork(item, stName)) {
			buttonsHtml += `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openActionModal(${safeId}, 'send_to_work')">В работу</button>`;
			buttonsHtml += `<button class="action-icon-btn" title="Редактировать" onclick="event.stopPropagation(); openEditModal(${safeId})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
			buttonsHtml += `<button class="action-icon-btn delete" title="Удалить" onclick="event.stopPropagation(); deleteItem(${safeId}, event)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>`;
		} else if (isCreator && stName.includes('создание') && hasBeenSentToWork(item, stName)) {
			buttonsHtml += `<button class="btn btn-sm btn-disabled-state" disabled>✓ Отправлено</button>`;
		}
		if (isCreator && (stName.includes('ожидание получение') || stName.includes('получение заказа'))) {
			buttonsHtml += `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openActionModal(${safeId}, 'confirm_receipt')">Получено</button>`;
		}
		if (activeTab === 'inbox') {
			if (isMgrUI && stName.includes('сбор данных') && !dataSent) {
				buttonsHtml += `<button class="btn btn-sm btn-dark" onclick="event.stopPropagation(); openDataModal(${safeId})">Заполнить</button>`;
			}
			if ((isMgrUI || isHeadUI) && stName.includes('корректировк') && !dataSent) {
				buttonsHtml += `<button class="btn btn-sm btn-dark" onclick="event.stopPropagation(); openDataModal(${safeId})">Исправить данные</button>`;
			}
			if (isMgrUI && stName.includes('согласование') && !stName.includes('обработка')) {
				buttonsHtml += `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openDataModal(${safeId})">Изменить данные</button>`;
			}
			if (isMgrUI && stName.includes('загрузка')) {
				buttonsHtml += `<button class="btn btn-sm btn-dark" onclick="event.stopPropagation(); openUploadModal(${safeId})">Загрузить счет</button>`;
			}
			if (isEconUI && stName.includes('согласование условий')) {
				buttonsHtml += approvalButtonsIcon(item);
			}
			if (isEconUI && stName.includes('обработка входящего счета')) {
				if (!approvedInvoices[item.id]) {
					buttonsHtml += `<button class="action-icon-btn approve" title="Утвердить счет" onclick="event.stopPropagation(); openActionModal(${safeId}, 'approve_invoice')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>`;
				} else {
					buttonsHtml += `<button class="action-icon-btn approve" title="Подтвердить оплату" onclick="event.stopPropagation(); openActionModal(${safeId}, 'confirm_payment')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></button>`;
				}
				buttonsHtml += `<button class="action-icon-btn reject" title="Отклонить счет" onclick="event.stopPropagation(); openActionModal(${safeId}, 'reject_invoice')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
			}
		}
		const mgrValT = item[actualFields.manager];
		const hasMgrT = Array.isArray(mgrValT) ? mgrValT.length > 0 : !!mgrValT;
		if (canDelegate && hasMgrT && !isTerminalStage(stName)) {
			buttonsHtml += `<button class="action-icon-btn" title="Делегировать" onclick="event.stopPropagation(); openDelegateModal(${safeId})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></button>`;
		}
		let adminHtml = '';
		if (isAdminUI) {
			adminHtml += `<button class="action-icon-btn" title="Редактировать" onclick="event.stopPropagation(); openEditModal(${safeId})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
			if (!stName.includes('создание')) adminHtml += `<button class="action-icon-btn" title="Откатить" onclick="event.stopPropagation(); rollbackItem(${safeId})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg></button>`;
			if (hasMgrT && !isTerminalStage(stName)) adminHtml += `<button class="action-icon-btn" title="Делегировать" onclick="event.stopPropagation(); openDelegateModal(${safeId})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></button>`;
			adminHtml += `<button class="action-icon-btn delete" title="Удалить" onclick="deleteItem(${safeId}, event)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>`;
		}
		const commentIcon = econCommentRaw ? `<span class="comment-icon" title="${econComment}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></span>` : '';
		const clockIcon = isPostponed ? CLOCK_ICON : '';
		const safeStageName = escapeHtml(stage.name || 'Неизвестно');
		const safeShortDesc = escapeHtml(getShortDesc(item));
		html += `<tr style="--i:${index}">
<td><div class="clickable-title" onclick="openViewModal(${safeId})">${mainTitle} ${commentIcon} ${clockIcon}</div><div class="td-secondary">${creatorDept} · ${deptName} · ${combinedDirText}</div><div class="text-muted-small">${safeShortDesc}</div></td>
<td><span class="note-badge" style="background:${stageColor}">${safeStageName}</span></td>
<td class="col-sec"><div class="text-bold">${creatorName}</div><div class="text-muted-small">${creatorDept}</div></td>
${currentRole !== 'manager' ? `<td class="col-sec">${deptName}</td>` : ''}
<td class="text-bold text-nowrap">${escapeHtml(formatMoney(currentTotalAmount))}</td>
<td class="text-nowrap">${deadlineDisplay}</td>
<td class="col-sec">${combinedDirText}</td>
<td class="actions-cell"><div class="btn-group">${buttonsHtml}</div></td>
${isAdminUI ? `<td class="actions-cell"><div class="btn-group">${adminHtml}</div></td>` : ''}
</tr>`;
	});
	html += `</tbody></table>`;
	container.innerHTML = html;
}
// ============================================================
// КОНЕЦ МОДУЛЯ: render.js
// ============================================================