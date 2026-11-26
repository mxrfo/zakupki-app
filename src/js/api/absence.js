// js/api/absence.js — Проверка отсутствий сотрудников

function isUserUnavailable(userId) {
  userId = String(userId);
  if (!settings.unavailableUsers) return false;
  if (settings.unavailableUsers.some(id => String(id) === userId)) return true;
  const u = allUsers.find(x => String(x.ID) === userId);
  if (u && String(u.ACTIVE) === 'N') return true;
  return false;
}

function refreshUnavailableUsers(done) {
  done = done || function () {};
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('b24_absence_check_date') === today) { logAction('Отсутствия уже обновлены сегодня', 'info'); return done(); }
  runAbsenceCheck(done);
}

function refreshUnavailableUsersForce(done) {
  done = done || function () {};
  localStorage.removeItem('b24_absence_check_date');
  runAbsenceCheck(done);
}

function parseAbsenceRanges(ab) {
  const ranges = [];
  if (!ab) return ranges;
  if (Array.isArray(ab)) {
    for (let i = 0; i + 1 < ab.length; i += 2) {
      const f = new Date(ab[i]); const t = new Date(ab[i + 1]);
      if (!isNaN(f.getTime()) && !isNaN(t.getTime())) ranges.push([f, t]);
    }
  } else if (typeof ab === 'string' && ab.trim()) {
    const parts = ab.split(',').map(s => s.trim()).filter(Boolean);
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const f = new Date(parts[i]); const t = new Date(parts[i + 1]);
      if (!isNaN(f.getTime()) && !isNaN(t.getTime())) ranges.push([f, t]);
    }
  } else if (ab && typeof ab === 'object') {
    Object.keys(ab).forEach(k => {
      const pair = ab[k];
      if (Array.isArray(pair) && pair.length >= 2) {
        const f = new Date(pair[0]); const t = new Date(pair[1]);
        if (!isNaN(f.getTime()) && !isNaN(t.getTime())) ranges.push([f, t]);
      }
    });
  }
  return ranges;
}

function runAbsenceCheck(done) {
  done = done || function () {};
  const customField = (settings.absenceField || '').trim();
  const values = (settings.absenceValues || 'отпуск,больничный,командировка,не в офисе').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const select = ['ID', 'NAME', 'LAST_NAME', 'UF_ABSENCE', 'ACTIVE'];
  if (customField) select.push(customField);
  logAction('Проверка отсутствий (UF_ABSENCE' + (customField ? ' + ' + customField : '') + ')...', 'info');
  BX24.callMethod('user.get', { active: true, SELECT: select }, function (res) {
    if (res.error()) { logAction('Ошибка проверки отсутствий: ' + getApiErrorMessage(res), 'error'); if (done) done(); return; }
    const list = res.data() || [];
    const absents = [];
    const withAbsenceRaw = [];
    const now = new Date();
    list.forEach(u => {
      let absent = false;
      const ranges = parseAbsenceRanges(u.UF_ABSENCE);
      if (ranges.length) {
        withAbsenceRaw.push(String(u.ID));
        ranges.forEach(([f, t]) => {
          const tEnd = new Date(t.getTime() + 24 * 60 * 60 * 1000);
          if (now >= f && now <= tEnd) absent = true;
        });
      }
      if (!absent && customField) {
        let v = u[customField];
        if (Array.isArray(v)) v = v[0];
        const s = String(v || '').toLowerCase();
        if (s && values.some(val => s.includes(val))) absent = true;
      }
      if (absent) absents.push(String(u.ID));
    });
    settings.unavailableUsers = absents;
    localStorage.setItem('b24_absence_check_date', new Date().toISOString().slice(0, 10));
    logAction('Проверка выполнена: всего пользователей ' + list.length + ', с непустым UF_ABSENCE ' + withAbsenceRaw.length + ', сейчас отсутствуют ' + absents.length, 'success');
    if (withAbsenceRaw.length === 0) logAction('⚠ Ни у кого нет UF_ABSENCE. Проверьте, что в профиле сотрудника реально заполнены даты отпуска/больничного (Поле «Отсутствие»).', 'info');
    saveSettingsToBoth();
    if (done) done();
  });
}

window.isUserUnavailable = isUserUnavailable;
window.refreshUnavailableUsers = refreshUnavailableUsers;
window.refreshUnavailableUsersForce = refreshUnavailableUsersForce;
window.parseAbsenceRanges = parseAbsenceRanges;
window.runAbsenceCheck = runAbsenceCheck;