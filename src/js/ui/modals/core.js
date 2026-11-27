// js/ui/modals/core.js — Общие функции модалок

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.style.display = 'none';
  const modal = overlay.querySelector('.modal');
  if (modal) modal.classList.remove('sheet');
}

function deleteItem(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('Удалить закупку и все связанные данные?')) return;
  deletePurchaseWithCleanup(id, function (ok) {
    if (ok) showToast('Закупка удалена', 'success');
    else showToast('Ошибка при удалении', 'error');
  });
}

window.closeModal = closeModal;
window.deleteItem = deleteItem;