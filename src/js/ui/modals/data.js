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
      `<td class="text-center" style="text-align:center;"><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove();">&times;</button></td>`;
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
  document.getElementById('modal-data').style.display = 'flex';
  setTimeout(function () { initResizableTable('data-detail-table'); }, 50);
}

window.openDataModal = openDataModal;