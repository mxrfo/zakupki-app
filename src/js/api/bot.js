// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2, режим fetch)
// ============================================================
// Надёжный путь доставки: диалог создаётся СРАЗУ с получателем
// (imbot.v2.Chat.add fields.userIds:[userId]) — пользователь гарантированно
// участник, и imbot.v2.Chat.Message.send (fields:{message,keyboard}) доносит.
// НЕ используется imbot.v2.Chat.user.add (404 ERROR_METHOD_NOT_FOUND).
// НЕ используется im.notify (только чат).
const BOT_CODE = 'purchase_app_bot';
const BOT_NAME = 'Альтернатива · Закупки';
const GROUP_CHAT_TITLE = 'Закупки · Альтернатива';

var lastBotStatus = { botId: '', chatId: '', result: '', ts: 0 };

function callIfFn(v) {
  if (typeof v === 'function') { try { return v(); } catch (e) { return ''; } }
  return v;
}

function describeError(res) {
  try {
    const e = res.error();
    let code = 'UNKNOWN', desc = '';
    if (typeof e === 'string') { code = e; }
    else if (typeof e === 'function') { code = callIfFn(e) || 'UNKNOWN'; }
    else if (e && typeof e === 'object') {
      code = callIfFn(e.error) || callIfFn(e.code) || 'UNKNOWN';
      desc = callIfFn(e.error_description) || callIfFn(e.description) || '';
    }
    if (!desc) desc = callIfFn(res.error_description) || '';
    if (typeof desc === 'function') desc = callIfFn(desc) || '';
    return 'Код ошибки: ' + code + (desc ? ' | ' + desc : '');
  } catch (_) { return 'Код ошибки: UNKNOWN'; }
}

function getBotHandlerUrl() {
  const saved = (settings.botHandler || '').trim();
  if (saved) return saved;
  return window.location.href.split('?')[0].split('#')[0];
}

function hashStr(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) { h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0; }
  return 'h' + (h >>> 0);
}

function dedupePass(key) {
  if (!key) return false;
  const k = 'b24_dk_' + key;
  const prev = parseInt(localStorage.getItem(k) || '0');
  const now = Date.now();
  if (now - prev < 10 * 60 * 1000) { logAction('Дубль уведомления ' + key + ' пропущен', 'info'); return true; }
  localStorage.setItem(k, String(now));
  return false;
}

function extractBotId(b) {
  if (!b) return null;
  const id = b.ID || b.id || (b.bot && (b.bot.ID || b.bot.id)) || b.botId || (b.bot && b.bot.BOT_ID);
  return id ? parseInt(id) : null;
}

function extractDialogId(d) {
  if (!d) return null;
  const chatData = d.chat || d;
  return chatData.dialogId || chatData.id || d.dialogId || d.CHAT_ID || d.id || null;
}

/* ================= РЕГИСТРАЦИЯ / ПОИСК БОТА ================= */
let botInFlight = false;
let botQueue = [];
function drainBotQueue(id) { const q = botQueue.slice(); botQueue = []; q.forEach(function (cb) { cb(id); }); }

// fields + camelCase + eventMode:fetch + properties (как в работавшем коммите)
function registerBotNew(cb) {
  const handler = getBotHandlerUrl();
  logAction('Регистрация бота (v2)... handler=' + handler, 'info');
  BX24.callMethod('imbot.v2.Bot.register', {
    fields: {
      code: BOT_CODE,
      type: 'bot',
      eventMode: 'fetch',
      handler: handler,
      properties: { name: BOT_NAME, workPosition: 'Система уведомлений по закупкам' }
    }
  }, (res) => {
    if (res.error()) {
      const errStr = describeError(res);
      logAction('Ошибка регистрации (v2): ' + errStr, 'error');
      if (/NO_AUTH|auth/i.test(errStr)) {
        logAction('❌ Портал запрещает создавать бота: проверьте право "Чат-боты (imbot)" и ПЕРЕСОХРАНИТЕ карточку приложения (токен перегенерируется).', 'error');
      }
      registerBotV1(cb);
      return;
    }
    const botId = extractBotId(res.data());
    if (!botId) { logAction('Не удалось извлечь ID из ответа: ' + JSON.stringify(res.data()), 'error'); return cb(null); }
    localStorage.setItem('b24_bot_id', botId);
    settings.botId = String(botId);
    lastBotStatus.botId = botId;
    saveSettingsToBoth();
    logAction('Бот зарегистрирован (v2), ID: ' + botId, 'success');
    cb(botId);
  });
}

function registerBotV1(cb) {
  logAction('Резервная регистрация (v1)...', 'info');
  BX24.callMethod('imbot.register', {
    CODE: BOT_CODE, TYPE: 'bot', NAME: BOT_NAME,
    FIRST_NAME: 'Альтернатива', LAST_NAME: 'Бот', EVENT_HANDLER: getBotHandlerUrl()
  }, (resV1) => {
    if (resV1.error()) { logAction('Ошибка регистрации (v1): ' + describeError(resV1), 'error'); cb(null); return; }
    const botIdV1 = resV1.data().user_id;
    localStorage.setItem('b24_bot_id', botIdV1);
    settings.botId = String(botIdV1);
    lastBotStatus.botId = botIdV1;
    saveSettingsToBoth();
    logAction('Бот зарегистрирован (v1), ID: ' + botIdV1, 'success');
    cb(botIdV1);
  });
}

function findBotViaList(done) {
  BX24.callMethod('imbot.v2.Bot.list', { fields: {} }, function (res) {
    if (res.error()) { logAction('imbot.v2.Bot.list: ' + describeError(res), 'info'); return done(null); }
    const d = res.data();
    const arr = (d && (d.result || d)) || [];
    const list = Array.isArray(arr) ? arr : [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const code = String(callIfFn(b.CODE) || callIfFn(b.code) || (b.properties && callIfFn(b.properties.code)) || '');
      if (code === String(BOT_CODE)) { const id = extractBotId(b); if (id) return done(id); }
    }
    done(null);
  });
}

function getBotId(cb) {
  const manual = (settings.botId || '').trim();
  if (manual) { const id = parseInt(manual); if (id) { localStorage.setItem('b24_bot_id', id); lastBotStatus.botId = id; logAction('Использую ручной ID бота из настроек: ' + id, 'info'); return cb(id); } }
  const cachedBotId = localStorage.getItem('b24_bot_id');
  if (cachedBotId) { lastBotStatus.botId = parseInt(cachedBotId); return cb(parseInt(cachedBotId)); }

  if (botInFlight) { logAction('Бот уже создаётся — в очередь', 'info'); botQueue.push(cb); return; }
  botInFlight = true;
  logAction('Поиск существующего бота (код: ' + BOT_CODE + ')...', 'info');
  findBotViaList(function (id) {
    if (id) {
      localStorage.setItem('b24_bot_id', id);
      settings.botId = String(id);
      lastBotStatus.botId = id;
      saveSettingsToBoth();
      logAction('Найден бот через imbot.v2.Bot.list, ID: ' + id, 'success');
      botInFlight = false; cb(id); drainBotQueue(id); return;
    }
    registerBotNew(function (newId) { botInFlight = false; cb(newId); drainBotQueue(newId); });
  });
}

function forceCreateBot(cb) {
  cb = cb || function () {};
  logAction('Принудительная регистрация бота...', 'info');
  localStorage.removeItem('b24_bot_id');
  registerBotNew(function (botId) {
    if (botId) { lastBotStatus.botId = botId; logAction('Бот создан, ID: ' + botId, 'success'); showToast('Бот создан, ID: ' + botId, 'success'); }
    else showToast('Не удалось создать бота — см. логи (права imbot?)', 'error');
    cb(botId);
  });
}

function openBotAdminPage() {
  const domain = getPortalDomain();
  if (domain) window.open(domain + '/crm/company/bot/', '_blank');
  else showToast('Не удалось определить адрес портала', 'error');
}

/* ================= ДИАЛОГ + ОТПРАВКА ================= */
function buildKeyboard(links) {
  const btns = (links || []).filter(function (l) { return l && l.url; }).map(function (l) {
    return { TEXT: l.text, LINK: l.url, BG_COLOR_TOKEN: 'primary' };
  });
  return btns.length ? [btns] : [];
}

function botSendToGroup(botId, chatId, title, message, links, cb) {
  BX24.callMethod('imbot.v2.Chat.Message.send', {
    botId: botId,
    dialogId: chatId,
    fields: { message: '[B]' + title + '[/B]\n' + message, keyboard: buildKeyboard(links) }
  }, (res) => {
    if (res.error()) { logAction('Ошибка отправки в чат ' + chatId + ': ' + describeError(res), 'error'); lastBotStatus.result = 'send fail'; lastBotStatus.ts = Date.now(); if (cb) cb(false); return; }
    logAction('Сообщение отправлено в чат ' + chatId, 'success');
    lastBotStatus.result = 'ok @ ' + chatId; lastBotStatus.ts = Date.now();
    if (cb) cb(true);
  });
}

// ✅ Диалог создаётся СРАЗУ с получателем. Кэш dialogId по userId.
function getDialogForUser(botId, userId, cb) {
  const key = 'b24_bot_chat_' + userId;
  const cached = localStorage.getItem(key);
  if (cached) { lastBotStatus.chatId = cached; return cb(cached); }
  const userName = (typeof userNames !== 'undefined' && userNames[userId]) ? userNames[userId] : ('Пользователь ' + userId);
  logAction('Создание диалога с пользователем ' + userId + ' (userIds:[' + userId + '])...', 'info');
  BX24.callMethod('imbot.v2.Chat.add', {
    botId: botId,
    fields: { title: 'Закупки · ' + userName, userIds: [parseInt(userId)] }
  }, (res) => {
    if (res.error()) { logAction('Ошибка imbot.v2.Chat.add: ' + describeError(res), 'error'); return cb(null); }
    const dialogId = extractDialogId(res.data());
    if (!dialogId) { logAction('Не удалось извлечь dialogId: ' + JSON.stringify(res.data()), 'error'); return cb(null); }
    localStorage.setItem(key, dialogId);
    lastBotStatus.chatId = dialogId;
    logAction('Диалог создан, ID: ' + dialogId, 'success');
    cb(dialogId);
  });
}

// ✅ Основной поток: бот → диалог с получателем → отправка. Без Chat.user.add, без im.notify.
function notifyUserViaBot(userId, title, message, links, cb, dedupeBase) {
  const fullKey = dedupeBase ? (dedupeBase + '_' + hashStr(message)) : '';
  if (dedupePass(fullKey)) { if (cb) cb(true); return; }
  getBotId(function (botId) {
    if (!botId) { logAction('Не удалось получить ID бота — уведомление пропущено', 'error'); lastBotStatus.result = 'no bot'; lastBotStatus.ts = Date.now(); if (cb) cb(false); return; }
    getDialogForUser(botId, userId, function (dialogId) {
      if (!dialogId) { logAction('Не удалось получить/создать диалог', 'error'); lastBotStatus.result = 'no chat'; lastBotStatus.ts = Date.now(); if (cb) cb(false); return; }
      botSendToGroup(botId, dialogId, title, message, links, function (ok) {
        if (cb) cb(ok);
      });
    });
  });
}

// ✅ Сброс диалогов (используется кнопкой «Сбросить чат бота» в settings.js)
function resetAutoChat() {
  localStorage.removeItem('b24_group_chat_id');
  Object.keys(localStorage).filter(function (k) { return k.indexOf('b24_bot_chat_') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  settings.chatId = '';
  saveSettingsToBoth();
}

// ✅ НЕ удаляем b24_bot_id — бот живёт на портале и переживает обновления архива
function clearBotCache() {
  Object.keys(localStorage).filter(function (k) { return k.indexOf('b24_dk_') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  logAction('Кэш дедупа сброшен (ID бота сохранён)', 'info');
}