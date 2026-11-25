// js/modals.js — Открытие/закрытие модалок

function closeModal(id) { 
  document.getElementById(id).style.display = 'none'; 
}

function deleteItem(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('Удалить закупку и все связанные данные?')) return;
  deletePurchaseWithCleanup(id, function (ok) {
    if (ok) showToast('Закупка удалена', 'success'); 
    else showToast('Ошибка при удалении', 'error');
  });
}

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
  
  const sel = document.getElementById('delegate-to');
  sel.innerHTML = '<option value="">-- Выберите сотрудника --</option>';
  let added = 0;
  allUsers.forEach(u => {
    if (String(u.ID) === String(currentMgr)) return;
    if (String(u.ACTIVE) === 'N') return;
    const depts = Array.isArray(u.UF_DEPARTMENT) ? u.UF_DEPARTMENT : (u.UF_DEPARTMENT ? [u.UF_DEPARTMENT] : []);
    const inDept = deptId ? depts.some(d => String(d) === deptId) : true;
    const isSelf = String(u.ID) === String(currentUser.ID);
    if (inDept || isSelf) { 
      sel.innerHTML += `<option value="${u.ID}">${u.LAST_NAME} ${u.NAME}${isSelf ? ' (я)' : ''}${isUserUnavailable(u.ID) ? ' (недоступен)' : ''}</option>`; 
      added++; 
    }
  });
  if (added === 0) {
    allUsers.forEach(u => { 
      if (String(u.ID) !== String(currentMgr) && String(u.ACTIVE) !== 'N') {
        sel.innerHTML += `<option value="${u.ID}">${u.LAST_NAME} ${u.NAME}${isUserUnavailable(u.ID) ? ' (недоступен)' : ''}</option>`; 
      }
    });
  }
  document.getElementById('modal-delegate').style.display = 'flex';
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
  document.getElementById('executor-desc').value = (getShortDesc(item));

  let deptId = '';
  const deptVal = item[actualFields.dept];
  if (deptVal) deptId = String(Array.isArray(deptVal) ? deptVal[0] : deptVal);

  const sel = document.getElementById('executor-to');
  sel.innerHTML = '<option value="">-- Выберите сотрудника из отдела --</option>';
  const addedIds = new Set();
  let added = 0;
  allUsers.forEach(u => {
    if (String(u.ACTIVE) === 'N') return;
    const depts = Array.isArray(u.UF_DEPARTMENT) ? u.UF_DEPARTMENT : (u.UF_DEPARTMENT ? [u.UF_DEPARTMENT] : []);
    const inDept = deptId ? depts.some(d => String(d) === deptId) : false;
    const isSelf = String(u.ID) === String(currentUser.ID);
    if (inDept || isSelf) {
      sel.innerHTML += `<option value="${u.ID}">${u.LAST_NAME} ${u.NAME}${isSelf ? ' (я)' : ''}${isUserUnavailable(u.ID) ? ' (недоступен)' : ''}</option>`;
      addedIds.add(String(u.ID));
      added++;
    }
  });
  if (added === 0) {
    allUsers.forEach(u => {
      if (String(u.ACTIVE) === 'N') return;
      const self = String(u.ID) === String(currentUser.ID) ? ' (я)' : '';
      sel.innerHTML += `<option value="${u.ID}">${u.LAST_NAME} ${u.NAME}${self}${isUserUnavailable(u.ID) ? ' (недоступен)' : ''}</option>`;
      addedIds.add(String(u.ID));
    });
  }
  // ✅ гарантированно добавляем текущего пользователя, если его нет в списке
  if (currentUser && currentUser.ID && !addedIds.has(String(currentUser.ID))) {
    const cu = allUsers.find(u => String(u.ID) === String(currentUser.ID));
    const label = cu ? (cu.LAST_NAME + ' ' + cu.NAME) : (userNames[currentUser.ID] || 'Я');
    sel.innerHTML += `<option value="${currentUser.ID}">${label} (я)</option>`;
  }
  document.getElementById('modal-executor').style.display = 'flex';
}

function submitExecutor(e) {
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
  
  BX24.callMethod('tasks.task.update', { taskId: taskId, fields: { ACCOMPLICES: [toUserId], STATUS: 5 } }, function (tr) {
    if (tr.error()) {
      logAction('Ошибка обновления задачи: ' + getApiErrorMessage(tr), 'error');
    } else {
      logAction('Задача закрыта, соисполнитель назначен', 'success');
    }
    
    const sborStageId = getStageIdByName('сбор данных');
    const updFields = {};
    updFields[actualFields.manager] = [String(toUserId)];
    if (sborStageId) updFields.stageId = sborStageId;
    
    BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: updFields }, function (r2) {
      if (r2.error()) { 
        logAction('Ошибка записи менеджера: ' + getApiErrorMessage(r2), 'error'); 
        if (btn) { btn.disabled = false; btn.innerText = 'Утвердить'; } 
        return; 
      }
      if (item) { 
        item[actualFields.manager] = [String(toUserId)]; 
        if (sborStageId) item.stageId = sborStageId; 
      }
      closeModal('modal-executor');
      if (btn) { btn.disabled = false; btn.innerText = 'Утвердить'; }
      showToast('Исполнитель утверждён: ' + (userNames[toUserId] || toUserId), 'success');
      
      try {
        if (item) groupStatusNotify(item, 'assigned', 'group_assigned_' + item.id + '_' + toUserId);
      } catch (err) { 
        logAction('Ошибка группового статуса: ' + err.message, 'error'); 
      }
      
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
          
          BX24.callMethod('tasks.task.add', { fields: taskPayload }, function (tr2) {
            if (!tr2.error()) {
              const newTaskId = tr2.data().task.id;
              notifyCollectData(toUserId, item);
              BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: { [actualFields.taskSbor]: String(newTaskId) } }, function () { 
                loadAllData(); 
              });
            } else {
              loadAllData();
            }
          });
        } else { 
          notifyCollectData(toUserId, item); 
          loadAllData(); 
        }
      } catch (err) { 
        logAction('Ошибка уведомления менеджера: ' + err.message, 'error'); 
        loadAllData(); 
      }
    });
  });
}

function openViewModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  
  const mainTitle = cleanText(item.title) || 'Детали закупки';
  const shortDesc = getShortDesc(item);
  document.getElementById('view-title').innerText = mainTitle;
  
  const c = getCreatorInfo(item);
  const creatorName = c.name;
  const creatorDept = c.dept;
  
  const mgrVal = item[actualFields.manager];
  const mgrIds = Array.isArray(mgrVal) ? mgrVal : (mgrVal ? [mgrVal] : []);
  const managerName = mgrIds.map(m => userNames[m]).filter(Boolean).join(', ') || '—';
  
  const deptName = getDisplayValue(item, actualFields.dept, 'dept');
  const deadlineDisplay = getDeadlineDisplay(item[actualFields.deadlineZakup]);
  const createdDate = new Date(item.createdTime).toLocaleDateString('ru-RU');
  const econComment = cleanText(item[actualFields.comment]);
  const commentAuthorName = userNames[item.updatedBy] || 'Система';
  
  const postponeDate = item[actualFields.postponeDate];
  const isPostponed = postponeDate && new Date(postponeDate) > new Date();
  
  const totalAmount = calculateTotalAmount(item);
  const productAmount = parseAmount(item[actualFields.amountProduct]) || 0;
  const deliveryAmount = parseAmount(item[actualFields.amountDelivery]) || 0;
  const combinedDirText = resolveCombinedDir(item) || '—';
  const canSeeInvoice = !(activeTab === 'all' && currentRole !== 'admin' && currentRole !== 'econ');

  let html = `${isPostponed ? `<div class="note-badge postponed" style="margin-bottom:15px;">Отложено до: ${new Date(postponeDate).toLocaleDateString('ru-RU')}</div>` : ''}
    <div class="view-meta-block">
      <div class="view-dates-row">
        <div class="view-date-item"><div class="view-date-label">Дата создания</div><div class="view-date-value">${createdDate}</div></div>
        <div class="view-date-item"><div class="view-date-label">Крайний срок</div><div class="view-date-value">${deadlineDisplay}</div></div>
      </div>
      <div class="view-meta-cards">
        <div class="view-meta-card"><div class="view-meta-card-label">Заказчик</div><div class="view-meta-card-value">${creatorName} <span style="font-weight:400; color:#64748b;">(${creatorDept})</span></div></div>
        ${currentRole !== 'manager' ? `<div class="view-meta-card"><div class="view-meta-card-label">Исполнитель</div><div class="view-meta-card-value">${deptName}</div></div>` : ''}
        ${managerName !== '—' ? `<div class="view-meta-card"><div class="view-meta-card-label">Менеджер</div><div class="view-meta-card-value">${managerName}</div></div>` : ''}
        ${combinedDirText !== '—' ? `<div class="view-meta-card"><div class="view-meta-card-label">Раздел/Напр</div><div class="view-meta-card-value">${combinedDirText}</div></div>` : ''}
      </div>
    </div>
    <div class="view-content-block">
      <div><div class="view-short-desc-label">Что нужно закупить (Кратко):</div><div class="view-short-desc-value">${shortDesc}</div></div>
      <div class="view-details-divider" style="display:flex; gap:20px; flex-wrap:wrap;">
        <div><span class="view-details-label">Сумма товаров:</span> <b>${formatMoney(productAmount)}</b></div>
        <div><span class="view-details-label">Сумма доставки:</span> <b>${formatMoney(deliveryAmount)}</b></div>
        <div style="color:var(--brand-blue); font-size:16px; font-weight:800;"><span class="view-details-label" style="color:var(--brand-blue);">ИТОГО:</span> ${formatMoney(totalAmount)}</div>
      </div>`;

  const names = item[actualFields.detailName] || [];
  const purposes = item[actualFields.detailPurpose] || [];
  const prices = item[actualFields.detailPrice] || [];
  const qtys = item[actualFields.detailQty] || [];
  const links = item[actualFields.detailLink] || [];
  const suppliers = item[actualFields.detailSupplier] || [];
  const hasDetails = names.some(n => n && n.trim() !== '');

  if (hasDetails) {
    html += `<div class="view-details-divider"><div class="view-details-label">Детализация:</div><div class="detail-table-wrapper"><table class="detail-table"><thead><tr>` +
      `<th style="width: 22%;">Наименование</th>` +
      `<th style="width: 16%;">Цель</th>` +
      `<th style="width: 18%;">Цена с НДС за 1 шт. без учета доставки</th>` +
      `<th style="width: 9%;">Кол-во</th>` +
      `<th style="width: 12%;">Всего</th>` +
      `<th style="width: 13%;">Поставщик</th>` +
      `<th style="width: 10%;">Ссылка</th>` +
      `</tr></thead><tbody>`;
      
    const arrN = Array.isArray(names) ? names : [names];
    const arrP = Array.isArray(purposes) ? purposes : [purposes];
    const arrPr = Array.isArray(prices) ? prices : [prices];
    const arrQ = Array.isArray(qtys) ? qtys : [qtys];
    const arrL = Array.isArray(links) ? links : [links];
    const arrS = Array.isArray(suppliers) ? suppliers : [suppliers];
    const maxLen = Math.max(arrN.length, arrP.length, arrQ.length, arrL.length, arrPr.length, arrS.length);
    
    for (let i = 0; i < maxLen; i++) {
      const rowPrice = parseAmount(arrPr[i]) || 0;
      const rowQty = parseAmount(arrQ[i]) || 0;
      const rowTotal = rowPrice * rowQty;
      html += `<tr>
        <td>${arrN[i] || ''}</td>
        <td>${arrP[i] || ''}</td>
        <td>${rowPrice > 0 ? rowPrice.toFixed(2) : ''}</td>
        <td>${arrQ[i] || ''}</td>
        <td>${rowTotal > 0 ? rowTotal.toFixed(2) : ''}</td>
        <td>${arrS[i] || ''}</td>
        <td>${arrL[i] ? `<a href="${arrL[i]}" target="_blank">Ссылка</a>` : ''}</td>
      </tr>`;
    }
    html += `</tbody></table></div></div>`;
  } else {
    html += `<div class="view-details-divider"><p style="color:#64748b; font-style: italic;">Детализация не заполнена.</p></div>`;
  }
  html += `</div>`;

  const fileInfo = getFileInfo(item, actualFields.fileInvoice);
  if (fileInfo && fileInfo.url && canSeeInvoice) {
    html += `<h3 style="font-size:14px; margin-top:20px;">Файлы:</h3><a class="file-attachment" href="${fileInfo.url}" target="_blank">${fileInfo.name}</a>`;
  }
  if (econComment) {
    html += `<div class="note-comment-box" style="margin-top:20px;"><b>Комментарий (${commentAuthorName}):</b> ${econComment}</div>`;
  }
  
  const histField = actualFields.delegateHistory;
  const hist = (histField && item[histField]) ? String(item[histField]) : '';
  if (hist) {
    html += `<div class="note-comment-box" style="margin-top:20px; background:#fffbeb;"><b>История делегирований:</b><div style="white-space:pre-wrap; font-size:12px;">${escapeHtml(hist)}</div></div>`;
  }

  document.getElementById('view-body').innerHTML = html;
  const stage = spStages[item.stageId];
  const stageColor = stage ? stage.color : '#64748b';
  document.getElementById('view-modal-content').style.borderTop = `6px solid ${stageColor}`;
  document.getElementById('modal-view').style.display = 'flex';
}

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
  const maxLen = Math.max(arrN.length, 1);
  
  for (let i = 0; i < maxLen; i++) {
    const tr = document.createElement('tr');
    const priceVal = parseAmount(arrPr[i]);
    const qtyVal = parseAmount(arrQ[i]);
    const totalVal = (parseFloat(priceVal) * parseFloat(qtyVal)) || '';
    tr.innerHTML = `<td><input type="text" class="data-det-name" value="${arrN[i] || ''}"></td>` +
      `<td><input type="text" class="data-det-purpose" value="${arrP[i] || ''}"></td>` +
      `<td><input type="number" class="data-det-price" step="0.01" value="${priceVal}" oninput="calculateDataRowTotal(this)"></td>` +
      `<td><input type="number" class="data-det-qty" step="1" value="${qtyVal}" oninput="calculateDataRowTotal(this)"></td>` +
      `<td><input type="text" class="data-det-total" value="${totalVal ? totalVal.toFixed(2) : ''}" readonly></td>` +
      `<td><input type="text" class="data-det-supplier" value="${arrS[i] || ''}"></td>` +
      `<td><input type="url" class="data-det-link" value="${arrL[i] || ''}"></td>` +
      `<td style="text-align:center;"><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove();">&times;</button></td>`;
    tbody.appendChild(tr);
  }

  const modalTitle = document.querySelector('#modal-data .modal-header h2');
  const submitBtn = document.querySelector('#form-data button[type="submit"]');
  
  if (submitBtn) submitBtn.classList.remove('btn-approval-submit');
  if (allowApprovalEdit) {
    if (modalTitle) modalTitle.innerText = 'Редактирование данных (согласование)';
    if (submitBtn) { submitBtn.innerText = 'Сохранить изменения'; submitBtn.classList.add('btn-approval-submit'); }
  } else if (stName.includes('корректировк')) {
    if (modalTitle) modalTitle.innerText = 'Корректировка данных';
    if (submitBtn) { submitBtn.innerText = 'Отправить на согласование'; submitBtn.classList.add('btn-approval-submit'); }
  } else {
    if (modalTitle) modalTitle.innerText = 'Сбор данных и расчет';
    if (submitBtn) { submitBtn.innerText = 'Отправить на согласование'; submitBtn.classList.add('btn-approval-submit'); }
  }

  const modal = document.querySelector('#modal-data .modal');
  if (modal) modal.style.borderTop = `6px solid ${stage ? stage.color : '#64748b'}`;
  // ✅ ФИКС: удалён вызов несуществующей функции syncSupplierColumns();
  document.getElementById('modal-data').style.display = 'flex';
  setTimeout(function () { initResizableTable('data-detail-table'); }, 50);
}

function openEditAmountModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  document.getElementById('edit-amount-id').value = id;
  document.getElementById('edit-amount-value').value = parseAmount(item[actualFields.amountProduct]) || '';
  document.getElementById('modal-edit-amount').style.display = 'flex';
}

function openUploadModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  
  const stage = spStages[item.stageId];
  const stName = stage ? stage.name.toLowerCase().replace(/ё/g, 'е') : '';
  if (!stName.includes('загрузка')) {
    showToast('Счёт уже передан экономисту — загрузка/замена недоступна', 'info');
    return;
  }
  
  document.getElementById('form-upload').reset();
  document.getElementById('upload-id').value = id;
  
  const nameDisplay = document.getElementById('file-name-display');
  const fileInput = document.getElementById('upload-file');
  const fileInfo = getFileInfo(item, actualFields.fileInvoice);
  
  if (fileInfo && fileInfo.url) {
    nameDisplay.innerText = 'Уже загружен: ' + fileInfo.name + ' (можно заменить)';
    nameDisplay.style.color = '#10b981';
    fileInput.required = false;
  } else {
    nameDisplay.innerText = 'Нажмите, чтобы выбрать файл';
    nameDisplay.style.color = '#0f172a';
    fileInput.required = true;
  }
  
  const modal = document.querySelector('#modal-upload .modal');
  if (modal) modal.style.borderTop = `6px solid ${stage ? stage.color : '#64748b'}`;
  if (item[actualFields.deadlinePay]) document.getElementById('upload-deadline').value = String(item[actualFields.deadlinePay]).split('T')[0];
  document.getElementById('modal-upload').style.display = 'flex';
}

function openActionModal(id, type) {
  document.getElementById('form-action').reset();
  document.getElementById('action-id').value = id;
  document.getElementById('action-type').value = type;
  
  const title = document.getElementById('action-title');
  const label = document.getElementById('action-comment-label');
  const footer = document.getElementById('action-footer-buttons');
  const postponeGroup = document.getElementById('action-postpone-group');
  postponeGroup.style.display = 'none';
  
  let btnHtml = `<button type="button" class="btn" onclick="closeModal('modal-action')">Отмена</button>`;
  
  if (type === 'send_to_work') {
    const item = items.find(i => i.id == id);
    const existingTaskId = item ? item[actualFields.taskVyborSotr] : null;
    if (existingTaskId && String(existingTaskId).match(/^\d+$/)) {
      title.innerText = 'Задача уже создана';
      label.innerText = 'Задача на утверждение исполнителя уже существует';
      btnHtml += `<button type="button" class="btn btn-primary" disabled>Задача ID ${existingTaskId}</button>`;
      footer.innerHTML = btnHtml;
      document.getElementById('modal-action').style.display = 'flex';
      return;
    }
    title.innerText = 'Отправить в работу'; 
    label.innerText = 'Комментарий (покажется в чате руководителю)';
    btnHtml += `<button type="submit" class="btn btn-primary">Отправить</button>`;
  } else if (type === 'approve_terms') {
    title.innerText = 'Согласовать условия'; 
    label.innerText = 'Комментарий (увидят менеджеры)';
    postponeGroup.style.display = 'block';
    btnHtml += `<button type="submit" class="btn btn-success">Согласовать</button>`;
  } else if (type === 'send_to_rework') {
    title.innerText = 'Отправить на доработку'; 
    label.innerText = 'Комментарий — что исправить (обязательно)';
    btnHtml += `<button type="submit" class="btn" style="background:#f59e0b; border-color:#f59e0b; color:#fff;">Отправить на доработку</button>`;
  } else if (type === 'reject_terms') {
    title.innerText = 'Отклонить условия'; 
    label.innerText = 'Причина отказа';
    btnHtml += `<button type="submit" class="btn btn-danger">Отклонить</button>`;
  } else if (type === 'approve_invoice') {
    title.innerText = 'Утвердить счет'; 
    label.innerText = 'Комментарий';
    btnHtml += `<button type="submit" class="btn btn-success">Утвердить</button>`;
  } else if (type === 'reject_invoice') {
    title.innerText = 'Отклонить счет'; 
    label.innerText = 'Причина отказа';
    btnHtml += `<button type="submit" class="btn btn-danger">Отклонить</button>`;
  } else if (type === 'confirm_payment') {
    title.innerText = 'Подтвердить оплату'; 
    label.innerText = 'Комментарий';
    btnHtml += `<button type="submit" class="btn btn-success">Оплачено</button>`;
  } else if (type === 'confirm_receipt') {
    title.innerText = 'Подтвердить получение'; 
    label.innerText = 'Комментарий';
    btnHtml += `<button type="submit" class="btn btn-primary">Подтвердить</button>`;
  } else if (type === 'remove_postpone') {
    title.innerText = 'Снять отложенную дату'; 
    label.innerText = 'Комментарий (необязательно)';
    btnHtml += `<button type="submit" class="btn btn-primary">Снять</button>`;
  }
  
  footer.innerHTML = btnHtml;
  document.getElementById('modal-action').style.display = 'flex';
}

// глобальный обработчик: скрывать dropdown подсказок при прокрутке/ресайзе
window.addEventListener('scroll', function () { hideSuggestions(); }, true);
window.addEventListener('resize', function () { hideSuggestions(); });
document.addEventListener('click', function (e) {
  if (_suggestEl && !e.target.closest('.pg-name')) hideSuggestions();
});