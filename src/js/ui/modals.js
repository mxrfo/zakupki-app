// js/modals.js — Открытие/закрытие модалок

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function deleteItem(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('Удалить закупку и все связанные данные (задачи, входящие счета)? Это действие необратимо.')) return;
  logAction(`Удаление закупки ID ${id} с полной очисткой...`, 'info');
  deletePurchaseWithCleanup(id, function(ok) {
    if (ok) showToast('Закупка и связанные данные удалены', 'success');
    else showToast('Ошибка при удалении', 'error');
  });
}

// ✅ Открытие модалки делегирования (с fallback для пустых manager/dept)
function openDelegateModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  document.getElementById('delegate-id').value = id;
  document.getElementById('delegate-note').value = '';

  // Отдел: из поля dept, иначе — отдел создателя
  let deptId = '';
  const deptVal = item[actualFields.dept];
  if (deptVal) deptId = String(Array.isArray(deptVal) ? deptVal[0] : deptVal);
  if (!deptId) {
    const creatorId = item.createdBy;
    const cu = allUsers.find(u => String(u.ID) === String(creatorId));
    if (cu && cu.UF_DEPARTMENT) deptId = String(Array.isArray(cu.UF_DEPARTMENT) ? cu.UF_DEPARTMENT[0] : cu.UF_DEPARTMENT);
  }
  const deptObj = departments.find(d => String(d.ID) === deptId);

  // Текущий исполнитель: manager, иначе createdBy
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
    if (inDept) {
      const unav = isUserUnavailable(u.ID) ? ' (недоступен)' : '';
      sel.innerHTML += `<option value="${u.ID}">${u.LAST_NAME} ${u.NAME}${unav}</option>`;
      added++;
    }
  });
  if (added === 0) {
    // fallback: все активные
    allUsers.forEach(u => {
      if (String(u.ID) === String(currentMgr)) return;
      if (String(u.ACTIVE) === 'N') return;
      const unav = isUserUnavailable(u.ID) ? ' (недоступен)' : '';
      sel.innerHTML += `<option value="${u.ID}">${u.LAST_NAME} ${u.NAME}${unav}</option>`;
    });
  }

  document.getElementById('modal-delegate').style.display = 'flex';
}

function openViewModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  const mainTitle = cleanText(item.title) || 'Детали закупки';
  const shortDesc = cleanText(item[actualFields.shortDesc]) || '—';
  document.getElementById('view-title').innerText = mainTitle;

  const creatorName = userNames[item.createdBy] || '—';
  const creatorDept = userDepts[item.createdBy] || '—';

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
  const productAmount = parseFloat(cleanMoney(item[actualFields.amountProduct])) || 0;
  const deliveryAmount = parseFloat(cleanMoney(item[actualFields.amountDelivery])) || 0;

  let combinedDirText = item[actualFields.combinedDir] || '—';
  if (combinedDirText === '—' && item[actualFields.section]) {
    const secName = getDisplayValue(item, actualFields.section, 'enum');
    const dirName = getDisplayValue(item, actualFields.direction, 'enum');
    if (secName !== '—') combinedDirText = `${secName} / ${dirName}`;
  }

  let html = `
    ${isPostponed ? `<div class="note-badge postponed" style="margin-bottom:15px; display:inline-block;">Отложено до: ${new Date(postponeDate).toLocaleDateString('ru-RU')}</div>` : ''}
    <div class="view-meta-block">
      <div class="view-dates-row" style="background:#fff; padding:12px; border-radius:8px; border:1px solid var(--border-color); margin-bottom:12px;">
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
  const hasDetails = names.some(n => n && n.trim() !== '');

  if (hasDetails) {
    html += `<div class="view-details-divider"><div class="view-details-label">Детализация:</div><div class="detail-table-wrapper"><table class="detail-table"><thead><tr><th style="width: 25%;">Наименование</th><th style="width: 20%;">Цель</th><th style="width: 15%;">Цена за 1 шт.</th><th style="width: 10%;">Кол-во</th><th style="width: 15%;">Всего</th><th style="width: 15%;">Ссылка</th></tr></thead><tbody>`;
    const arrN = Array.isArray(names) ? names : [names];
    const arrP = Array.isArray(purposes) ? purposes : [purposes];
    const arrPr = Array.isArray(prices) ? prices : [prices];
    const arrQ = Array.isArray(qtys) ? qtys : [qtys];
    const arrL = Array.isArray(links) ? links : [links];
    const maxLen = Math.max(arrN.length, arrP.length, arrQ.length, arrL.length, arrPr.length);

    for (let i = 0; i < maxLen; i++) {
      const rowPrice = parseFloat(cleanMoney(arrPr[i])) || 0;
      const rowQty = parseFloat(cleanMoney(arrQ[i])) || 0;
      const rowTotal = rowPrice * rowQty;
      const showPrice = arrPr[i] !== undefined && arrPr[i] !== null && arrPr[i] !== '';
      const showQty = arrQ[i] !== undefined && arrQ[i] !== null && arrQ[i] !== '';
      const showTotal = showPrice && showQty;
      html += `<tr><td>${arrN[i] || ''}</td><td>${arrP[i] || ''}</td><td>${showPrice ? rowPrice.toFixed(2) : ''}</td><td>${arrQ[i] || ''}</td><td>${showTotal ? rowTotal.toFixed(2) : ''}</td><td>${arrL[i] ? `<a href="${arrL[i]}" target="_blank">Ссылка</a>` : ''}</td></tr>`;
    }
    html += `</tbody></table></div></div>`;
  } else {
    html += `<div class="view-details-divider"><p style="color:#64748b; font-style: italic; margin:0;">Детализация не заполнена.</p></div>`;
  }

  html += `</div>`;

  const fileInfo = getFileInfo(item, actualFields.fileInvoice);
  if (fileInfo && fileInfo.url) {
    html += `<h3 style="font-size:14px; margin-top:20px; margin-bottom:10px;">Прикрепленные файлы:</h3><a href="${fileInfo.url}" target="_blank" class="file-attachment"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>${fileInfo.name}</a>`;
  }

  if (econComment) {
    html += `<div class="note-comment-box" style="margin-top:20px;"><b>Комментарий (${commentAuthorName}):</b> ${econComment}</div>`;
  }

  const histField = actualFields.delegateHistory;
  const hist = (histField && item[histField]) ? String(item[histField]) : '';
  if (hist) {
    html += `<div class="note-comment-box" style="margin-top:20px; background:#fffbeb; border-color:#fcd34d;"><b>История делегирований:</b><div style="white-space:pre-wrap; font-size:12px; margin-top:6px;">${escapeHtml(hist)}</div></div>`;
  }

  document.getElementById('view-body').innerHTML = html;

  const stage = spStages[item.stageId];
  const stageColor = stage ? stage.color : '#64748b';
  document.getElementById('view-modal-content').style.borderTop = `6px solid ${stageColor}`;
  document.getElementById('modal-view').style.display = 'flex';
}

function openEditModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  document.getElementById('create-modal-title').innerText = 'Редактировать закупку';
  document.getElementById('edit-item-id').value = item.id;

  const deptSelect = document.getElementById('create-dept');
  deptSelect.innerHTML = '';
  departments.forEach(d => {
    const shortName = settings.deptShortNames[d.ID];
    if ((settings.visibleDepts.includes(String(d.ID)) && shortName) || item[actualFields.dept] == d.ID) {
      deptSelect.innerHTML += `<option value="${d.ID}" ${item[actualFields.dept] == d.ID ? 'selected' : ''}>${d.NAME} (${shortName || '—'})</option>`;
    }
  });

  document.getElementById('create-deadline').value = item[actualFields.deadlineZakup] ? item[actualFields.deadlineZakup].split('T')[0] : '';
  document.getElementById('create-short-desc').value = cleanText(item[actualFields.shortDesc]) || '';
  document.getElementById('create-amount-product').value = cleanMoney(item[actualFields.amountProduct]);

  const tbody = document.getElementById('detail-tbody');
  tbody.innerHTML = '';
  const names = item[actualFields.detailName] || [];
  const purposes = item[actualFields.detailPurpose] || [];
  const prices = item[actualFields.detailPrice] || [];
  const qtys = item[actualFields.detailQty] || [];
  const links = item[actualFields.detailLink] || [];

  const arrN = Array.isArray(names) ? names : (names ? [names] : []);
  const arrP = Array.isArray(purposes) ? purposes : (purposes ? [purposes] : []);
  const arrPr = Array.isArray(prices) ? prices : (prices ? [prices] : []);
  const arrQ = Array.isArray(qtys) ? qtys : (qtys ? [qtys] : []);
  const arrL = Array.isArray(links) ? links : (links ? [links] : []);
  const maxLen = Math.max(arrN.length, 1);

  for (let i = 0; i < maxLen; i++) {
    const tr = document.createElement('tr');
    const priceVal = arrPr[i] !== undefined && arrPr[i] !== null && arrPr[i] !== '' ? cleanMoney(arrPr[i]) : '';
    const qtyVal = arrQ[i] || '';
    const totalVal = (parseFloat(priceVal) * parseFloat(qtyVal)) || '';
    tr.innerHTML = `<td><input type="text" class="det-name" value="${arrN[i] || ''}" oninput="calculateAllTotals()"></td><td><input type="text" class="det-purpose" value="${arrP[i] || ''}"></td><td><input type="number" class="det-price" step="0.01" value="${priceVal !== '' ? priceVal : ''}" oninput="calculateRowTotal(this)"></td><td><input type="number" class="det-qty" step="1" value="${qtyVal}" oninput="calculateRowTotal(this)"></td><td><input type="text" class="det-total" value="${totalVal ? totalVal.toFixed(2) : ''}" readonly></td><td><input type="url" class="det-link" value="${arrL[i] || ''}"></td><td style="text-align:center;"><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove(); calculateAllTotals();">&times;</button></td>`;
    tbody.appendChild(tr);
  }

  calculateAllTotals();

  const stage = spStages[item.stageId];
  const stageColor = stage ? stage.color : '#64748b';
  document.getElementById('create-modal-content').style.borderTop = `6px solid ${stageColor}`;
  document.getElementById('modal-create').style.display = 'flex';
}

function openDataModal(id) {
  document.getElementById('form-data').reset();
  document.getElementById('data-id').value = id;

  const item = items.find(i => i.id === id);
  if (item) {
    document.getElementById('data-modal-title').innerText = cleanText(item.title);
    document.getElementById('data-modal-desc').innerText = cleanText(item[actualFields.shortDesc]) || '—';
    document.getElementById('data-amount-product').value = cleanMoney(item[actualFields.amountProduct]);
    document.getElementById('data-amount-delivery').value = cleanMoney(item[actualFields.amountDelivery]);
  }

  const secSelect = document.getElementById('data-section');
  secSelect.innerHTML = '<option value="">-- Выберите раздел --</option>';
  const secDef = fieldDefs[actualFields.section];
  if (secDef && secDef.items) {
    secDef.items.forEach(i => {
      const isSelected = item && String(item[actualFields.section]) === String(i.ID);
      secSelect.innerHTML += `<option value="${i.ID}" ${isSelected ? 'selected' : ''}>${i.VALUE}</option>`;
    });
  }

  const tbody = document.getElementById('data-detail-tbody');
  tbody.innerHTML = '';

  if (item) {
    const names = item[actualFields.detailName] || [];
    const purposes = item[actualFields.detailPurpose] || [];
    const prices = item[actualFields.detailPrice] || [];
    const qtys = item[actualFields.detailQty] || [];
    const links = item[actualFields.detailLink] || [];

    const arrN = Array.isArray(names) ? names : (names ? [names] : []);
    const arrP = Array.isArray(purposes) ? purposes : (purposes ? [purposes] : []);
    const arrPr = Array.isArray(prices) ? prices : (prices ? [prices] : []);
    const arrQ = Array.isArray(qtys) ? qtys : (qtys ? [qtys] : []);
    const arrL = Array.isArray(links) ? links : (links ? [links] : []);
    const maxLen = Math.max(arrN.length, 1);

    for (let i = 0; i < maxLen; i++) {
      const tr = document.createElement('tr');
      const priceVal = arrPr[i] !== undefined && arrPr[i] !== null && arrPr[i] !== '' ? cleanMoney(arrPr[i]) : '';
      const qtyVal = arrQ[i] || '';
      const totalVal = (parseFloat(priceVal) * parseFloat(qtyVal)) || '';
      tr.innerHTML = `<td><input type="text" class="data-det-name" value="${arrN[i] || ''}"></td><td><input type="text" class="data-det-purpose" value="${arrP[i] || ''}"></td><td><input type="number" class="data-det-price" step="0.01" value="${priceVal !== '' ? priceVal : ''}" oninput="calculateDataRowTotal(this)"></td><td><input type="number" class="data-det-qty" step="1" value="${qtyVal}" oninput="calculateDataRowTotal(this)"></td><td><input type="text" class="data-det-total" value="${totalVal ? totalVal.toFixed(2) : ''}" readonly></td><td><input type="url" class="data-det-link" value="${arrL[i] || ''}"></td><td style="text-align:center;"><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove();">&times;</button></td>`;
      tbody.appendChild(tr);
    }
  } else {
    addDataDetailRow();
  }

  document.getElementById('data-direction').innerHTML = '<option value="">-- Выберите направление --</option>';
  if (item && item[actualFields.section]) updateDirections(item[actualFields.direction]);

  document.getElementById('modal-data').style.display = 'flex';
}

function openEditAmountModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  document.getElementById('edit-amount-id').value = id;
  document.getElementById('edit-amount-value').value = cleanMoney(item[actualFields.amountProduct]);
  document.getElementById('modal-edit-amount').style.display = 'flex';
}

function openUploadModal(id) {
  document.getElementById('form-upload').reset();
  document.getElementById('upload-id').value = id;
  document.getElementById('file-name-display').innerText = 'Нажмите, чтобы выбрать файл';
  document.getElementById('file-name-display').style.color = '#0f172a';
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
    label.innerText = 'Комментарий';
    btnHtml += `<button type="submit" class="btn btn-primary">Отправить</button>`;
  } else if (type === 'approve_terms') {
    title.innerText = 'Согласовать условия';
    label.innerText = 'Комментарий (увидят менеджеры)';
    postponeGroup.style.display = 'block';
    btnHtml += `<button type="submit" class="btn btn-success">Согласовать</button>`;
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