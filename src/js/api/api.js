// ============================================================
// МОДУЛЬ: api.js — Обёртки над BX24 API
// ============================================================
let b24Ready = false;
var deleteInProgress = {};
var urlParamsProcessed = false;
var invoiceFieldCodesCache = null;

function getPortalDomain() {
  if (window.__portalDomain) return window.__portalDomain;
  try {
    if (typeof BX24 !== 'undefined' && typeof BX24.getDomain === 'function') {
      const d = BX24.getDomain();
      if (d && d.indexOf('cdn') === -1 && d.indexOf('bitrix24') !== -1) { window.__portalDomain = 'https://' + d; return window.__portalDomain; }
    }
  } catch (e) {}
  try { const m = window.location.search.match(/[?&]DOMAIN=([^&]+)/); if (m) { const dom = decodeURIComponent(m[1]); if (dom && dom.indexOf('cdn') === -1) { window.__portalDomain = 'https://' + dom; return window.__portalDomain; } } } catch (e) {}
  try { if (document.referrer) { const o = new URL(document.referrer).origin; if (o.indexOf('bitrix24') !== -1 && o.indexOf('cdn') === -1) { window.__portalDomain = o; return o; } } } catch (e) {}
  const origin = window.location.origin;
  if (origin && origin.indexOf('cdn') === -1) { window.__portalDomain = origin; return origin; }
  return '';
}

function buildAppLink(action, itemId, tab) {
  const domain = getPortalDomain();
  if (!domain || !itemId) return '';
  const clientId = (settings.clientId || '').trim();
  const tabSuffix = tab ? ('&params[tab]=' + encodeURIComponent(tab)) : '';
  if (clientId) return domain + '/marketplace/view/' + encodeURIComponent(clientId) + '/?params[action]=' + encodeURIComponent(action) + '&params[id]=' + encodeURIComponent(itemId) + tabSuffix;
  return domain + '/crm/smartprocess/' + ENTITY_TYPE_ID + '/item/' + itemId + '/';
}

function formatCreatedDate(v) { if (!v) return '—'; try { const d = new Date(v); if (!isNaN(d.getTime())) return d.toLocaleDateString('ru-RU'); } catch (e) {} return '—'; }

function formatDeadline(v) {
  if (!v) return 'не указан';
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '.' + m[2] + '.' + m[1];
  try { const d = new Date(s); if (!isNaN(d.getTime())) return d.toLocaleDateString('ru-RU'); } catch (e) {}
  return s;
}

function parseAmount(v) {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) v = v[0];
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[^\d.,-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? '' : num;
}

function greetUser(userId) {
  const n = (typeof userNames !== 'undefined' && userNames[userId]) ? userNames[userId] : 'коллега';
  return '[USER=' + parseInt(userId) + ']' + n + '[/USER]';
}

function buildPurchaseMeta(item) {
  const no = item.id;
  const dateStr = formatCreatedDate(item.createdTime);
  let shortDesc = '';
  try { shortDesc = (typeof cleanText === 'function' ? cleanText(item[actualFields.shortDesc]) : (item[actualFields.shortDesc] || '')) || item.title || '—'; } catch (e) { shortDesc = item.title || '—'; }
  const deadlineStr = formatDeadline(item[actualFields.deadlineZakup]);
  const creatorRaw = item[actualFields.creator];
  const creatorId = Array.isArray(creatorRaw) ? creatorRaw[0] : creatorRaw;
  const realCreatorId = creatorId || item.createdBy;
  const creatorName = (realCreatorId && (userNames[realCreatorId] || realCreatorId)) || '—';
  const creatorDept = (realCreatorId && userDepts[realCreatorId]) || '—';
  return { no, dateStr, shortDesc, deadlineStr, creatorName, creatorDept, creatorId: realCreatorId };
}

function formatPurchaseBody(meta, extraComment) {
  let body = '[B]Что нужно закупить (Кратко):[/B] ' + meta.shortDesc + '\n' +
             '[B]Крайний срок закупки:[/B] ' + meta.deadlineStr + '\n' +
             '[B]Кто создал запрос:[/B] ' + meta.creatorName;
  if (extraComment) body += '\n[B]Комментарий:[/B] ' + extraComment;
  return body;
}

function resolveDeptHeadId(item, respectTestMode) {
  if (!item) return null;
  if (respectTestMode && isTestMode && currentUser) return parseInt(currentUser.ID);
  const headArr = Array.isArray(item[actualFields.deptHead]) ? item[actualFields.deptHead] : (item[actualFields.deptHead] ? [item[actualFields.deptHead]] : []);
  if (headArr.length > 0) { const id = parseInt(headArr[0]); if (id) return id; }
  const deptId = String(Array.isArray(item[actualFields.dept]) ? item[actualFields.dept][0] : (item[actualFields.dept] || ''));
  if (deptId && settings.deptHeads && settings.deptHeads[deptId]) { const id = parseInt(settings.deptHeads[deptId]); if (id) return id; }
  if (deptId) { const d = departments.find(x => String(x.ID) === deptId); if (d && d.UF_HEAD) { const id = parseInt(d.UF_HEAD); if (id) return id; } }
  return null;
}

function sendBotNotification(userId, title, message, links, cb, dedupeBase) {
  notifyUserViaBot(userId, title, message, links, function (success) {
    if (!success) {
      logAction('Fallback: im.notify', 'info');
      const firstLink = (links && links[0] && links[0].url) ? links[0].url : '';
      BX24.callMethod('im.notify', { to: userId, message: title + '\n' + message, type: 'SYSTEM', link: firstLink, button_text: firstLink ? 'Открыть' : '' }, function (r) {
        if (r.error()) logAction('im.notify (ID ' + userId + ') не прошёл: ' + getApiErrorMessage(r), 'error');
      });
    }
    if (cb) cb(success);
  }, dedupeBase);
}

function notifySelectExecutor(userId, item, taskId, comment) {
  userId = parseInt(userId);
  if (!userId || !item) return;
  const meta = buildPurchaseMeta(item);
  const title = 'Необходимо выбрать исполнителя для закупки №' + meta.no + ' от ' + meta.dateStr;
  const message = greetUser(userId) + '\n\n' + formatPurchaseBody(meta, comment);
  const domain = getPortalDomain();
  const taskLink = taskId ? (domain ? domain + '/company/personal/user/' + userId + '/tasks/task/view/' + taskId + '/' : '') : '';
  const links = [
    { text: '👤 Выбрать исполнителя', url: buildAppLink('select_executor', item.id, 'my_requests') },
    { text: '📋 Открыть закупку', url: buildAppLink('view', item.id, 'my_requests') },
    taskLink ? { text: '✅ Открыть задачу', url: taskLink } : null
  ].filter(function (l) { return l && l.url; });
  sendBotNotification(userId, title, message, links, null, 'select_executor_' + item.id);
}

function notifyCollectData(userId, item) {
  userId = parseInt(userId);
  if (!userId || !item) return;
  const meta = buildPurchaseMeta(item);
  const title = 'Необходимо собрать данные и рассчитать стоимость по закупке №' + meta.no + ' от ' + meta.dateStr;
  const message = greetUser(userId) + '\n\n' + formatPurchaseBody(meta);
  const links = [{ text: '📝 Заполнить данные', url: buildAppLink('fill', item.id, 'inbox') }].filter(l => l.url);
  sendBotNotification(userId, title, message, links, null, 'collect_' + item.id);
}

function resolveCombinedDir(item) {
  let text = item[actualFields.combinedDir] || '';
  if (!text || text === '—') {
    const secName = getDisplayValue(item, actualFields.section, 'enum');
    const dirName = getDisplayValue(item, actualFields.direction, 'enum');
    const sec = (secName && secName !== '—') ? secName : '';
    const dir = (dirName && dirName !== '—') ? dirName : '';
    if (sec && dir) text = `${sec} / ${dir}`;
    else if (sec) text = sec;
    else text = '';
  }
  return text;
}

function buildApprovalCard(item) {
  const meta = buildPurchaseMeta(item);
  const productAmount = parseAmount(item[actualFields.amountProduct]) || 0;
  const deliveryAmount = parseAmount(item[actualFields.amountDelivery]) || 0;
  const total = productAmount + deliveryAmount;
  const deadline = formatDeadline(item[actualFields.deadlineZakup]);
  const deptId = String(Array.isArray(item[actualFields.dept]) ? item[actualFields.dept][0] : (item[actualFields.dept] || ''));
  const deptName = settings.deptShortNames[deptId] || (departments.find(d => String(d.ID) === deptId)?.NAME || '—');
  const mgrId = Array.isArray(item[actualFields.manager]) ? item[actualFields.manager][0] : (item[actualFields.manager] || '');
  const mgrName = mgrId ? (userNames[mgrId] || mgrId) : '—';
  const combinedDirText = resolveCombinedDir(item);
  const comment = item[actualFields.comment] ? cleanText(item[actualFields.comment]) : '';
  const lines = [
    '[B]Что нужно закупить (Кратко):[/B] ' + meta.shortDesc,
    '[B]Срок:[/B] ' + deadline,
    '[B]Заказчик:[/B] ' + meta.creatorName + ' (' + meta.creatorDept + ')',
    '[B]Менеджер:[/B] ' + mgrName,
    '[B]Сумма:[/B] ' + (total ? total.toLocaleString('ru-RU') + ' ₽' : 'не указана')
  ];
  if (combinedDirText) lines.push('[B]Раздел/Направление:[/B] ' + combinedDirText);
  if (comment) lines.push('[B]Комментарий:[/B] ' + comment);
  const text = lines.join('\n');
  const links = [
    { text: '✅ Согласовать', url: buildAppLink('approve', item.id, 'inbox') },
    { text: '🔧 На доработку', url: buildAppLink('rework', item.id, 'inbox') },
    { text: '❌ Отклонить', url: buildAppLink('reject', item.id, 'inbox') }
  ].filter(l => l.url);
  return { text, links, deptName, no: meta.no, date: meta.dateStr };
}

function notifyApprovalNeeded(headId, item) {
  headId = parseInt(headId);
  if (!headId || !item) { logAction('notifyApprovalNeeded: headId не определён', 'error'); return; }
  const card = buildApprovalCard(item);
  const title = 'Согласование по закупке отделом ' + card.deptName + ' №' + card.no + ' от ' + card.date;
  const message = greetUser(headId) + '\n\n' + card.text;
  notifyUserViaBot(headId, title, message, card.links, function (success) {
    if (!success) {
      BX24.callMethod('im.notify', { to: headId, message: title + '\n' + message, type: 'SYSTEM', link: buildAppLink('approve', item.id, 'inbox'), button_text: 'Согласовать' }, function (r) {
        if (r.error()) logAction('im.notify (ID ' + headId + ') не прошёл: ' + getApiErrorMessage(r), 'error');
      });
    }
  }, 'approval_' + item.id);
}

function notifyReworkNeeded(managerId, item, reworkComment) {
  managerId = parseInt(managerId);
  if (!managerId || !item) return;
  const meta = buildPurchaseMeta(item);
  const title = 'Закупка №' + meta.no + ' отправлена на доработку';
  const message = greetUser(managerId) + '\n\nЗакупка «' + meta.shortDesc + '» отправлена на доработку.\n' +
    (reworkComment ? '[B]Комментарий:[/B] ' + reworkComment + '\n' : '') +
    'Необходимо скорректировать данные и отправить на согласование повторно.';
  const links = [{ text: '🔧 Исправить данные', url: buildAppLink('fill', item.id, 'inbox') }].filter(l => l.url);
  notifyUserViaBot(managerId, title, message, links, function (success) {
    if (!success) BX24.callMethod('im.notify', { to: managerId, message: title + '\n' + message, type: 'SYSTEM', link: links[0] ? links[0].url : '', button_text: links[0] ? links[0].text : '' }, function () {});
  }, 'rework_' + item.id);
}

function notifyAfterDecision(managerId, item, approved) {
  managerId = parseInt(managerId);
  if (!managerId || !item) return;
  const meta = buildPurchaseMeta(item);
  const productAmount = parseAmount(item[actualFields.amountProduct]) || 0;
  const deliveryAmount = parseAmount(item[actualFields.amountDelivery]) || 0;
  const total = productAmount + deliveryAmount;
  const title = approved ? 'Условия согласованы' : 'Закупка отклонена';
  const message = greetUser(managerId) + '\n\n' + (approved
    ? 'Условия по закупке «' + meta.shortDesc + '» согласованы.\n[B]Сумма товаров:[/B] ' + productAmount.toLocaleString('ru-RU') + ' ₽\n[B]Сумма доставки:[/B] ' + deliveryAmount.toLocaleString('ru-RU') + ' ₽\n[B]ИТОГО:[/B] ' + total.toLocaleString('ru-RU') + ' ₽\nНеобходимо загрузить входящий счёт.'
    : 'Закупка «' + meta.shortDesc + '» отклонена на этапе согласования.');
  const links = [{ text: approved ? '📄 Загрузить счёт' : '📋 Открыть закупку', url: buildAppLink(approved ? 'upload' : 'view', item.id, 'inbox') }].filter(l => l.url);
  notifyUserViaBot(managerId, title, message, links, function (success) {
    if (!success) BX24.callMethod('im.notify', { to: managerId, message: title + '\n' + message, type: 'SYSTEM', link: links[0] ? links[0].url : '', button_text: links[0] ? links[0].text : '' }, function () {});
  }, 'decision_' + item.id + '_' + (approved ? 'ok' : 'no'));
}

function notifyInvoiceEvent(item, kind) {
  if (!item) return;
  const meta = buildPurchaseMeta(item);
  const mgrArr = Array.isArray(item[actualFields.manager]) ? item[actualFields.manager] : (item[actualFields.manager] ? [item[actualFields.manager]] : []);
  const recipients = [];
  if (mgrArr.length) recipients.push(parseInt(mgrArr[0]));
  const headId = resolveDeptHeadId(item, true);
  if (headId) recipients.push(headId);
  const uniq = [...new Set(recipients.filter(Boolean))];
  const map = {
    approved: { title: 'Входящий счёт утверждён', msg: 'Входящий счёт по закупке №' + meta.no + ' «' + meta.shortDesc + '» утверждён экономистом. Ожидайте оплату.' },
    paid: { title: 'Входящий счёт оплачен', msg: 'Входящий счёт по закупке №' + meta.no + ' «' + meta.shortDesc + '» оплачен. Товары в пути — подтвердите получение.' },
    rejected: { title: 'Входящий счёт отклонён', msg: 'Входящий счёт по закупке №' + meta.no + ' «' + meta.shortDesc + '» отклонён. Требуется корректировка.' }
  };
  const info = map[kind];
  if (!info) return;
  const links = [{ text: '📋 Открыть закупку', url: buildAppLink('view', item.id, 'inbox') }].filter(l => l.url);
  uniq.forEach(function (uid) {
    notifyUserViaBot(uid, info.title, greetUser(uid) + '\n\n' + info.msg, links, null, 'invoice_' + kind + '_' + item.id);
  });
}

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

function runAbsenceCheck(done) {
  done = done || function () {};
  const field = (settings.absenceField || '').trim();
  if (!field) { logAction('Поле статуса отсутствия не настроено — автопроверка пропущена', 'info'); if (done) done(); return; }
  const values = (settings.absenceValues || 'отпуск,больничный,командировка,не в офисе').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  logAction('Проверка отсутствий (поле: ' + field + ')...', 'info');
  BX24.callMethod('user.get', { active: true, SELECT: ['ID', 'NAME', 'LAST_NAME', field] }, function (res) {
    if (res.error()) { logAction('Ошибка проверки отсутствий: ' + getApiErrorMessage(res) + ' — проверьте код поля', 'error'); if (done) done(); return; }
    const list = res.data() || [];
    const absents = [];
    list.forEach(u => {
      let v = u[field];
      if (Array.isArray(v)) v = v[0];
      const s = String(v || '').toLowerCase();
      if (s && values.some(val => s.includes(val))) absents.push(String(u.ID));
    });
    settings.unavailableUsers = absents;
    localStorage.setItem('b24_absence_check_date', new Date().toISOString().slice(0, 10));
    logAction('Проверка выполнена: недоступных ' + absents.length, 'success');
    saveSettingsToBoth();
    if (done) done();
  });
}

function getInvoiceFieldCodes(cb) {
  if (invoiceFieldCodesCache) return cb(invoiceFieldCodesCache);
  BX24.callMethod('crm.item.fields', { entityTypeId: INVOICE_ENTITY_ID }, function (res) {
    if (res.error()) { logAction('Ошибка полей входящих счетов: ' + getApiErrorMessage(res), 'error'); return cb({}); }
    const fd = res.data().fields || {};
    const codes = {};
    for (const hintKey in INVOICE_FIELD_HINTS) {
      const needles = INVOICE_FIELD_HINTS[hintKey];
      const found = Object.keys(fd).find(code => {
        if (['id', 'title', 'xmlId', 'createdTime', 'updatedTime', 'createdBy', 'updatedBy', 'categoryId', 'stageId', 'assignedById', 'opened', 'movedTime', 'movedBy', 'lastActivityTime', 'lastActivityBy'].includes(code)) return false;
        const t = (fd[code].title || '').toLowerCase().replace(/ё/g, 'е');
        return needles.some(n => t.includes(n));
      });
      if (found) codes[hintKey] = found;
    }
    invoiceFieldCodesCache = codes;
    logAction('Поля входящих счетов: ' + JSON.stringify(codes), 'info');
    cb(codes);
  });
}

function delegatePurchase(itemId, toUserId, note, cb) {
  itemId = parseInt(itemId); toUserId = parseInt(toUserId);
  if (!itemId || !toUserId) { logAction('delegatePurchase: invalid args', 'error'); if (cb) cb(false); return; }
  const item = items.find(i => i.id === itemId);
  if (!item) { logAction('delegatePurchase: закупка не найдена', 'error'); if (cb) cb(false); return; }
  if (isUserUnavailable(toUserId)) { showToast('Получатель отмечен как недоступный', 'error'); if (cb) cb(false); return; }
  const mgrVal = item[actualFields.manager];
  const fromId = Array.isArray(mgrVal) ? mgrVal[0] : (mgrVal || '');
  const fromName = fromId ? (userNames[fromId] || fromId) : '—';
  const toName = userNames[toUserId] || toUserId;
  const stamp = new Date().toLocaleString('ru-RU');
  const actorName = currentUser ? (currentUser.NAME + ' ' + (currentUser.LAST_NAME || '')) : '—';
  const line = `[ДЕЛЕГ] ${stamp}: ${fromName} → ${toName} (делегировал: ${actorName})` + (note ? ` | ${note}` : '');
  const histField = actualFields.delegateHistory;
  let existing = histField && item[histField] ? String(item[histField]) : '';
  const newHist = existing ? (existing + '\n' + line) : line;
  const updFields = {};
  updFields[actualFields.manager] = [String(toUserId)];
  if (histField && fieldDefs[histField]) updFields[histField] = newHist;
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: itemId, fields: updFields }, function (res) {
    if (res.error()) { showToast('Ошибка делегирования', 'error'); if (cb) cb(false); return; }
    item[actualFields.manager] = [String(toUserId)];
    if (histField) item[histField] = newHist;
    delegateHistory[itemId] = newHist;
    try { localStorage.setItem('purchase_delegate_history_1088', JSON.stringify(delegateHistory)); } catch (e) {}
    const taskSborId = item[actualFields.taskSbor];
    const afterTask = function () {
      try {
        const meta = buildPurchaseMeta(item);
        const title = 'Закупка делегирована вам: №' + meta.no + ' от ' + meta.dateStr;
        const message = greetUser(toUserId) + '\n\n' + formatPurchaseBody(meta) + '\n\nДелегировал: ' + (fromName || '—') + (note ? ('\nПричина: ' + note) : '');
        const links = [{ text: '📝 Заполнить данные', url: buildAppLink('fill', item.id, 'inbox') }].filter(l => l.url);
        notifyUserViaBot(toUserId, title, message, links, function (ok) { if (!ok) sendBotNotification(toUserId, title, message, links); }, 'delegate_' + itemId + '_' + toUserId);
      } catch (e) { logAction('Ошибка уведомления о делегировании: ' + e.message, 'error'); }
      showToast('Закупка делегирована: ' + toName, 'success');
      loadAllData();
      if (cb) cb(true);
    };
    if (taskSborId && String(taskSborId).match(/^\d+$/)) {
      BX24.callMethod('tasks.task.update', { taskId: parseInt(taskSborId), fieldsToSave: { RESPONSIBLE_ID: toUserId } }, function (tr) {
        if (tr.error()) logAction('Ошибка переназначения задачи сбора: ' + getApiErrorMessage(tr), 'error');
        afterTask();
      });
    } else afterTask();
  });
}

function deletePurchaseWithCleanup(id, done) {
  id = parseInt(id);
  if (!id) { if (done) done(false); return; }
  if (deleteInProgress[id]) return;
  deleteInProgress[id] = true;
  const item = items.find(function (i) { return i.id === id; });
  if (!item) { deleteInProgress[id] = false; if (done) done(false); return; }
  logAction('[ОЧИСТКА] закупка ID ' + id, 'info');
  var tasksToDelete = [];
  [actualFields.taskVyborSotr, actualFields.taskSbor, actualFields.taskZagruz].forEach(function (f) {
    const v = item[f]; if (v && /^\d+$/.test(String(v))) tasksToDelete.push(parseInt(String(v)));
  });
  var prepSteps = (tasksToDelete.length > 0 ? 1 : 0) + (INVOICE_ENTITY_ID ? 1 : 0);
  var completed = 0;
  function finalizeDelete() {
    BX24.callMethod('crm.item.delete', { entityTypeId: ENTITY_TYPE_ID, id: id }, function (res) {
      deleteInProgress[id] = false;
      if (res.error()) { logAction('[ОЧИСТКА] ошибка: ' + getApiErrorMessage(res), 'error'); if (done) done(false); }
      else { items = items.filter(function (i) { return i.id !== id; }); render(); if (done) done(true); }
    });
  }
  function stepDone(ok, msg) { completed++; logAction('[ОЧИСТКА] шаг ' + completed + '/' + prepSteps + ': ' + msg, ok ? 'info' : 'error'); if (completed >= prepSteps) finalizeDelete(); }
  if (prepSteps === 0) { finalizeDelete(); return; }
  if (tasksToDelete.length > 0) {
    var taskBatch = {};
    tasksToDelete.forEach(function (tid, idx) { taskBatch['t' + idx] = ['tasks.task.delete', { taskId: tid }]; });
    BX24.callBatch(taskBatch, function (res) {
      tasksToDelete.forEach(function (tid, idx) { var r = res['t' + idx]; if (r && r.error && r.error() && !/UNKNOWN/i.test(getApiErrorMessage(r))) logAction('[ОЧИСТКА] задача ' + tid + ': ' + getApiErrorMessage(r), 'error'); });
      stepDone(true, 'Задачи удалены');
    });
  }
  if (INVOICE_ENTITY_ID) {
    BX24.callMethod('crm.item.list', { entityTypeId: INVOICE_ENTITY_ID, filter: { title: '%№' + id + '%' }, select: ['id', 'title'] }, function (res) {
      if (res.error()) { stepDone(false, 'Ошибка поиска счетов'); return; }
      var invItems = res.data().items || [];
      if (!invItems.length) { stepDone(true, 'Счетов нет'); return; }
      var invBatch = {};
      invItems.forEach(function (inv, idx) { invBatch['i' + idx] = ['crm.item.delete', { entityTypeId: INVOICE_ENTITY_ID, id: inv.id }]; });
      BX24.callBatch(invBatch, function () { stepDone(true, 'Счета удалены: ' + invItems.length); });
    });
  }
}

function loadAllData() {
  if (!b24Ready) return;
  if (loadAllDataInProgress) { logAction('Загрузка уже идёт', 'info'); return; }
  loadAllDataInProgress = true;
  logAction('Загрузка списка закупок...', 'info');
  if (items.length === 0) document.getElementById('app-container').innerHTML = '<div class="loading" style="grid-column: 1/-1;">Загрузка данных...</div>';
  BX24.callMethod('crm.item.list', { entityTypeId: ENTITY_TYPE_ID, select: ['*', 'UF_*'] }, function (res) {
    loadAllDataInProgress = false;
    if (res.error()) { document.getElementById('app-container').innerHTML = '<div class="error-box">Ошибка: ' + getApiErrorMessage(res) + '</div>'; return; }
    items = res.data().items || [];
    logAction('Данные загружены. Всего: ' + items.length, 'success');
    syncManagersFromTasks(function () { render(); handleUrlParams(); });
  });
}

function changeScenario(val) { currentScenario = val; localStorage.setItem('purchase_scenario', val); showToast('Сценарий: ' + val); }

function runScenarioAfterCreate(itemId) {
  if (!isTestMode || currentScenario === 'none') return;
  if (scenarioRunning[itemId]) return;
  scenarioRunning[itemId] = true;
  var item = items.find(function (i) { return i.id === itemId; });
  if (!item) return;
  var secDef = fieldDefs[actualFields.section];
  var dirDef = fieldDefs[actualFields.direction];
  var firstSec = secDef && secDef.items && secDef.items.length > 0 ? secDef.items[0].ID : null;
  var firstDir = dirDef && dirDef.items && dirDef.items.length > 0 ? dirDef.items[0].ID : null;
  var secText = firstSec && secDef ? (secDef.items.find(function (i) { return String(i.ID) === String(firstSec); }) || {}).VALUE : '';
  var dirText = firstDir && dirDef ? (dirDef.items.find(function (i) { return String(i.ID) === String(firstDir); }) || {}).VALUE : '';
  var combinedText = (secText && dirText) ? (secText + ' / ' + dirText) : secText;
  var targetStageName = currentScenario === 'upload' ? 'загрузка' : currentScenario === 'approval' ? 'согласование' : 'сбор данных';
  var targetStageId = getStageIdByName(targetStageName);
  if (!targetStageId) { logAction('Стадия "' + targetStageName + '" не найдена', 'error'); return; }
  var fields = { stageId: targetStageId };
  if (actualFields.manager && fieldDefs[actualFields.manager]) fields[actualFields.manager] = [String(currentUser.ID)];
  if (actualFields.deptHead && fieldDefs[actualFields.deptHead]) fields[actualFields.deptHead] = [String(currentUser.ID)];
  if (currentScenario === 'upload' || currentScenario === 'approval') {
    if (firstSec) fields[actualFields.section] = firstSec;
    if (firstDir) fields[actualFields.direction] = firstDir;
    if (combinedText && actualFields.combinedDir) fields[actualFields.combinedDir] = combinedText;
    if (!item[actualFields.amountProduct] || parseFloat(item[actualFields.amountProduct]) === 0) fields[actualFields.amountProduct] = 10000;
  }
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(itemId), fields: fields }, function (res) {
    if (res.error()) logAction('Ошибка сценария: ' + getApiErrorMessage(res), 'error');
    else { showToast('Сценарий: ' + targetStageName); loadAllData(); }
  });
}

function syncManagersFromTasks(done) {
  done = done || function () {};
  var need = items.filter(function (i) {
    if (syncManagersInProgress[i.id]) return false;
    var mgr = i[actualFields.manager];
    var has = Array.isArray(mgr) ? mgr.length > 0 : !!mgr;
    var taskId = i[actualFields.taskVyborSotr];
    return !has && taskId && String(taskId).match(/^\d+$/);
  });
  if (need.length === 0) { done(); return; }
  need.forEach(function (i) { syncManagersInProgress[i.id] = true; });
  var batch = {};
  need.forEach(function (i) { batch['t' + i.id] = ['tasks.task.get', { taskId: parseInt(i[actualFields.taskVyborSotr]) }]; });
  BX24.callBatch(batch, function (res) {
    var found = [];
    need.forEach(function (i, idx) {
      var r = (res['t' + i.id]) || (Array.isArray(res) ? res[idx] : null);
      if (!r) { syncManagersInProgress[i.id] = false; return; }
      if (r.error && r.error()) { syncManagersInProgress[i.id] = false; return; }
      var task = (r.data() && r.data().task) || r.data() || {};
      var accomplices = task.accomplices || [];
      var isCompleted = String(task.status) === '5';
      if (accomplices.length > 0) found.push({ item: i, mgrId: String(accomplices[0]) });
      else if (isCompleted && task.responsibleId) found.push({ item: i, mgrId: String(task.responsibleId) });
      else syncManagersInProgress[i.id] = false;
    });
    if (found.length === 0) { done(); return; }
    var pending = found.length;
    var finish = function (itemId) { syncManagersInProgress[itemId] = false; pending--; if (pending === 0) done(); };
    found.forEach(function (f) {
      if (isUserUnavailable(f.mgrId)) {
        logAction('Исполнитель недоступен: ' + (userNames[f.mgrId] || f.mgrId), 'error');
        const headId = resolveDeptHeadId(f.item, true);
        if (headId) sendBotNotification(headId, 'Исполнитель недоступен', greetUser(headId) + '\n\nИсполнитель ' + (userNames[f.mgrId] || f.mgrId) + ' недоступен. Делегируйте закупку №' + f.item.id + '.', [{ text: '📋 Открыть закупку', url: buildAppLink('view', f.item.id, 'my_requests') }].filter(l => l.url), null, 'unavail_' + f.item.id);
        finish(f.item.id);
        return;
      }
      var sborStageId = getStageIdByName('сбор данных');
      var updFields = {};
      updFields[actualFields.manager] = [f.mgrId];
      if (sborStageId) updFields.stageId = sborStageId;
      BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(f.item.id), fields: updFields }, function (r2) {
        if (r2.error()) { finish(f.item.id); return; }
        f.item[actualFields.manager] = [f.mgrId];
        if (sborStageId) f.item.stageId = sborStageId;
        if (!f.item[actualFields.taskSbor]) {
          var shortDescText = cleanText(f.item[actualFields.shortDesc]) || f.item.title;
          var headId = resolveDeptHeadId(f.item, true);
          var createdBy = parseInt(systemUserId) || 1;
          var taskPayload = {
            TITLE: '[🛒] Сбор данных и расчет по закупке',
            RESPONSIBLE_ID: parseInt(f.mgrId),
            CREATED_BY: createdBy,
            DESCRIPTION: 'Необходимо собрать данные по закупке "' + shortDescText + '".',
            STATUS: 2,
            ADD_IN_REPORT: 'Y'
          };
          if (headId) taskPayload.OBSERVERS = [headId];
          BX24.callMethod('tasks.task.add', { fields: taskPayload }, function (tr) {
            if (!tr.error()) {
              var newTaskId = tr.data().task.id;
              logAction('Задача сбора создана (ID: ' + newTaskId + ')', 'success');
              try { notifyCollectData(parseInt(f.mgrId), f.item); } catch (e) { logAction('Ошибка уведомления: ' + e.message, 'error'); }
              BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(f.item.id), fields: { [actualFields.taskSbor]: String(newTaskId) } }, function () {
                f.item[actualFields.taskSbor] = String(newTaskId);
                finish(f.item.id);
              });
            } else { logAction('Ошибка создания задачи сбора: ' + getApiErrorMessage(tr), 'error'); finish(f.item.id); }
          });
        } else finish(f.item.id);
      });
    });
  }, function () { need.forEach(function (i) { syncManagersInProgress[i.id] = false; }); done(); });
}

function handleUrlParams() {
  if (urlParamsProcessed) return;
  var params = getIncomingParams();
  var itemId = params.itemId;
  var action = params.action;
  var tab = params.tab;
  if (itemId) {
    urlParamsProcessed = true;
    var attempts = 0;
    var checkItemsInterval = setInterval(function () {
      attempts++;
      if (items.length > 0 || attempts >= 20) {
        clearInterval(checkItemsInterval);
        if (items.length > 0) {
          var id = parseInt(itemId);
          if (tab) { try { if (typeof switchTab === 'function') switchTab(tab); } catch (e) {} }
          if (action === 'fill') openDataModal(id);
          else if (action === 'upload') openUploadModal(id);
          else if (action === 'approve') openActionModal(id, 'approve_terms');
          else if (action === 'reject') openActionModal(id, 'reject_terms');
          else if (action === 'rework') openActionModal(id, 'send_to_rework');
          else if (action === 'select_executor') openExecutorModal(id);
          else openViewModal(id);
          try { window.history.replaceState({}, '', window.location.protocol + "//" + window.location.host + window.location.pathname); } catch (e) {}
        } else showToast('Не удалось загрузить данные', 'error');
      }
    }, 500);
  }
}

function getIncomingParams() {
  try { if (typeof BX24 !== 'undefined' && BX24.placement && typeof BX24.placement.info === 'function') { const info = BX24.placement.info(); const o = (info && info.options) || {}; if (o.id) return { action: o.action || 'view', itemId: o.id, tab: o.tab || '' }; } } catch (e) {}
  try { const up = new URLSearchParams(window.location.search); if (up.get('id')) return { action: up.get('action') || 'view', itemId: up.get('id'), tab: up.get('tab') || '' }; } catch (e) {}
  try { const h = (window.location.hash || '').replace(/^#/, ''); if (h) { const hp = new URLSearchParams(h); if (hp.get('id')) return { action: hp.get('action') || 'view', itemId: hp.get('id'), tab: hp.get('tab') || '' }; } } catch (e) {}
  return { action: '', itemId: '', tab: '' };
}

function getStageIdByName(keyword) {
  var search = keyword.toLowerCase().replace(/ё/g, 'е');
  var stage = spStagesSorted.find(function (s) { return s.name.toLowerCase().replace(/ё/g, 'е') === search; });
  if (stage) return stage.id;
  stage = spStagesSorted.find(function (s) { return s.name.toLowerCase().replace(/ё/g, 'е').includes(search); });
  return stage ? stage.id : null;
}

function getNextStageId(currentStageId) {
  var currentIndex = spStagesSorted.findIndex(function (s) { return s.id === currentStageId; });
  if (currentIndex === -1) return null;
  for (var i = currentIndex + 1; i < spStagesSorted.length; i++) { var stName = spStagesSorted[i].name.toLowerCase().replace(/ё/g, 'е'); if (!stName.includes('успех') && !stName.includes('провал') && !stName.includes('отмен')) return spStagesSorted[i].id; }
  return null;
}

(function setupAutoRefreshOnFocus() {
  var lastSyncTime = 0;
  var MIN_INTERVAL = 15000;
  var tryReload = function () {
    if (!b24Ready) return;
    var now = Date.now();
    if (now - lastSyncTime < MIN_INTERVAL) return;
    lastSyncTime = now;
    logAction('Возврат во вкладку — автообновление', 'info');
    loadAllData();
  };
  window.addEventListener('focus', tryReload);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') tryReload(); });
})();