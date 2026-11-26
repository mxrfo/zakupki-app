// js/logic/settings/absence.js — Вкладка "Отсутствия"

function renderUnavailableUsers() {
  const container = document.getElementById('unavailable-users-container');
  if (!container) return;
  container.innerHTML = '';
  const meta = document.getElementById('absence-meta');
  if (meta) meta.innerText = 'Проверено: ' + (localStorage.getItem('b24_absence_check_date') || '—') + ' · сейчас отсутствуют: ' + ((settings.unavailableUsers || []).length);
  if (!allUsers || !allUsers.length) { container.innerHTML = '<p class="empty-note">Список не загружен</p>'; return; }
  const list = (settings.unavailableUsers || []).map(String);
  allUsers.forEach(u => {
    if (String(u.ACTIVE) === 'N') return;
    const checked = list.includes(String(u.ID)) ? 'checked' : '';
    const deptName = userDepts[u.ID] || '';
    container.innerHTML += `<label class="user-row"><input type="checkbox" class="unavail-check" data-uid="${u.ID}" ${checked}> <span class="ur-name">${u.LAST_NAME} ${u.NAME}</span> <span class="ur-dept">${deptName}</span></label>`;
  });
}

function runManualAbsenceCheck() {
  const btn = document.getElementById('btn-absence-check');
  if (btn) { btn.disabled = true; btn.innerText = 'Проверка...'; }
  refreshUnavailableUsersForce(function () {
    if (btn) { btn.disabled = false; btn.innerText = 'Проверить отсутствия сейчас'; }
    renderUnavailableUsers();
    showToast('Проверка отсутствий выполнена', 'success');
  });
}

window.renderUnavailableUsers = renderUnavailableUsers;
window.runManualAbsenceCheck = runManualAbsenceCheck;