// js/ui/modals/view.js — Модалка просмотра закупки

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

  let html = `${isPostponed ? `<div class="note-badge postponed mt-15">Отложено до: ${new Date(postponeDate).toLocaleDateString('ru-RU')}</div>` : ''}
    <div class="view-meta-block">
      <div class="view-dates-row">
        <div class="view-date-item"><div class="view-date-label">Дата создания</div><div class="view-date-value">${createdDate}</div></div>
        <div class="view-date-item"><div class="view-date-label">Крайний срок</div><div class="view-date-value">${deadlineDisplay}</div></div>
      </div>
      <div class="view-meta-cards">
        <div class="view-meta-card"><div class="view-meta-card-label">Заказчик</div><div class="view-meta-card-value">${creatorName} <span class="text-secondary">(${creatorDept})</span></div></div>
        ${currentRole !== 'manager' ? `<div class="view-meta-card"><div class="view-meta-card-label">Исполнитель</div><div class="view-meta-card-value">${deptName}</div></div>` : ''}
        ${managerName !== '—' ? `<div class="view-meta-card"><div class="view-meta-card-label">Менеджер</div><div class="view-meta-card-value">${managerName}</div></div>` : ''}
        ${combinedDirText !== '—' ? `<div class="view-meta-card"><div class="view-meta-card-label">Раздел/Напр</div><div class="view-meta-card-value">${combinedDirText}</div></div>` : ''}
      </div>
    </div>
    <div class="view-content-block">
      <div><div class="view-short-desc-label">Что нужно закупить (Кратко):</div><div class="view-short-desc-value">${shortDesc}</div></div>
      <div class="view-details-divider calc-details-row">
        <div><span class="view-details-label">Сумма товаров:</span> <b>${formatMoney(productAmount)}</b></div>
        <div><span class="view-details-label">Сумма доставки:</span> <b>${formatMoney(deliveryAmount)}</b></div>
        <div class="calc-total"><span class="view-details-label calc-total-label">ИТОГО:</span> ${formatMoney(totalAmount)}</div>
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
      `<th class="col-view-name">Наименование</th>` +
      `<th class="col-view-purpose">Цель</th>` +
      `<th class="col-view-price">Цена за 1 шт. без учета доставки</th>` +
      `<th class="col-view-qty">Кол-во</th>` +
      `<th class="col-view-total">Всего</th>` +
      `<th class="col-view-supplier">Поставщик</th>` +
      `<th class="col-view-link">Ссылка</th>` +
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
    html += `<div class="view-details-divider"><p class="text-italic-muted">Детализация не заполнена.</p></div>`;
  }
  html += `</div>`;

  const fileInfo = getFileInfo(item, actualFields.fileInvoice);
  if (fileInfo && fileInfo.url && canSeeInvoice) {
    html += `<h3 class="modal-h3">Файлы:</h3><a class="file-attachment" href="${fileInfo.url}" target="_blank">${fileInfo.name}</a>`;
  }
  if (econComment) {
    html += `<div class="note-comment-box mt-20"><b>Комментарий (${commentAuthorName}):</b> ${econComment}</div>`;
  }

  const histField = actualFields.delegateHistory;
  const hist = (histField && item[histField]) ? String(item[histField]) : '';
  if (hist) {
    html += `<div class="note-comment-box comment-box-highlight mt-20"><b>История делегирований:</b><div class="text-pre-wrap">${escapeHtml(hist)}</div></div>`;
  }

  document.getElementById('view-body').innerHTML = html;
  const stage = spStages[item.stageId];
  const stageColor = stage ? stage.color : '#64748b';
  document.getElementById('view-modal-content').style.borderTop = `6px solid ${stageColor}`;
  document.getElementById('modal-view').style.display = 'flex';
}

window.openViewModal = openViewModal;