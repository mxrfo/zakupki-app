// js/ui/modals/past.js — Модалка "Выбрать из прошлых закупок"

function openPastItemsModal() {
  buildItemSuggestions();
  const search = document.getElementById('past-search');
  if (search) search.value = '';
  renderPastItems();
  document.getElementById('modal-past').style.display = 'flex';
}

function renderPastItems() {
  const list = document.getElementById('past-list');
  if (!list) return;
  const q = (document.getElementById('past-search').value || '').trim().toLowerCase();
  const all = buildItemSuggestions();
  const filtered = q ? all.filter(function (r) { return r.name.toLowerCase().indexOf(q) !== -1 || (r.supplier || '').toLowerCase().indexOf(q) !== -1; }) : all;
  if (!filtered.length) {
    list.innerHTML = '<div class="past-empty">Ничего не найдено. Добавьте первую позицию вручную — она появится в истории после сохранения.</div>';
    return;
  }
  list.innerHTML = filtered.map(function (r, idx) {
    return `<label class="past-row">
      <input type="checkbox" class="past-check" data-idx="${idx}">
      <div class="past-info">
        <div class="past-name">${escapeHtml(r.name)}</div>
        <div class="past-meta">${r.price > 0 ? '<span class="p-price">' + r.price.toFixed(2) + ' ₽</span>' : ''}${r.supplier ? ' · ' + escapeHtml(r.supplier) : ''}${r.purpose ? ' · ' + escapeHtml(r.purpose) : ''}</div>
      </div>
      <span class="past-count">${r.count}×</span>
    </label>`;
  }).join('');
  list._filtered = filtered;
}

function addSelectedPastItems() {
  const list = document.getElementById('past-list');
  const checks = list.querySelectorAll('.past-check:checked');
  if (!checks.length) return showToast('Выберите хотя бы одну позицию', 'error');
  checks.forEach(function (ch) {
    const rec = list._filtered[+ch.dataset.idx];
    addDetailRow({
      name: rec.name, link: rec.link || '', qty: rec.qty || '', price: rec.price || '',
      supplier: rec.supplier || '', purpose: rec.purpose || ''
    });
  });
  closeModal('modal-past');
  showToast('Добавлено позиций: ' + checks.length, 'success');
  calculateAllTotals();
  maybeAutoFillShortDesc();
}

window.openPastItemsModal = openPastItemsModal;
window.renderPastItems = renderPastItems;
window.addSelectedPastItems = addSelectedPastItems;