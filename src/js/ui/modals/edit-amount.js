// js/ui/modals/edit-amount.js — Модалка изменения суммы

function openEditAmountModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  document.getElementById('edit-amount-id').value = id;
  document.getElementById('edit-amount-value').value = parseAmount(item[actualFields.amountProduct]) || '';
  document.getElementById('modal-edit-amount').style.display = 'flex';
}

function submitEditAmount(e) {
  e.preventDefault();
  const id = document.getElementById('edit-amount-id').value;
  const amount = document.getElementById('edit-amount-value').value;
  const fields = { [actualFields.amountProduct]: amount ? parseFloat(amount) : 0 };
  logAction('Обновление суммы...', 'info');
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
    if (res.error()) { logAction('Ошибка: ' + getApiErrorMessage(res), 'error'); showToast('Ошибка: ' + getApiErrorMessage(res), 'error'); }
    else { logAction('Сумма обновлена', 'success'); showToast('Сумма обновлена'); closeModal('modal-edit-amount'); invalidateSuggestions(); loadAllData(); }
  });
}

window.openEditAmountModal = openEditAmountModal;
window.submitEditAmount = submitEditAmount;