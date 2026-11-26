// js/api/core.js — Глобальные переменные и утилиты BX24 API

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

window.getPortalDomain = getPortalDomain;
window.buildAppLink = buildAppLink;
window.formatCreatedDate = formatCreatedDate;
window.formatDeadline = formatDeadline;
window.parseAmount = parseAmount;
window.greetUser = greetUser;
window.getDeptShort = getDeptShort;
window.resolveCombinedDir = resolveCombinedDir;
window.getShortDesc = getShortDesc;
window.getCreatorInfo = getCreatorInfo;
window.getMgrInfo = getMgrInfo;
window.buildTitle = buildTitle;
window.buildBody = buildBody;
window.resolveDeptHeadId = resolveDeptHeadId;
window.sendBotNotification = sendBotNotification;
window.getStageIdByName = getStageIdByName;
window.getNextStageId = getNextStageId;