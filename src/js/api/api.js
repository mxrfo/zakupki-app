// ============================================================
// МОДУЛЬ: api.js — Обёртки над BX24 API
// ============================================================
let b24Ready = false;
var deleteInProgress = {};
var urlParamsProcessed = false;
var lastHandledItemId = '';

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

function getDeptShort(item) {
  const deptId = String(Array.isArray(item[actualFields.dept]) ? item[actualFields.dept][0] : (item[actualFields.dept] || ''));
  const sn = settings.deptShortNames[deptId];
  if (sn) return sn;
  const d = departments.find(x => String(x.ID) === deptId);
  return d ? d.NAME : '—';
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

function getShortDesc(item) {
  try { return (typeof cleanText === 'function' ? cleanText(item[actualFields.shortDesc]) : (item[actualFields.shortDesc] || '')) || item.title || '—'; } catch (e) { return item.title || '—'; }
}

function getCreatorInfo(item) {
  const creatorRaw = item[actualFields.creator];
  const creatorId = Array.isArray(creatorRaw) ? creatorRaw[0] : creatorRaw;
  const realId = creatorId || item.createdBy;
  return { id: realId, name: (realId && (userNames[realId] || realId)) || '—', dept: (realId && userDepts[realId]) || '—' };
}

function getMgrInfo(item) {
  const mgrId = Array.isArray(item[actualFields.manager]) ? item[actualFields.manager][0] : (item[actualFields.manager] || '');
  const name = mgrId ? (userNames[mgrId] || mgrId) : '—';
  const dept = mgrId ? (userDepts[mgrId] || '—') : '—';
  return { id: mgrId, name, dept };
}

function buildTitle(kind, item) {
  return kind + ' (Закупка отделом ' + getDeptShort(item) + ' №' + item.id + ' от ' + formatCreatedDate(item.createdTime) + ')';
}

// ✅ Личные сообщения: "Сумма за товар" → "Сумма (без доставки)"
function buildBody(item, opts) {
  opts = opts || {};
  const lines = [];
  lines.push('[B]Срок:[/B] ' + formatDeadline(item[actualFields.deadlineZakup]));
  const dir = resolveCombinedDir(item);
  if (dir) lines.push('[B]Раздел/Направление:[/B] ' + dir);
  lines.push('[B]Что нужно закупить (Кратко):[/B] ' + getShortDesc(item));
  if (opts.manager) { const m = getMgrInfo(item); if (m.id) lines.push('[B]Менеджер:[/B] ' + m.name + ' (' + m.dept + ')'); }
  if (opts.creator) { const c = getCreatorInfo(item); lines.push('[B]Кто создал запрос:[/B] ' + c.name + ' (' + c.dept + ')'); }
  if (opts.sum) {
    const product = parseAmount(item[actualFields.amountProduct]) || 0;
    const delivery = parseAmount(item[actualFields.amountDelivery]) || 0;
    const total = product + delivery;
    if (opts.sumSplit) {
      lines.push('[B]Сумма (без доставки):[/B] ' + product.toLocaleString('ru-RU') + ' ₽');
      lines.push('[B]Сумма за доставку:[/B] ' + delivery.toLocaleString('ru-RU') + ' ₽');
      lines.push('[B]ИТОГО:[/B] ' + total.toLocaleString('ru-RU') + ' ₽');
    } else if (total) {
      lines.push('[B]Сумма:[/B] ' + total.toLocaleString('ru-RU') + ' ₽');
    }
  }
  if (opts.comment) { const c = item[actualFields.comment] ? cleanText(item[actualFields.comment]) : ''; if (c) lines.push('[B]Комментарий:[/B] ' + c); }
  if (opts.file) { const f = getFileInfo(item, actualFields.fileInvoice); if (f && f.url) lines.push('[B]Файл для скачки:[/B] [URL=' + f.url + ']' + f.name + '[/URL]'); }
  return lines.join('\n');
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
  notifyUserViaBot(userId, title, message, links, cb, dedupeBase);
}

// ✅ + comment: если комментарий не успел попасть в item, подставляем явно
function notifySelectExecutor(userId, item, taskId, comment) {
  userId = parseInt(userId);
  if (!userId || !item) return;
  const title = buildTitle('Необходимо выбрать исполнителя', item);
  let message = greetUser(userId) + '\n\n' + buildBody(item, { creator: true, sum: true, comment: true });
  if (comment && String(comment).trim() && message.indexOf('[B]Комментарий:[/B]') === -1) {
    message += '\n[B]Комментарий:[/B] ' + cleanText(comment);
  }
  const domain = getPortalDomain();
  const taskLink = taskId ? (domain ? domain + '/company/personal/user/' + userId + '/tasks/task/view/' + taskId + '/' : '') : '';
  const links = [
    { text: '👤 Выбрать исполнителя', url: buildAppLink('select_executor', item.id, 'my_requests') },
    taskLink ? { text: '✅ Открыть задачу', url: taskLink } : null,
    { text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'my_requests') }
  ].filter(function (l) { return l && l.url; });
  sendBotNotification(userId, title, message, links, null, 'select_executor_' + item.id);
}

function notifyCollectData(userId, item) {
  userId = parseInt(userId);
  if (!userId || !item) return;
  const title = buildTitle('Необходимо собрать данные и рассчитать стоимость', item);
  const message = greetUser(userId) + '\n\n' + buildBody(item, { creator: true, sum: true, comment: true });
  const links = [{ text: '📝 Заполнить данные', url: buildAppLink('fill', item.id, 'inbox') }].filter(l => l.url);
  sendBotNotification(userId, title, message, links, null, 'collect_' + item.id);
}

function notifyApprovalNeeded(headId, item) {
  headId = parseInt(headId);
  if (!headId || !item) { logAction('notifyApprovalNeeded: headId не определён', 'error'); return; }
  const title = buildTitle('Согласование условий', item);
  const message = greetUser(headId) + '\n\n' + buildBody(item, { manager: true, creator: true, sum: true, sumSplit: true, comment: true });
  const links = [
    { text: '✅ Согласовать', url: buildAppLink('approve', item.id, 'inbox') },
    { text: '🔧 На доработку', url: buildAppLink('rework', item.id, 'inbox') },
    { text: '❌ Отклонить', url: buildAppLink('reject', item.id, 'inbox') },
    { text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }
  ].filter(l => l.url);
  notifyUserViaBot(headId, title, message, links, null, 'approval_' + item.id);
}

function notifyReworkNeeded(managerId, item, reworkComment) {
  managerId = parseInt(managerId);
  if (!managerId || !item) return;
  const title = buildTitle('Необходимо корректировать данные', item);
  const body = buildBody(item, {});
  const message = greetUser(managerId) + '\n\n' + body + (reworkComment ? '\n[B]Комментарий:[/B] ' + reworkComment : '');
  const links = [{ text: '🔧 Исправить данные', url: buildAppLink('fill', item.id, 'inbox') }].filter(l => l.url);
  notifyUserViaBot(managerId, title, message, links, null, 'rework_' + item.id);
}

function notifyAfterDecision(managerId, item, approved) {
  managerId = parseInt(managerId);
  if (!managerId || !item) return;
  if (approved) {
    const title = buildTitle('Условия согласованы', item);
    const message = greetUser(managerId) + '\n\n' + buildBody(item, { sum: true, sumSplit: true });
    const links = [{ text: '📄 Загрузить счёт', url: buildAppLink('upload', item.id, 'inbox') }].filter(l => l.url);
    notifyUserViaBot(managerId, title, message, links, null, 'decision_' + item.id + '_ok');
  } else {
    const title = buildTitle('Закупка отклонена', item);
    const message = greetUser(managerId) + '\n\n' + buildBody(item, { comment: true });
    const links = [{ text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }].filter(l => l.url);
    notifyUserViaBot(managerId, title, message, links, null, 'decision_' + item.id + '_no');
  }
}

function notifyDataChangedOnApproval(econId, item) {
  econId = parseInt(econId);
  if (!econId || !item) return;
  const title = buildTitle('Изменены данные на этапе согласования', item);
  const message = greetUser(econId) + '\n\n' + buildBody(item, { manager: true, creator: true, sum: true, sumSplit: true, comment: true });
  const links = [
    { text: '✅ Согласовать', url: buildAppLink('approve', item.id, 'inbox') },
    { text: '🔧 На доработку', url: buildAppLink('rework', item.id, 'inbox') },
    { text: '❌ Отклонить', url: buildAppLink('reject', item.id, 'inbox') },
    { text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }
  ].filter(l => l.url);
  notifyUserViaBot(econId, title, message, links, null, 'data_changed_' + item.id + '_' + Date.now());
}

// ✅ "Загружен счёт на оплату" — с полем "Файл для скачки" (file:true)
function notifyInvoiceUploaded(econId, item) {
  econId = parseInt(econId);
  if (!econId || !item) return;
  const title = buildTitle('Загружен счёт на оплату', item);
  const message = greetUser(econId) + '\n\n' + buildBody(item, { sum: true, sumSplit: true, file: true });
  const links = [
    { text: '✅ Утвердить счёт', url: buildAppLink('approve_invoice', item.id, 'inbox') },
    { text: '❌ Отклонить счёт', url: buildAppLink('reject_invoice', item.id, 'inbox') },
    { text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }
  ].filter(l => l.url);
  notifyUserViaBot(econId, title, message, links, null, 'inv_upload_' + item.id);
}

function notifyInvoiceEvent(item, kind) {
  if (!item) return;
  const mgrArr = Array.isArray(item[actualFields.manager]) ? item[actualFields.manager] : (item[actualFields.manager] ? [item[actualFields.manager]] : []);
  const mgrId = mgrArr.length ? parseInt(mgrArr[0]) : null;
  const headId = parseInt(item.createdBy) || null;
  const map = {
    approved: { kind: 'Счёт на оплату утверждён', to: [mgrId], links: [
      { text: '💳 Подтвердить оплату', url: buildAppLink('confirm_payment', item.id, 'inbox') },
      { text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }
    ], body: { sum: true, sumSplit: true, file: true } },
    paid: { kind: 'Счёт на оплату оплачен', to: [mgrId, headId], links: [
      { text: '📦 Подтвердить получение', url: buildAppLink('confirm_receipt', item.id, 'inbox') },
      { text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }
    ], body: { sum: true, sumSplit: true, file: true } },
    rejected: { kind: 'Счёт на оплату отклонён', to: [mgrId], links: [
      { text: '🔧 Исправить данные', url: buildAppLink('fill', item.id, 'inbox') },
      { text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }
    ], body: { comment: true } }
  };
  const info = map[kind];
  if (!info) return;
  const title = buildTitle(info.kind, item);
  const message = buildBody(item, info.body);
  const recipients = [...new Set((info.to || []).filter(Boolean))];
  recipients.forEach(function (uid) {
    notifyUserViaBot(uid, title, greetUser(uid) + '\n\n' + message, info.links, null, 'invoice_' + kind + '_' + item.id);
  });
}

/* ============================================================
   ГРУППОВЫЕ СТАТУСНЫЕ УВЕДОМЛЕНИЯ (только общий чат, без кнопок)
   Отмечается автор запроса, а не исполнитель.
   ============================================================ */
function buildGroupBody(item, opts) {
  opts = opts || {};
  const lines = [];
  if (opts.deadline) lines.push('[B]Срок:[/B] ' + formatDeadline(item[actualFields.deadlineZakup]));
  if (opts.dir) { const dir = resolveCombinedDir(item); if (dir) lines.push('[B]Раздел/Направление:[/B] ' + dir); }
  if (opts.shortDesc) lines.push('[B]Что нужно закупить (Кратко):[/B] ' + getShortDesc(item));
  if (opts.manager) { const m = getMgrInfo(item); if (m.id) lines.push('[B]Менеджер:[/B] ' + m.name + (m.dept && m.dept !== '—' ? ' (' + m.dept + ')' : '')); }
  if (opts.creator) { const c = getCreatorInfo(item); lines.push('[B]Кто создал запрос:[/B] ' + c.name + (c.dept && c.dept !== '—' ? ' (' + c.dept + ')' : '')); }
  const product = parseAmount(item[actualFields.amountProduct]) || 0;
  const delivery = parseAmount(item[actualFields.amountDelivery]) || 0;
  const total = product + delivery;
  if (opts.sumTotal) lines.push('[B]Сумма (с доставкой):[/B] ' + total.toLocaleString('ru-RU') + ' ₽');
  if (opts.sumBreakdown) {
    lines.push('[B]Сумма (без доставки):[/B] ' + product.toLocaleString('ru-RU') + ' ₽');
    lines.push('[B]Сумма за доставку:[/B] ' + delivery.toLocaleString('ru-RU') + ' ₽');
    lines.push('[B]ИТОГО:[/B] ' + total.toLocaleString('ru-RU') + ' ₽');
  }
  return lines.join('\n');
}

const GROUP_STATUS_KINDS = {
  assigned: { title: 'Передано в обработку', body: { deadline: true, dir: true, shortDesc: true, manager: true } },
  sent_to_approval: { title: 'Отправлено на согласование', body: { deadline: true, dir: true, shortDesc: true, manager: true, creator: true, sumTotal: true } },
  approved: { title: 'Согласовано', body: { shortDesc: true, manager: true, creator: true } },
  rejected: { title: 'Отклонено', body: { shortDesc: true, manager: true, creator: true } },
  rework: { title: 'Отправлено на корректировки', body: { shortDesc: true, manager: true, creator: true } },
  invoice_received: { title: 'Счёт на оплату получен, отправлен на утверждение и оплату', body: { deadline: true, dir: true, shortDesc: true, sumBreakdown: true } },
  invoice_paid: { title: 'Счёт оплачен', body: { deadline: true, dir: true, shortDesc: true, sumTotal: true } }
};

function groupStatusNotify(item, kind, dedupeBase) {
  if (!item || !kind) return;
  const conf = GROUP_STATUS_KINDS[kind];
  if (!conf) return;
  try {
    const title = buildTitle(conf.title, item);
    const c = getCreatorInfo(item);
    const message = (c.id ? greetUser(c.id) + '\n\n' : '') + buildGroupBody(item, conf.body);
    const userIds = [];
    if (c.id) userIds.push(parseInt(c.id));
    const m = getMgrInfo(item); if (m.id) userIds.push(parseInt(m.id));
    const h = resolveDeptHeadId(item, false); if (h) userIds.push(parseInt(h));
    const dd = dedupeBase || ('group_' + kind + '_' + item.id + '_' + (item.stageId || '') + '_' + (kind === 'assigned' ? (m.id || '') : ''));
    notifyGroupStatus(title, message, userIds, null, dd);
  } catch (e) { logAction('Ошибка группового статуса "' + kind + '": ' + e.message, 'error'); }
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
        const title = buildTitle('Закупка делегирована вам', item);
        const message = greetUser(toUserId) + '\n\n' + buildBody(item, { creator: true, sum: true, comment: true }) + '\n\nДелегировал: ' + (fromName || '—') + (note ? ('\nПричина: ' + note) : '');
        const links = [{ text: '📝 Заполнить данные', url: buildAppLink('fill', item.id, 'inbox') }].filter(l => l.url);
        notifyUserViaBot(toUserId, title, message, links, function (ok) { if (!ok) sendBotNotification(toUserId, title, message, links); }, 'delegate_' + itemId + '_' + toUserId);
        groupStatusNotify(item, 'assigned', 'group_assigned_' + itemId + '_' + toUserId);
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
  function finalizeDelete() {
    BX24.callMethod('crm.item.delete', { entityTypeId: ENTITY_TYPE_ID, id: id }, function (res) {
      deleteInProgress[id] = false;
      if (res.error()) { logAction('[ОЧИСТКА] ошибка: ' + getApiErrorMessage(res), 'error'); if (done) done(false); }
      else { items = items.filter(function (i) { return i.id !== id; }); render(); if (done) done(true); }
    });
  }
  if (tasksToDelete.length === 0) { finalizeDelete(); return; }
  var taskBatch = {};
  tasksToDelete.forEach(function (tid, idx) { taskBatch['t' + idx] = ['tasks.task.delete', { taskId: tid }]; });
  BX24.callBatch(taskBatch, function (res) {
    tasksToDelete.forEach(function (tid, idx) { var r = res['t' + idx]; if (r && r.error && r.error() && !/UNKNOWN/i.test(getApiErrorMessage(r))) logAction('[ОЧИСТКА] задача ' + tid + ': ' + getApiErrorMessage(r), 'error'); });
    finalizeDelete();
  });
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
  var targetStageName = currentScenario === 'upload' ? 'загрузка' : currentScenario === 'approval' ? 'согласование' : 'сбор данных';
  var targetStageId = getStageIdByName(targetStageName);
  if (!targetStageId) { logAction('Стадия "' + targetStageName + '" не найдена', 'error'); return; }
  var fields = { stageId: targetStageId };
  if (actualFields.manager && fieldDefs[actualFields.manager]) fields[actualFields.manager] = [String(currentUser.ID)];
  if (actualFields.deptHead && fieldDefs[actualFields.deptHead]) fields[actualFields.deptHead] = [String(currentUser.ID)];
  if (currentScenario === 'upload' || currentScenario === 'approval') {
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
        if (headId) sendBotNotification(headId, 'Исполнитель недоступен', greetUser(headId) + '\n\nИсполнитель ' + (userNames[f.mgrId] || f.mgrId) + ' недоступен. Делегируйте закупку №' + f.item.id + '.', [{ text: '📋 Открыть закупку №' + f.item.id, url: buildAppLink('view', f.item.id, 'my_requests') }].filter(l => l.url), null, 'unavail_' + f.item.id);
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
        groupStatusNotify(f.item, 'assigned');
        if (!f.item[actualFields.taskSbor]) {
          var shortDescText = getShortDesc(f.item);
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
  var params = getIncomingParams();
  var itemId = params.itemId;
  var action = params.action;
  var tab = params.tab;
  if (!itemId) return;
  if (String(itemId) === String(lastHandledItemId) && urlParamsProcessed) return;
  lastHandledItemId = itemId;
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
        else if (action === 'approve_invoice') openActionModal(id, 'approve_invoice');
        else if (action === 'reject_invoice') openActionModal(id, 'reject_invoice');
        else if (action === 'confirm_payment') openActionModal(id, 'confirm_payment');
        else if (action === 'confirm_receipt') openActionModal(id, 'confirm_receipt');
        else openViewModal(id);
        try { window.history.replaceState({}, '', window.location.protocol + "//" + window.location.host + window.location.pathname); } catch (e) {}
      } else showToast('Не удалось загрузить данные', 'error');
    }
  }, 500);
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
    handleUrlParams();
  };
  window.addEventListener('focus', tryReload);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') tryReload(); });
})();