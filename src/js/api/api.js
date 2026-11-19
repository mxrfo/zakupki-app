// ============================================================
// МОДУЛЬ: api.js — Обёртки над BX24 API
// ============================================================

let b24Ready = false;
var deleteInProgress = {};
var urlParamsProcessed = false;

function getPortalDomain() {
  if (window.__portalDomain) return window.__portalDomain;
  try {
    if (typeof BX24 !== 'undefined' && typeof BX24.getDomain === 'function') {
      const d = BX24.getDomain();
      if (d && d.indexOf('cdn') === -1 && d.indexOf('bitrix24') !== -1) {
        window.__portalDomain = 'https://' + d;
        return window.__portalDomain;
      } else if (d) {
        logAction('getPortalDomain: BX24.getDomain() вернул CDN-домен: ' + d, 'error');
      }
    }
  } catch (e) {}
  try {
    const m = window.location.search.match(/[?&]DOMAIN=([^&]+)/);
    if (m) {
      const dom = decodeURIComponent(m[1]);
      if (dom && dom.indexOf('cdn') === -1) {
        window.__portalDomain = 'https://' + dom;
        return window.__portalDomain;
      }
    }
  } catch (e) {}
  try {
    if (document.referrer) {
      const o = new URL(document.referrer).origin;
      if (o.indexOf('bitrix24') !== -1 && o.indexOf('cdn') === -1) {
        window.__portalDomain = o;
        return o;
      }
    }
  } catch (e) {}
  const origin = window.location.origin;
  if (origin && origin.indexOf('cdn') === -1) {
    window.__portalDomain = origin;
    return origin;
  }
  logAction('getPortalDomain: не удалось определить домен портала (все источники — CDN)', 'error');
  return '';
}

function buildAppLink(action, itemId, tab) {
  const domain = getPortalDomain();
  if (!domain || !itemId) {
    logAction('buildAppLink: domain=' + domain + ', itemId=' + itemId + ' — ссылка не построена', 'error');
    return '';
  }
  const clientId = (settings.clientId || '').trim();
  const tabSuffix = tab ? ('&params[tab]=' + encodeURIComponent(tab)) : '';
  if (clientId) {
    return domain + '/marketplace/view/' + encodeURIComponent(clientId) +
      '/?params[action]=' + encodeURIComponent(action) +
      '&params[id]=' + encodeURIComponent(itemId) + tabSuffix;
  }
  return domain + '/crm/smartprocess/' + ENTITY_TYPE_ID + '/item/' + itemId + '/';
}

function formatCreatedDate(v) {
  if (!v) return '—';
  try {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('ru-RU');
  } catch (e) {}
  return '—';
}

function formatDeadline(v) {
  if (!v) return 'не указан';
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '.' + m[2] + '.' + m[1];
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('ru-RU');
  } catch (e) {}
  return s;
}

// ✅ Адресное обращение — упоминание получателя (в групповом чате подсветит нужного)
function greetUser(userId) {
  const n = (typeof userNames !== 'undefined' && userNames[userId]) ? userNames[userId] : 'коллега';
  return '[USER=' + parseInt(userId) + ']' + n + '[/USER], здравствуйте!';
}

function buildPurchaseMeta(item) {
  const no = item.id;
  const dateStr = formatCreatedDate(item.createdTime);
  let shortDesc = '';
  try {
    shortDesc = (typeof cleanText === 'function' ? cleanText(item[actualFields.shortDesc]) : (item[actualFields.shortDesc] || '')) || item.title || '—';
  } catch (e) {
    shortDesc = item.title || '—';
  }
  const deadlineStr = formatDeadline(item[actualFields.deadlineZakup]);
  const creatorRaw = item[actualFields.creator];
  const creatorId = Array.isArray(creatorRaw) ? creatorRaw[0] : creatorRaw;
  const fallbackId = item.createdBy;
  const realCreatorId = creatorId || fallbackId;
  const creatorName = (realCreatorId && (userNames[realCreatorId] || realCreatorId)) || '—';
  const creatorDept = (realCreatorId && userDepts[realCreatorId]) || '—';
  return { no, dateStr, shortDesc, deadlineStr, creatorName, creatorDept, creatorId: realCreatorId };
}

function formatPurchaseBody(meta) {
  return '[B]Что нужно закупить (Кратко):[/B] ' + meta.shortDesc + '\n' +
         '[B]Крайний срок закупки:[/B] ' + meta.deadlineStr + '\n' +
         '[B]Кто создал запрос:[/B] ' + meta.creatorName;
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

function sendBotNotification(userId, title, message, links, cb) {
  notifyUserViaBot(userId, title, message, links, function (success) {
    if (!success) {
      logAction('Fallback: отправка через im.notify', 'info');
      const firstLink = (links && links[0] && links[0].url) ? links[0].url : '';
      BX24.callMethod('im.notify', {
        to: userId, message: title + '\n' + message, type: 'SYSTEM',
        link: firstLink, button_text: firstLink ? 'Открыть' : ''
      }, function (r) {
        if (r.error()) logAction('im.notify (ID ' + userId + ') не прошёл: ' + getApiErrorMessage(r), 'error');
      });
    }
    if (cb) cb(success);
  });
}

// ✅ Уведомление №1: руководителю — выбрать исполнителя (обращение к получателю)
function notifySelectExecutor(userId, item, taskId) {
  userId = parseInt(userId);
  if (!userId || !item) return;
  const meta = buildPurchaseMeta(item);
  const title = 'Необходимо выбрать исполнителя для закупки №' + meta.no + ' от ' + meta.dateStr;
  const message = greetUser(userId) + '\n\n' + formatPurchaseBody(meta);

  const domain = getPortalDomain();
  const taskLink = taskId ? (domain ? domain + '/company/personal/user/' + userId + '/tasks/task/view/' + taskId + '/' : '') : '';

  const links = [
    { text: '📋 Открыть закупку', url: buildAppLink('view', item.id, 'my_requests') },
    taskLink ? { text: '✅ Открыть задачу', url: taskLink } : null
  ].filter(function (l) { return l && l.url; });

  sendBotNotification(userId, title, message, links);
}

// ✅ Уведомление №2: менеджеру — собрать данные (обращение к менеджеру)
function notifyCollectData(userId, item) {
  userId = parseInt(userId);
  if (!userId || !item) return;
  const meta = buildPurchaseMeta(item);
  const title = 'Необходимо собрать данные и рассчитать стоимость по закупке №' + meta.no + ' от ' + meta.dateStr;
  const message = greetUser(userId) + '\n\n' + formatPurchaseBody(meta);

  const links = [
    { text: '📝 Заполнить данные', url: buildAppLink('fill', item.id, 'inbox') }
  ].filter(function (l) { return l && l.url; });

  sendBotNotification(userId, title, message, links);
}

// ✅ Карточка согласования: новый формат, выделение жирным, без "Создал запрос" и "Требуется..."
function buildApprovalCard(item) {
  const meta = buildPurchaseMeta(item);
  const amount = item[actualFields.amountProduct] ? parseFloat(item[actualFields.amountProduct]).toLocaleString('ru-RU') + ' ₽' : 'не указана';
  const deadline = formatDeadline(item[actualFields.deadlineZakup]);
  const deptId = String(Array.isArray(item[actualFields.dept]) ? item[actualFields.dept][0] : (item[actualFields.dept] || ''));
  const deptName = settings.deptShortNames[deptId] || (departments.find(d => String(d.ID) === deptId)?.NAME || '—');
  const mgrId = Array.isArray(item[actualFields.manager]) ? item[actualFields.manager][0] : (item[actualFields.manager] || '');
  const mgrName = mgrId ? (userNames[mgrId] || mgrId) : '—';

  let combinedDirText = item[actualFields.combinedDir] || '';
  if (!combinedDirText && item[actualFields.section]) {
    const secName = getDisplayValue(item, actualFields.section, 'enum');
    const dirName = getDisplayValue(item, actualFields.direction, 'enum');
    if (secName !== '—') combinedDirText = `${secName} / ${dirName}`;
  }

  const comment = item[actualFields.comment] ? cleanText(item[actualFields.comment]) : '';

  const lines = [
    '[B]Что нужно закупить (Кратко):[/B] ' + meta.shortDesc,
    '[B]Срок:[/B] ' + deadline,
    '[B]Заказчик:[/B] ' + meta.creatorName + ' (' + meta.creatorDept + ')',
    '[B]Менеджер:[/B] ' + mgrName,
    '[B]Сумма:[/B] ' + amount
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

// ✅ Уведомление о согласовании: новый заголовок + обращение к согласующему
function notifyApprovalNeeded(headId, item) {
  headId = parseInt(headId);
  if (!headId || !item) {
    logAction('notifyApprovalNeeded: headId не определён — уведомление о согласовании НЕ отправлено', 'error');
    return;
  }
  const card = buildApprovalCard(item);
  const title = 'Согласование по закупке отделом ' + card.deptName + ' №' + card.no + ' от ' + card.date;
  const message = greetUser(headId) + '\n\n' + card.text;

  notifyUserViaBot(headId, title, message, card.links, function (success) {
    if (!success) {
      logAction('Fallback: im.notify о согласовании', 'info');
      BX24.callMethod('im.notify', {
        to: headId, message: title + '\n' + message, type: 'SYSTEM',
        link: buildAppLink('approve', item.id, 'inbox'), button_text: 'Согласовать'
      }, function (r) {
        if (r.error()) logAction('im.notify (ID ' + headId + ') не прошёл: ' + getApiErrorMessage(r), 'error');
      });
    }
  });
}

// ✅ Уведомление менеджеру о доработке (новая логика)
function notifyReworkNeeded(managerId, item, reworkComment) {
  managerId = parseInt(managerId);
  if (!managerId || !item) return;
  const meta = buildPurchaseMeta(item);
  const title = 'Закупка №' + meta.no + ' отправлена на доработку';
  const message = greetUser(managerId) + '\n\n' +
    'Закупка «' + meta.shortDesc + '» отправлена на доработку по результатам согласования.\n' +
    (reworkComment ? '[B]Комментарий:[/B] ' + reworkComment + '\n' : '') +
    'Необходимо скорректировать данные и отправить на согласование повторно.';
  const links = [
    { text: '🔧 Исправить данные', url: buildAppLink('fill', item.id, 'inbox') }
  ].filter(l => l.url);
  notifyUserViaBot(managerId, title, message, links, function (success) {
    if (!success) {
      BX24.callMethod('im.notify', {
        to: managerId, message: title + '\n' + message, type: 'SYSTEM',
        link: links[0] ? links[0].url : '', button_text: links[0] ? links[0].text : ''
      }, function (r) {
        if (r.error()) logAction('im.notify (ID ' + managerId + ') не прошёл: ' + getApiErrorMessage(r), 'error');
      });
    }
  });
}

// ✅ Уведомление менеджеру после согласования/отклонения (обращение к менеджеру)
function notifyAfterDecision(managerId, item, approved) {
  managerId = parseInt(managerId);
  if (!managerId || !item) return;
  const meta = buildPurchaseMeta(item);
  const amount = item[actualFields.amountProduct] ? parseFloat(item[actualFields.amountProduct]).toLocaleString('ru-RU') + ' ₽' : 'не указана';
  const title = approved ? 'Условия согласованы' : 'Закупка отклонена';
  const message = greetUser(managerId) + '\n\n' + (approved
    ? 'Условия по закупке «' + meta.shortDesc + '» (сумма ' + amount + ') согласованы.\nНеобходимо загрузить входящий счёт.'
    : 'Закупка «' + meta.shortDesc + '» отклонена на этапе согласования.\nТребуется корректировка.');
  const links = [
    { text: approved ? '📄 Загрузить счёт' : '📋 Открыть закупку', url: buildAppLink(approved ? 'upload' : 'view', item.id, 'inbox') }
  ].filter(l => l.url);

  notifyUserViaBot(managerId, title, message, links, function (success) {
    if (!success) {
      BX24.callMethod('im.notify', {
        to: managerId, message: title + '\n' + message, type: 'SYSTEM',
        link: links[0] ? links[0].url : '', button_text: links[0] ? links[0].text : ''
      }, function (r) {
        if (r.error()) logAction('im.notify (ID ' + managerId + ') не прошёл: ' + getApiErrorMessage(r), 'error');
      });
    }
  });
}

function sendNotificationWithMessage(userId, title, message, itemUrl, taskUrl, linkText = 'Начать выполнение') {
  userId = parseInt(userId);
  if (!userId) return;
  const domain = getPortalDomain();
  let itemId = '';
  if (itemUrl) { const m = String(itemUrl).match(/[?&]id=(\d+)/); if (m) itemId = m[1]; }
  let fullItemUrl = '';
  if (itemId) fullItemUrl = buildAppLink('view', itemId, 'inbox');
  else if (itemUrl && domain) fullItemUrl = itemUrl.startsWith('http') ? itemUrl : domain + itemUrl;
  let fullTaskUrl = '';
  if (taskUrl) {
    if (taskUrl.startsWith('http')) fullTaskUrl = taskUrl;
    else if (domain) fullTaskUrl = domain + taskUrl;
    else fullTaskUrl = '';
  }
  const links = [
    fullItemUrl ? { text: '📋 Открыть закупку', url: fullItemUrl } : null,
    fullTaskUrl ? { text: '✅ ' + linkText, url: fullTaskUrl } : null
  ].filter(function (l) { return l && l.url; });
  notifyUserViaBot(userId, title, message, links, function (success) {
    if (!success) {
      logAction('Fallback: отправка через im.notify', 'info');
      let notifyText = title + '\n' + message;
      if (fullTaskUrl) notifyText += '\n[url=' + fullTaskUrl + ']' + linkText + '[/url]';
      else if (fullItemUrl) notifyText += '\n[url=' + fullItemUrl + ']Открыть закупку[/url]';
      BX24.callMethod('im.notify', {
        to: userId, message: notifyText, type: 'SYSTEM',
        link: fullTaskUrl || fullItemUrl || '', button_text: (fullTaskUrl || fullItemUrl) ? 'Открыть' : ''
      }, function (r) {
        if (r.error()) logAction('im.notify (ID ' + userId + ') не прошёл: ' + getApiErrorMessage(r), 'error');
      });
    }
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

function delegatePurchase(itemId, toUserId, note, cb) {
  itemId = parseInt(itemId);
  toUserId = parseInt(toUserId);
  if (!itemId || !toUserId) { logAction('delegatePurchase: invalid args', 'error'); if (cb) cb(false); return; }
  const item = items.find(i => i.id === itemId);
  if (!item) { logAction('delegatePurchase: закупка не найдена', 'error'); if (cb) cb(false); return; }
  if (isUserUnavailable(toUserId)) {
    logAction('delegatePurchase: получатель недоступен', 'error');
    showToast('Получатель отмечен как недоступный (отпуск/больничный)', 'error');
    if (cb) cb(false); return;
  }
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
  logAction(`Делегирование закупки ID ${itemId}: ${fromName} → ${toName} (делегировал ${actorName})`, 'info');
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: itemId, fields: updFields }, function (res) {
    if (res.error()) {
      logAction('Ошибка делегирования: ' + getApiErrorMessage(res), 'error');
      showToast('Ошибка делегирования: ' + getApiErrorMessage(res), 'error');
      if (cb) cb(false); return;
    }
    item[actualFields.manager] = [String(toUserId)];
    if (histField) item[histField] = newHist;
    delegateHistory[itemId] = newHist;
    try { localStorage.setItem('purchase_delegate_history_1088', JSON.stringify(delegateHistory)); } catch (e) {}
    const taskSborId = item[actualFields.taskSbor];
    const afterTask = function () {
      try {
        const meta = buildPurchaseMeta(item);
        const title = 'Закупка делегирована вам: №' + meta.no + ' от ' + meta.dateStr;
        const message = greetUser(toUserId) + '\n\n' + formatPurchaseBody(meta) + '\n\nДелегировал: ' + (fromName || '—') + (actorName && actorName !== fromName ? (' (от имени ' + actorName + ')') : '') + (note ? ('\nПричина: ' + note) : '');
        const links = [{ text: '📝 Заполнить данные', url: buildAppLink('fill', item.id, 'inbox') }].filter(l => l.url);
        notifyUserViaBot(toUserId, title, message, links, function (ok) { if (!ok) sendBotNotification(toUserId, title, message, links); });
      } catch (e) { logAction('Ошибка уведомления о делегировании: ' + e.message, 'error'); }
      logAction('Делегирование выполнено', 'success');
      showToast('Закупка делегирована: ' + toName, 'success');
      loadAllData();
      if (cb) cb(true);
    };
    if (taskSborId && String(taskSborId).match(/^\d+$/)) {
      BX24.callMethod('tasks.task.update', { taskId: parseInt(taskSborId), fieldsToSave: { RESPONSIBLE_ID: toUserId } }, function (tr) {
        if (tr.error()) logAction('Ошибка переназначения задачи сбора: ' + getApiErrorMessage(tr), 'error');
        else logAction('Задача сбора переназначена на ' + toName, 'success');
        afterTask();
      });
    } else { afterTask(); }
  });
}

function deletePurchaseWithCleanup(id, done) {
  id = parseInt(id);
  if (!id) { logAction('[ОЧИСТКА] invalid id', 'error'); if (done) done(false); return; }
  if (deleteInProgress[id]) { logAction('[ОЧИСТКА] закупка ID ' + id + ' уже удаляется — повторный вызов пропущен', 'info'); return; }
  deleteInProgress[id] = true;
  const item = items.find(function (i) { return i.id === id; });
  if (!item) { logAction('[ОЧИСТКА] закупка ID ' + id + ' не найдена', 'error'); deleteInProgress[id] = false; if (done) done(false); return; }
  logAction('[ОЧИСТКА] начало: закупка ID ' + id, 'info');
  var tasksToDelete = [];
  if (actualFields.taskVyborSotr && item[actualFields.taskVyborSotr]) { var tvs = String(item[actualFields.taskVyborSotr]); if (/^\d+$/.test(tvs)) tasksToDelete.push(parseInt(tvs)); }
  if (actualFields.taskSbor && item[actualFields.taskSbor]) { var tsb = String(item[actualFields.taskSbor]); if (/^\d+$/.test(tsb)) tasksToDelete.push(parseInt(tsb)); }
  if (actualFields.taskZagruz && item[actualFields.taskZagruz]) { var tzg = String(item[actualFields.taskZagruz]); if (/^\d+$/.test(tzg)) tasksToDelete.push(parseInt(tzg)); }
  logAction('[ОЧИСТКА] задач к удалению: ' + tasksToDelete.length + (tasksToDelete.length ? ' [' + tasksToDelete.join(', ') + ']' : ''), 'info');
  var prepSteps = 0;
  if (tasksToDelete.length > 0) prepSteps++;
  if (INVOICE_ENTITY_ID) prepSteps++;
  var completed = 0;
  function finalizeDelete() {
    logAction('[ОЧИСТКА] все подготовительные шаги готовы → вызываю crm.item.delete для ID ' + id, 'info');
    BX24.callMethod('crm.item.delete', { entityTypeId: ENTITY_TYPE_ID, id: id }, function (res) {
      deleteInProgress[id] = false;
      if (res.error()) { logAction('[ОЧИСТКА] crm.item.delete: ОШИБКА — ' + getApiErrorMessage(res), 'error'); if (done) done(false); }
      else { logAction('[ОЧИСТКА] crm.item.delete: успех, закупка ID ' + id + ' удалена', 'success'); items = items.filter(function (i) { return i.id !== id; }); render(); if (done) done(true); }
    });
  }
  function stepDone(ok, msg) {
    completed++;
    logAction('[ОЧИСТКА] шаг ' + completed + '/' + prepSteps + ' завершён (' + (ok ? 'ok' : 'err') + '): ' + msg, ok ? 'info' : 'error');
    if (completed >= prepSteps) finalizeDelete();
  }
  if (prepSteps === 0) { logAction('[ОЧИСТКА] нет подготовительных шагов → сразу удаляю закупку', 'info'); finalizeDelete(); return; }
  if (tasksToDelete.length > 0) {
    logAction('[ОЧИСТКА] шаг задач: вызов batch tasks.task.delete', 'info');
    var taskBatch = {};
    tasksToDelete.forEach(function (tid, idx) { taskBatch['t' + idx] = ['tasks.task.delete', { taskId: tid }]; });
    BX24.callBatch(taskBatch, function (res) {
      var allOk = true;
      tasksToDelete.forEach(function (tid, idx) {
        var r = res['t' + idx];
        if (r && r.error && r.error()) {
          var errStr = getApiErrorMessage(r);
          if (/UNKNOWN/i.test(errStr)) logAction('[ОЧИСТКА] задача ' + tid + ' уже удалена (UNKNOWN) — ок', 'info');
          else { logAction('[ОЧИСТКА] ошибка удаления задачи ' + tid + ': ' + errStr, 'error'); allOk = false; }
        } else logAction('[ОЧИСТКА] задача ' + tid + ' удалена', 'success');
      });
      stepDone(allOk, 'Задачи: ' + tasksToDelete.join(', '));
    });
  }
  if (INVOICE_ENTITY_ID) {
    logAction('[ОЧИСТКА] шаг счетов: вызов crm.item.list для entityTypeId ' + INVOICE_ENTITY_ID, 'info');
    BX24.callMethod('crm.item.list', { entityTypeId: INVOICE_ENTITY_ID, filter: { title: '%№' + id + '%' }, select: ['id', 'title'] }, function (res) {
      if (res.error()) { logAction('[ОЧИСТКА] шаг счетов: ошибка поиска — ' + getApiErrorMessage(res), 'error'); stepDone(false, 'Ошибка поиска входящих счетов'); return; }
      var invItems = res.data().items || [];
      logAction('[ОЧИСТКА] шаг счетов: найдено ' + invItems.length + ' связанных', 'info');
      if (invItems.length === 0) { stepDone(true, 'Нет связанных входящих счетов'); return; }
      var invBatch = {};
      invItems.forEach(function (inv, idx) { invBatch['i' + idx] = ['crm.item.delete', { entityTypeId: INVOICE_ENTITY_ID, id: inv.id }]; });
      logAction('[ОЧИСТКА] шаг счетов: вызов batch crm.item.delete на ' + invItems.length + ' шт.', 'info');
      BX24.callBatch(invBatch, function (invRes) {
        var allOk = true;
        invItems.forEach(function (inv, idx) {
          var r = invRes['i' + idx];
          if (r && r.error && r.error()) {
            var errStr = getApiErrorMessage(r);
            if (/UNKNOWN/i.test(errStr)) logAction('[ОЧИСТКА] входящий счет ' + inv.id + ' уже удалён (UNKNOWN) — ок', 'info');
            else { logAction('[ОЧИСТКА] ошибка удаления входящего счета ' + inv.id + ': ' + errStr, 'error'); allOk = false; }
          } else logAction('[ОЧИСТКА] входящий счет ' + inv.id + ' (' + inv.title + ') удалён', 'success');
        });
        stepDone(allOk, 'Входящие счета удалены: ' + invItems.length + ' шт.');
      });
    });
  }
}

function loadAllData() {
  if (!b24Ready) { logAction('loadAllData вызван до инициализации BX24 — пропуск (ждём init)', 'info'); return; }
  if (loadAllDataInProgress) { logAction('Загрузка уже идёт, пропускаем повторный вызов', 'info'); return; }
  loadAllDataInProgress = true;
  logAction('Загрузка списка закупок...', 'info');
  if (items.length === 0) document.getElementById('app-container').innerHTML = '<div class="loading" style="grid-column: 1/-1;">Загрузка данных...</div>';
  BX24.callMethod('crm.item.list', { entityTypeId: ENTITY_TYPE_ID, select: ['*', 'UF_*'] }, function (res) {
    loadAllDataInProgress = false;
    if (res.error()) {
      logAction('Ошибка загрузки данных: ' + getApiErrorMessage(res), 'error');
      document.getElementById('app-container').innerHTML = '<div class="error-box">Ошибка загрузки: ' + getApiErrorMessage(res) + '</div>';
      return;
    }
    items = res.data().items || [];
    logAction('Данные загружены. Всего записей: ' + items.length, 'success');
    syncManagersFromTasks(function () { render(); handleUrlParams(); });
  });
}

function changeScenario(val) {
  currentScenario = val;
  localStorage.setItem('purchase_scenario', val);
  logAction('Сценарий изменён: ' + val, 'info');
  var labels = { none: 'Обычный тест', full: 'Полный проход (все роли)', upload: 'Тест загрузки счёта', approval: 'Тест согласования' };
  showToast('Сценарий: ' + (labels[val] || val));
}

function runScenarioAfterCreate(itemId) {
  if (!isTestMode || currentScenario === 'none') return;
  if (scenarioRunning[itemId]) return;
  scenarioRunning[itemId] = true;
  var item = items.find(function (i) { return i.id === itemId; });
  if (!item) return;
  logAction('Запуск сценария "' + currentScenario + '" для закупки ID ' + itemId + '...', 'info');
  var secDef = fieldDefs[actualFields.section];
  var dirDef = fieldDefs[actualFields.direction];
  var firstSec = secDef && secDef.items && secDef.items.length > 0 ? secDef.items[0].ID : null;
  var firstDir = dirDef && dirDef.items && dirDef.items.length > 0 ? dirDef.items[0].ID : null;
  var secText = firstSec && secDef ? (secDef.items.find(function (i) { return String(i.ID) === String(firstSec); }) || {}).VALUE : '';
  var dirText = firstDir && dirDef ? (dirDef.items.find(function (i) { return String(i.ID) === String(firstDir); }) || {}).VALUE : '';
  var combinedText = (secText && dirText) ? (secText + ' / ' + dirText) : secText;
  var targetStageName = '';
  if (currentScenario === 'upload') targetStageName = 'загрузка';
  else if (currentScenario === 'approval') targetStageName = 'согласование';
  else if (currentScenario === 'full') targetStageName = 'сбор данных';
  var targetStageId = getStageIdByName(targetStageName);
  if (!targetStageId) { logAction('Не найдена стадия "' + targetStageName + '" для сценария', 'error'); return; }
  var fields = { stageId: targetStageId };
  if (actualFields.manager && fieldDefs[actualFields.manager]) fields[actualFields.manager] = [String(currentUser.ID)];
  if (actualFields.deptHead && fieldDefs[actualFields.deptHead]) fields[actualFields.deptHead] = [String(currentUser.ID)];
  if (currentScenario === 'upload' || currentScenario === 'approval') {
    if (firstSec) fields[actualFields.section] = firstSec;
    if (firstDir) fields[actualFields.direction] = firstDir;
    if (combinedText && actualFields.combinedDir) fields[actualFields.combinedDir] = combinedText;
    if (!item[actualFields.amountProduct] || parseFloat(item[actualFields.amountProduct]) === 0) fields[actualFields.amountProduct] = 10000;
  }
  logAction('Автопроход до стадии "' + targetStageName + '" (ID: ' + targetStageId + ')...', 'info');
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(itemId), fields: fields }, function (res) {
    if (res.error()) logAction('Ошибка автопрохода сценария: ' + getApiErrorMessage(res), 'error');
    else { logAction('Сценарий "' + currentScenario + '" выполнен', 'success'); showToast('Сценарий: закупка на стадии "' + targetStageName + '"'); loadAllData(); }
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
  logAction('Проверяем соисполнителей задач для ' + need.length + ' закупки(ок)...', 'info');
  var batch = {};
  need.forEach(function (i) { batch['t' + i.id] = ['tasks.task.get', { taskId: parseInt(i[actualFields.taskVyborSotr]) }]; });
  BX24.callBatch(batch, function (res) {
    logAction('Ответ batch получен. Тип: ' + (Array.isArray(res) ? 'массив' : 'объект') + ', ключей: ' + Object.keys(res).length, 'info');
    var found = [];
    need.forEach(function (i, idx) {
      var r = (res['t' + i.id]) || (Array.isArray(res) ? res[idx] : null);
      if (!r) { logAction('Batch: нет ответа по ключу t' + i.id + ' (закупка ID ' + i.id + ')', 'error'); syncManagersInProgress[i.id] = false; return; }
      if (r.error && r.error()) { logAction('Не удалось получить задачу для закупки ID ' + i.id + ': ' + getApiErrorMessage(r), 'error'); syncManagersInProgress[i.id] = false; return; }
      var taskData = r.data();
      var task = (taskData && taskData.task) || taskData || {};
      var accomplices = task.accomplices || [];
      var status = task.status;
      var responsibleId = task.responsibleId;
      logAction('Задача ' + i[actualFields.taskVyborSotr] + ' (закупка ' + i.id + '): accomplices=' + JSON.stringify(accomplices) + ', status=' + status + ', responsibleId=' + responsibleId, 'info');
      var isCompleted = String(status) === '5';
      if (accomplices.length > 0) found.push({ item: i, mgrId: String(accomplices[0]) });
      else if (isCompleted && responsibleId) { logAction('Задача завершена без соисполнителей — используем ответственного ' + responsibleId, 'info'); found.push({ item: i, mgrId: String(responsibleId) }); }
      else syncManagersInProgress[i.id] = false;
    });
    if (found.length === 0) { done(); return; }
    var pending = found.length;
    var finish = function (itemId) { syncManagersInProgress[itemId] = false; pending--; if (pending === 0) done(); };
    found.forEach(function (f) {
      if (isUserUnavailable(f.mgrId)) {
        logAction('Исполнитель ' + (userNames[f.mgrId] || f.mgrId) + ' недоступен (отпуск/больничный) — делегируйте вручную', 'error');
        try {
          const headId = resolveDeptHeadId(f.item, true);
          if (headId) {
            const meta = buildPurchaseMeta(f.item);
            sendBotNotification(headId, 'Исполнитель недоступен', greetUser(headId) + '\n\nВыбранный исполнитель ' + (userNames[f.mgrId] || f.mgrId) + ' недоступен (отпуск/больничный). Делегируйте закупку №' + meta.no + ' другому сотруднику отдела.', [{ text: '📋 Открыть закупку', url: buildAppLink('view', f.item.id, 'my_requests') }].filter(l => l.url));
          }
        } catch (e) { logAction('Ошибка уведомления о недоступности: ' + e.message, 'error'); }
        finish(f.item.id);
        return;
      }
      var sborStageId = getStageIdByName('сбор данных');
      var updFields = {};
      updFields[actualFields.manager] = [f.mgrId];
      if (sborStageId) updFields.stageId = sborStageId;
      logAction('Запись менеджера ' + (userNames[f.mgrId] || f.mgrId) + ' в закупку ID ' + f.item.id + ', поля: ' + JSON.stringify(updFields), 'info');
      BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(f.item.id), fields: updFields }, function (r2) {
        if (r2.error()) { logAction('Ошибка записи менеджера для ID ' + f.item.id + ': ' + getApiErrorMessage(r2), 'error'); finish(f.item.id); return; }
        f.item[actualFields.manager] = [f.mgrId];
        if (sborStageId) f.item.stageId = sborStageId;
        logAction('Менеджер ' + (userNames[f.mgrId] || f.mgrId) + ' записан в закупку ID ' + f.item.id, 'success');
        if (sborStageId) logAction('Стадия изменена на "Сбор данных" (ID: ' + sborStageId + ')', 'success');
        if (!f.item[actualFields.taskSbor]) {
          var shortDescText = cleanText(f.item[actualFields.shortDesc]) || f.item.title;
          var headId = resolveDeptHeadId(f.item, true);
          var createdBy = parseInt(systemUserId) || 1;
          var taskPayload = {
            TITLE: '[🛒] Сбор данных и расчет по закупке',
            RESPONSIBLE_ID: parseInt(f.mgrId),
            CREATED_BY: createdBy,
            DESCRIPTION: 'Необходимо собрать данные и рассчитать стоимость по закупке "' + shortDescText + '".',
            STATUS: 2,
            ADD_IN_REPORT: 'Y'
          };
          if (headId) taskPayload.OBSERVERS = [headId];
          BX24.callMethod('tasks.task.add', { fields: taskPayload }, function (tr) {
            if (!tr.error()) {
              var newTaskId = tr.data().task.id;
              logAction('Задача менеджеру создана (ID: ' + newTaskId + '), постановщик: админ ' + createdBy + ', наблюдатель: ' + (headId || 'нет'), 'success');
              try { notifyCollectData(parseInt(f.mgrId), f.item); } catch (e) { logAction('Ошибка при отправке уведомления менеджеру: ' + e.message, 'error'); }
              BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(f.item.id), fields: { [actualFields.taskSbor]: String(newTaskId) } }, function () {
                f.item[actualFields.taskSbor] = String(newTaskId);
                finish(f.item.id);
              });
            } else { logAction('Ошибка создания задачи менеджеру: ' + getApiErrorMessage(tr), 'error'); finish(f.item.id); }
          });
        } else { finish(f.item.id); }
      });
    });
  }, function () {
    need.forEach(function (i) { syncManagersInProgress[i.id] = false; });
    done();
  });
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
    var maxAttempts = 20;
    var checkItemsInterval = setInterval(function () {
      attempts++;
      if (items.length > 0 || attempts >= maxAttempts) {
        clearInterval(checkItemsInterval);
        if (items.length > 0) {
          var id = parseInt(itemId);
          if (tab) {
            try { if (typeof switchTab === 'function') switchTab(tab); }
            catch (e) { logAction('switchTab(' + tab + ') не выполнен: ' + e.message, 'error'); }
          }
          if (action === 'fill') openDataModal(id);
          else if (action === 'upload') openUploadModal(id);
          else if (action === 'approve') openActionModal(id, 'approve_terms');
          else if (action === 'reject') openActionModal(id, 'reject_terms');
          else if (action === 'rework') openActionModal(id, 'send_to_rework');
          else openViewModal(id);
          try {
            var newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({ path: newUrl }, '', newUrl);
          } catch (e) {}
        } else showToast('Не удалось загрузить данные для автоматического перехода.', 'error');
      }
    }, 500);
  }
}

function getIncomingParams() {
  try {
    if (typeof BX24 !== 'undefined' && BX24.placement && typeof BX24.placement.info === 'function') {
      const info = BX24.placement.info();
      const o = (info && info.options) || {};
      if (o.id) return { action: o.action || 'view', itemId: o.id, tab: o.tab || '' };
    }
  } catch (e) {}
  try {
    const up = new URLSearchParams(window.location.search);
    if (up.get('id')) return { action: up.get('action') || 'view', itemId: up.get('id'), tab: up.get('tab') || '' };
  } catch (e) {}
  try {
    const h = (window.location.hash || '').replace(/^#/, '');
    if (h) {
      const hp = new URLSearchParams(h);
      if (hp.get('id')) return { action: hp.get('action') || 'view', itemId: hp.get('id'), tab: hp.get('tab') || '' };
    }
  } catch (e) {}
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
  for (var i = currentIndex + 1; i < spStagesSorted.length; i++) {
    var stName = spStagesSorted[i].name.toLowerCase().replace(/ё/g, 'е');
    if (!stName.includes('успех') && !stName.includes('провал') && !stName.includes('отмен')) return spStagesSorted[i].id;
  }
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
    logAction('Возврат во вкладку приложения — автообновление данных...', 'info');
    loadAllData();
  };
  window.addEventListener('focus', tryReload);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') tryReload();
  });
})();