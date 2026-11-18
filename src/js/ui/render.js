// js/render.js — Рендер карточек и таблицы

// ✅ Утилита: пользователь — руководитель отдела закупки?
function isDeptHeadForItem(item) {
  if (currentRole === 'admin') return true;
  const deptVal = item[actualFields.dept];
  const deptId = Array.isArray(deptVal) ? deptVal[0] : deptVal;
  if (!deptId) return false;
  if (settings.deptHeads[deptId] === String(currentUser.ID)) return true;
  const deptObj = departments.find(d => String(d.ID) === String(deptId));
  if (deptObj && String(deptObj.UF_HEAD) === String(currentUser.ID)) return true;
  return false;
}

// ✅ Утилита: отделы текущего пользователя (ID массив)
function getUserDeptIds() {
  let d = (currentUser && currentUser.UF_DEPARTMENT) || [];
  if (!Array.isArray(d)) d = d ? [d] : [];
  return d.map(String);
}

// Переключение вкладок
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
  render();
}

// Поиск
function onSearchChange(val) {
  searchQuery = val.toLowerCase().trim();
  render();
}

// Сортировка
function changeSort(val) {
  currentSort = val;
  render();
}

// Переключение вида
function switchView(view) {
  currentView = view;
  document.getElementById('view-btn-grid').classList.toggle('active', view === 'grid');
  document.getElementById('view-btn-table').classList.toggle('active', view === 'table');
  render();
}

// Главный рендер
function render() {
  const container = document.getElementById('app-container');
  container.innerHTML = '';
  if (activeTab === 'settings') return;

  const isAdminUI = currentRole === 'admin';
  const isEconUI = isAdminUI || currentRole === 'econ';
  const isMgrUI = isAdminUI || currentRole === 'manager';

  let funnelItems = items.filter(i => String(i.categoryId) === String(currentCategoryId));
  if (isTestMode) {
    funnelItems = funnelItems.filter(i =>
      String(i.createdBy) === String(currentUser.ID) &&
      i.xmlId && i.xmlId.startsWith('TEST_APP_')
    );
  }

  let filtered = [];
  if (activeTab === 'my_requests') {
    filtered = funnelItems.filter(i => String(i.createdBy) === String(currentUser.ID));
  } else if (activeTab === 'inbox') {
    filtered = funnelItems.filter(i => {
      const st = spStages[i.stageId];
      if (!st) return false;
      const stName = st.name.toLowerCase().replace(/ё/g, 'е');
      if (stName.includes('создание')) return false;
      if (isAdminUI) return true;
      if (isEconUI && (stName.includes('согласование') || stName.includes('обработка') || stName.includes('ожидание'))) return true;
      if (isMgrUI && (stName.includes('сбор данных') || stName.includes('загрузка') || stName.includes('согласование'))) {
        const mgrVal = i[actualFields.manager];
        const mgrIds = Array.isArray(mgrVal) ? mgrVal : (mgrVal ? [mgrVal] : []);
        if (mgrIds.some(id => String(id) === String(currentUser.ID))) return true;
        const deptId = Array.isArray(i[actualFields.dept]) ? i[actualFields.dept][0] : i[actualFields.dept];
        if (settings.deptManagers[deptId] === String(currentUser.ID)) return true;
        if (settings.deptHeads[deptId] === String(currentUser.ID)) return true;
        const deptObj = departments.find(d => String(d.ID) === String(deptId));
        if (deptObj && String(deptObj.UF_HEAD) === String(currentUser.ID)) return true;
        return false;
      }
      return false;
    });
  } else if (activeTab === 'all') {
    // ✅ Для админа и экономиста — все закупки. Для сотрудника/руководителя — только свой отдел.
    if (isAdminUI || isEconUI) {
      filtered = funnelItems;
    } else {
      const userDepts = getUserDeptIds();
      filtered = funnelItems.filter(i => {
        const deptVal = i[actualFields.dept];
        const deptId = Array.isArray(deptVal) ? deptVal[0] : deptVal;
        return deptId && userDepts.includes(String(deptId));
      });
    }
  }

  if (searchQuery) {
    filtered = filtered.filter(i => {
      const shortTitle = (i[actualFields.shortDesc] || i.title || '').toLowerCase();
      const creator = (userNames[i.createdBy] || '').toLowerCase();
      const deptName = (getDisplayValue(i, actualFields.dept, 'dept') || '').toLowerCase();
      return shortTitle.includes(searchQuery) || creator.includes(searchQuery) || deptName.includes(searchQuery);
    });
  }

  if (currentSort !== 'default') {
    filtered.sort((a, b) => {
      if (currentSort === 'deadline_asc') {
        const dateA = a[actualFields.deadlineZakup] ? new Date(a[actualFields.deadlineZakup]).getTime() : Infinity;
        const dateB = b[actualFields.deadlineZakup] ? new Date(b[actualFields.deadlineZakup]).getTime() : Infinity;
        return dateA - dateB;
      }
      if (currentSort === 'date_desc') return new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime();
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
    container.innerHTML = '<div class="loading" style="grid-column: 1/-1;">Нет закупок для отображения</div>';
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

// Утилита: терминальные стадии
function isTerminalStage(stName) {
  return stName.includes('успех') ||
    stName.includes('провал') ||
    stName.includes('отмен') ||
    stName.includes('исполн') ||
    stName.includes('заверш');
}

// ✅ Утилита: закупка уже отправлена в работу
function hasBeenSentToWork(item, stName) {
  const taskId = item[actualFields.taskVyborSotr];
  const hasTask = taskId && String(taskId).match(/^\d+$/);
  const mgrVal = item[actualFields.manager];
  const hasManager = Array.isArray(mgrVal) ? mgrVal.length > 0 : !!mgrVal;
  return !!(hasTask || hasManager);
}

// Рендер карточек
function renderGrid(container, filtered, isAdminUI, isEconUI, isMgrUI) {
  const fragment = document.createDocumentFragment();
  filtered.forEach(item => {
    try {
      const stage = spStages[item.stageId] || { name: 'Неизвестно', color: '#64748b' };
      const stName = stage.name.toLowerCase().replace(/ё/g, 'е');
      const isCreator = String(item.createdBy) === String(currentUser.ID);
      const stageColor = stage.color || '#64748b';
      const postponeDate = item[actualFields.postponeDate];
      const isPostponed = postponeDate && new Date(postponeDate) > new Date();
      const currentTotalAmount = calculateTotalAmount(item);
      const savedAmount = approvedAmounts[item.id];
      const isAmountChanged = savedAmount !== undefined && savedAmount !== currentTotalAmount;

      let buttonsHtml = '';

      if (isCreator && stName.includes('создание') && !hasBeenSentToWork(item, stName)) {
        buttonsHtml += `<button class="btn btn-primary" style="flex:1;" onclick="event.stopPropagation(); openActionModal(${item.id}, 'send_to_work')" title="Отправить в работу">В работу</button>`;
        buttonsHtml += `<button class="action-icon-btn" onclick="event.stopPropagation(); openEditModal(${item.id})" title="Редактировать"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
        buttonsHtml += `<button class="action-icon-btn delete" onclick="event.stopPropagation(); deleteItem(${item.id}, event)" title="Удалить"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>`;
      }
      else if (isCreator &&
               stName.includes('создание') &&
               hasBeenSentToWork(item, stName)) {
        buttonsHtml += `
          <button class="btn" disabled
            style="flex:1; background:#e2e8f0; color:#64748b; border-color:#cbd5e1; cursor:not-allowed; opacity:.9;"
            title="Запрос отправлен в работу. Редактирование и удаление недоступны.">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><polyline points="20 6 9 17 4 12"/></svg>
            Отправлено в работу
          </button>`;
      }

      if (isCreator && (stName.includes('ожидание получение') || stName.includes('получение заказа'))) {
        buttonsHtml += `<button class="btn btn-primary" style="flex:1;" onclick="event.stopPropagation(); openActionModal(${item.id}, 'confirm_receipt')" title="Подтвердить получение">Получено</button>`;
      }

      if (activeTab === 'inbox') {
        if (isMgrUI && stName.includes('сбор данных')) {
          buttonsHtml += `<button class="btn btn-dark" style="flex:1; background:#1e293b; color:#fff; border:none;" onclick="event.stopPropagation(); openDataModal(${item.id})">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Заполнить</button>`;
        }
        if (isMgrUI && stName.includes('загрузка')) {
          buttonsHtml += `<button class="btn btn-dark" style="flex:1; background:#1e293b; color:#fff; border:none;" onclick="event.stopPropagation(); openUploadModal(${item.id})">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Загрузить счет</button>`;
        }
        if (currentRole === 'manager' && stName.includes('согласование')) {
          buttonsHtml += `<button class="btn btn-primary" style="flex:1;" onclick="event.stopPropagation(); openEditAmountModal(${item.id})">Изменить сумму</button>`;
        }
        if (isEconUI && stName.includes('согласование условий')) {
          buttonsHtml += `<button class="action-icon-btn approve" style="width:auto; padding:0 16px;" onclick="event.stopPropagation(); openActionModal(${item.id}, 'approve_terms')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Согласовать</button>`;
          buttonsHtml += `<button class="action-icon-btn reject" style="width:auto; padding:0 16px;" onclick="event.stopPropagation(); openActionModal(${item.id}, 'reject_terms')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Отклонить</button>`;
        }
        if (isEconUI && stName.includes('обработка входящего счета')) {
          if (!approvedInvoices[item.id]) {
            buttonsHtml += `<button class="action-icon-btn approve" style="width:auto; padding:0 16px;" onclick="event.stopPropagation(); openActionModal(${item.id}, 'approve_invoice')" title="Утвердить счет"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Утвердить</button>`;
          } else {
            buttonsHtml += `<button class="action-icon-btn approve" style="width:auto; padding:0 16px; background:#e0f2fe; color:#0369a1;" onclick="event.stopPropagation(); openActionModal(${item.id}, 'confirm_payment')" title="Подтвердить оплату"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> Оплачено</button>`;
          }
          buttonsHtml += `<button class="action-icon-btn reject" style="width:auto; padding:0 16px;" onclick="event.stopPropagation(); openActionModal(${item.id}, 'reject_invoice')" title="Отклонить счет"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Отклонить</button>`;
        }
      }

      // ✅ Админские кнопки — ВСЕГДА доступны
      let adminActionsHtml = '';
      if (isAdminUI) {
        adminActionsHtml += `<button class="action-icon-btn" onclick="event.stopPropagation(); openEditModal(${item.id})" title="Редактировать"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;

        if (isPostponed) {
          adminActionsHtml += `<button class="action-icon-btn" onclick="event.stopPropagation(); openActionModal(${item.id}, 'remove_postpone')" title="Снять отложку"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="4" y1="4" x2="20" y2="20"/></svg></button>`;
        }

        if (!stName.includes('создание')) {
          adminActionsHtml += `<button class="action-icon-btn" onclick="event.stopPropagation(); rollbackItem(${item.id})" title="Откатить"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg></button>`;
        }

        adminActionsHtml += `<button class="action-icon-btn delete" onclick="deleteItem(${item.id}, event)" title="Удалить"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>`;
      }

      // ✅ Кнопка делегирования — для руководителя отдела и админа, если есть менеджер и стадия не терминальная
      const mgrVal2 = item[actualFields.manager];
      const hasMgr = Array.isArray(mgrVal2) ? mgrVal2.length > 0 : !!mgrVal2;
      if ((isAdminUI || isDeptHeadForItem(item)) && hasMgr && !isTerminalStage(stName)) {
        adminActionsHtml += `<button class="action-icon-btn" onclick="event.stopPropagation(); openDelegateModal(${item.id})" title="Делегировать"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></button>`;
      }

      const deptName = getDisplayValue(item, actualFields.dept, 'dept');
      const deadlineDisplay = getDeadlineDisplay(item[actualFields.deadlineZakup]);
      const amount = formatMoney(currentTotalAmount);
      const mainTitle = cleanText(item.title) || 'Без названия';
      const shortDesc = cleanText(item[actualFields.shortDesc]) || '—';
      const fileInfo = getFileInfo(item, actualFields.fileInvoice);
      const econComment = cleanText(item[actualFields.comment]);
      const isInvoiceStageOrLater = stName.includes('загрузка') || stName.includes('обработка') || stName.includes('ожидание') || stName.includes('получение') || stName.includes('исполнено') || stName.includes('успех');
      const showInvoice = fileInfo && fileInfo.url && isInvoiceStageOrLater;
      let combinedDirText = item[actualFields.combinedDir] || '—';
      if (combinedDirText === '—' && item[actualFields.section]) {
        const secName = getDisplayValue(item, actualFields.section, 'enum');
        const dirName = getDisplayValue(item, actualFields.direction, 'enum');
        if (secName !== '—') combinedDirText = `${secName} / ${dirName}`;
      }

      // ✅ Индикатор недоступности менеджера
      let mgrUnavailableBadge = '';
      const mgrIds2 = Array.isArray(item[actualFields.manager]) ? item[actualFields.manager] : (item[actualFields.manager] ? [item[actualFields.manager]] : []);
      if (mgrIds2.length && isUserUnavailable(mgrIds2[0])) {
        mgrUnavailableBadge = `<span style="color:#ef4444; font-size:11px; font-weight:600; margin-left:6px;">⚠ недоступен</span>`;
      }

      const card = document.createElement('div');
      card.className = 'note-card';
      card.setAttribute('data-stage-color', 'true');
      card.setAttribute('data-id', item.id);
      card.setAttribute('draggable', 'true');
      card.style.setProperty('--stage-color', stageColor);
      card.onclick = () => openViewModal(item.id);
      const isCompactView = (activeTab === 'my_requests' || activeTab === 'all');

      let infoHtml = `
        <div class="note-info-grid">
          <div class="note-info-item">
            <span class="note-info-label">Срок</span>
            <span class="note-info-value">${deadlineDisplay}</span>
          </div>
          <div class="note-info-item">
            <span class="note-info-label">Заказчик (Отдел)</span>
            <span class="note-info-value">${userDepts[item.createdBy] || '—'}</span>
          </div>
          ${currentRole !== 'manager' ? `<div class="note-info-item"><span class="note-info-label">Исполнитель</span><span class="note-info-value">${deptName}</span></div>` : ''}
          ${!isCompactView ? `
            <div class="note-info-item">
              <span class="note-info-label">Сумма</span>
              <span class="note-info-value amount-highlight">${amount}</span>
            </div>
            <div class="note-info-item">
              <span class="note-info-label">Раздел/Напр</span>
              <span class="note-info-value">${combinedDirText}</span>
            </div>
            ${isInvoiceStageOrLater ? `<div class="note-info-item"><span class="note-info-label">Счет</span><span class="note-info-value">${showInvoice ? `<a href="${fileInfo.url}" target="_blank" onclick="event.stopPropagation()" style="color: var(--brand-blue); text-decoration: underline; font-weight: 600;" title="${fileInfo.name}">${fileInfo.name.length > 15 ? fileInfo.name.substring(0, 12) + '...' : fileInfo.name}</a>` : '—'}</span></div>` : ''}
          ` : `
            <div class="note-info-item">
              <span class="note-info-label">Сумма (примерно)</span>
              <span class="note-info-value amount-highlight">${amount}</span>
            </div>
          `}
        </div>
        ${!isCompactView && econComment ? `<div class="note-comment-box"><b>Комментарий:</b> ${econComment}</div>` : ''}
        ${!isCompactView && isAmountChanged ? `<div class="note-warning-box">⚠ Сумма изменена! Было согласовано: ${formatMoney(savedAmount)}, сейчас: ${formatMoney(currentTotalAmount)}</div>` : ''}
      `;

      let badgeHtml = `<span class="note-badge" style="background:${stageColor}">${stage.name}</span>`;
      if (isPostponed) {
        badgeHtml = `<span class="note-badge postponed">Ожидает даты: ${new Date(postponeDate).toLocaleDateString('ru-RU')}</span>`;
      }

      card.innerHTML = `
        <div class="note-header">
          <h3 class="note-title">${mainTitle}${mgrUnavailableBadge}</h3>
          ${badgeHtml}
        </div>
        <div class="note-desc">${shortDesc}</div>
        ${infoHtml}
        <div class="note-footer">
          <div class="note-actions">${buttonsHtml}</div>
          ${adminActionsHtml ? `<div class="note-admin-actions">${adminActionsHtml}</div>` : ''}
        </div>
      `;

      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragover', handleDragOver);
      card.addEventListener('drop', handleDrop);
      card.addEventListener('dragend', handleDragEnd);
      fragment.appendChild(card);
    } catch (err) {
      console.error('Ошибка рендера карточки:', err, item);
      logAction(`Ошибка рендера ID ${item.id}: ${err.message}`, 'error');
    }
  });
  container.appendChild(fragment);
}

// Рендер таблицы
function renderTable(container, filtered, isAdminUI, isEconUI, isMgrUI) {
  let html = `<table class="data-table">
    <thead>
      <tr>
        <th>Название</th>
        <th>Статус</th>
        <th>Заказчик / Отдел</th>
        ${currentRole !== 'manager' ? `<th>Исполнитель</th>` : ''}
        <th>Сумма</th>
        <th>Срок</th>
        <th>Раздел/Напр</th>
        <th class="actions-cell">Действия</th>
        ${isAdminUI ? `<th class="actions-cell">Админ</th>` : ''}
      </tr>
    </thead>
    <tbody>`;

  filtered.forEach(item => {
    const stage = spStages[item.stageId] || { name: 'Неизвестно', color: '#64748b' };
    const stName = stage.name.toLowerCase().replace(/ё/g, 'е');
    const isCreator = String(item.createdBy) === String(currentUser.ID);
    const stageColor = stage.color || '#64748b';
    const currentTotalAmount = calculateTotalAmount(item);
    const deptName = getDisplayValue(item, actualFields.dept, 'dept');
    const deadlineDisplay = getDeadlineDisplay(item[actualFields.deadlineZakup]);
    const mainTitle = cleanText(item.title) || 'Без названия';
    const creatorName = userNames[item.createdBy] || '—';
    const creatorDept = userDepts[item.createdBy] || '—';
    const econComment = cleanText(item[actualFields.comment]);
    let combinedDirText = item[actualFields.combinedDir] || '—';
    if (combinedDirText === '—' && item[actualFields.section]) {
      const secName = getDisplayValue(item, actualFields.section, 'enum');
      const dirName = getDisplayValue(item, actualFields.direction, 'enum');
      if (secName !== '—') combinedDirText = `${secName} / ${dirName}`;
    }

    let buttonsHtml = '';

    if (isCreator && stName.includes('создание') && !hasBeenSentToWork(item, stName)) {
      buttonsHtml += `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openActionModal(${item.id}, 'send_to_work')">В работу</button>`;
      buttonsHtml += `<button class="action-icon-btn" onclick="event.stopPropagation(); openEditModal(${item.id})" title="Редактировать"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
      buttonsHtml += `<button class="action-icon-btn delete" onclick="event.stopPropagation(); deleteItem(${item.id}, event)" title="Удалить"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>`;
    }
    else if (isCreator &&
             stName.includes('создание') &&
             hasBeenSentToWork(item, stName)) {
      buttonsHtml += `<button class="btn btn-sm" disabled style="background:#e2e8f0; color:#64748b; cursor:not-allowed; opacity:.9;" title="Запрос отправлен в работу">✓ Отправлено</button>`;
    }

    if (isCreator && (stName.includes('ожидание получение') || stName.includes('получение заказа'))) {
      buttonsHtml += `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openActionModal(${item.id}, 'confirm_receipt')">Получено</button>`;
    }

    if (activeTab === 'inbox') {
      if (isMgrUI && stName.includes('сбор данных')) {
        buttonsHtml += `<button class="btn btn-dark btn-sm" style="background:#1e293b;color:#fff;border:none;" onclick="event.stopPropagation(); openDataModal(${item.id})">Заполнить</button>`;
      }
      if (isMgrUI && stName.includes('загрузка')) {
        buttonsHtml += `<button class="btn btn-dark btn-sm" style="background:#1e293b;color:#fff;border:none;" onclick="event.stopPropagation(); openUploadModal(${item.id})">Загрузить счет</button>`;
      }
      if (currentRole === 'manager' && stName.includes('согласование')) {
        buttonsHtml += `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openEditAmountModal(${item.id})">Изменить сумму</button>`;
      }
      if (isEconUI && stName.includes('согласование условий')) {
        buttonsHtml += `<button class="action-icon-btn approve btn-sm" style="width:auto;" onclick="event.stopPropagation(); openActionModal(${item.id}, 'approve_terms')">Согласовать</button>`;
        buttonsHtml += `<button class="action-icon-btn reject btn-sm" style="width:auto;" onclick="event.stopPropagation(); openActionModal(${item.id}, 'reject_terms')">Отклонить</button>`;
      }
      if (isEconUI && stName.includes('обработка входящего счета')) {
        if (!approvedInvoices[item.id]) {
          buttonsHtml += `<button class="action-icon-btn approve btn-sm" style="width:auto;" onclick="event.stopPropagation(); openActionModal(${item.id}, 'approve_invoice')">Утвердить</button>`;
        } else {
          buttonsHtml += `<button class="action-icon-btn approve btn-sm" style="width:auto; background:#e0f2fe; color:#0369a1;" onclick="event.stopPropagation(); openActionModal(${item.id}, 'confirm_payment')">Оплачено</button>`;
        }
        buttonsHtml += `<button class="action-icon-btn reject btn-sm" style="width:auto;" onclick="event.stopPropagation(); openActionModal(${item.id}, 'reject_invoice')">Отклонить</button>`;
      }
    }

    let adminHtml = '';
    if (isAdminUI) {
      adminHtml += `<button class="action-icon-btn" onclick="event.stopPropagation(); openEditModal(${item.id})" title="Редактировать"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;

      if (!stName.includes('создание')) {
        adminHtml += `<button class="action-icon-btn" onclick="event.stopPropagation(); rollbackItem(${item.id})" title="Откатить"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg></button>`;
      }

      adminHtml += `<button class="action-icon-btn delete" onclick="deleteItem(${item.id}, event)" title="Удалить"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>`;
    }

    // ✅ Кнопка делегирования в таблице
    const mgrValT = item[actualFields.manager];
    const hasMgrT = Array.isArray(mgrValT) ? mgrValT.length > 0 : !!mgrValT;
    if ((isAdminUI || isDeptHeadForItem(item)) && hasMgrT && !isTerminalStage(stName)) {
      adminHtml += `<button class="action-icon-btn" onclick="event.stopPropagation(); openDelegateModal(${item.id})" title="Делегировать"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></button>`;
    }

    const commentIcon = econComment ? `<span class="comment-icon" title="${econComment.replace(/"/g, '&quot;')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></span>` : '';

    html += `
      <tr>
        <td>
          <div style="font-weight:700; color:var(--brand-blue); cursor:pointer; display:flex; align-items:center;" onclick="openViewModal(${item.id})">
            ${mainTitle} ${commentIcon}
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${cleanText(item[actualFields.shortDesc]) || '—'}</div>
        </td>
        <td><span class="note-badge" style="background:${stageColor}">${stage.name}</span></td>
        <td>
          <div style="font-weight:600;">${creatorName}</div>
          <div style="font-size:11px; color:var(--text-muted);">${creatorDept}</div>
        </td>
        ${currentRole !== 'manager' ? `<td>${deptName}</td>` : ''}
        <td style="font-weight:700; color:var(--brand-blue); white-space: nowrap;">${formatMoney(currentTotalAmount)}</td>
        <td style="white-space: nowrap;">${deadlineDisplay}</td>
        <td>${combinedDirText}</td>
        <td class="actions-cell"><div class="btn-group">${buttonsHtml}</div></td>
        ${isAdminUI ? `<td class="actions-cell"><div class="btn-group">${adminHtml}</div></td>` : ''}
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}