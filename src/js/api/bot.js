// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2)
// ============================================================
const BOT_CODE = 'purchase_app_bot';
const BOT_NAME = 'Альтернатива · Закупки';
const GROUP_CHAT_TITLE = 'Закупки · Альтернатива';

function callIfFn(v) {
  if (typeof v === 'function') { try { return v(); } catch (e) { return ''; } }
  return v;
}

function describeError(res) {
  try {
    const e = res.error();
    let code = 'UNKNOWN', desc = '';
    if (typeof e === 'string') {
      code = e;
    } else if (typeof e === 'function') {
      code = callIfFn(e) || 'UNKNOWN';
    } else if (e && typeof e === 'object') {
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

/* ================= МЬЮТЕКС СОЗДАНИЯ БОТА ================= */
let botInFlight = false;
let botQueue = [];
function drainBotQueue(id) {
  const q = botQueue.slice(); botQueue = [];
  q.forEach(function (cb) { cb(id); });
}
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
        logAction('❌ Портал не даёт создать бота: у приложения нет права "Чат-боты" (imbot).', 'error');
      }
      registerBotV1(cb);
      return;
    }
    const botId = extractBotId(res.data());
    if (!botId) { logAction('Не удалось извлечь ID из ответа: ' + JSON.stringify(res.data()), 'error'); return cb(null); }
    localStorage.setItem('b24_bot_id', botId);
    settings.botId = String(botId);
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
  if (manual) { const id = parseInt(manual); if (id) { localStorage.setItem('b24_bot_id', id); logAction('Использую ручной ID бота из настроек: ' + id, 'info'); return cb(id); } }
  const cachedBotId = localStorage.getItem('b24_bot_id');
  if (cachedBotId) return cb(parseInt(cachedBotId));

  if (botInFlight) { logAction('Бот уже создаётся — в очередь', 'info'); botQueue.push(cb); return; }
  botInFlight = true;
  logAction('Поиск существующего бота (код: ' + BOT_CODE + ')...', 'info');
  findBotViaList(function (id) {
    if (id) {
      localStorage.setItem('b24_bot_id', id);
      settings.botId = String(id);
      saveSettingsToBoth();
      logAction('Найден бот через imbot.v2.Bot.list, ID: ' + id, 'success');
      botInFlight = false; cb(id); drainBotQueue(id); return;
    }
    registerBotNew(function (newId) {
      botInFlight = false;
      cb(newId);
      drainBotQueue(newId);
    });
  });
}

function forceCreateBot(cb) {
  cb = cb || function () {};
  logAction('Принудительная регистрация бота...', 'info');
  localStorage.removeItem('b24_bot_id');
  registerBotNew(function (botId) {
    if (botId) { logAction('Бот создан, ID: ' + botId, 'success'); showToast('Бот создан, ID: ' + botId, 'success'); }
    else showToast('Не удалось создать бота — см. логи', 'error');
    cb(botId);
  });
}

/* ================= МЬЮТЕКС СОЗДАНИЯ ЧАТА ================= */
let chatInFlight = false;
let chatQueue = [];
function drainChatQueue(id) { const q = chatQueue.slice(); chatQueue = []; q.forEach(function (cb) { cb(id); }); }

function createGroupChat(botId, seedUserId, cb) {
  const users = seedUserId ? [parseInt(seedUserId)] : [];
  logAction('Создание группового чата с ботом (userIds=' + JSON.stringify(users) + ')...', 'info');
  BX24.callMethod('imbot.v2.Chat.add', {
    botId: botId,
    fields: { title: GROUP_CHAT_TITLE, userIds: users }
  }, (res) => {
    if (res.error()) { logAction('Ошибка imbot.v2.Chat.add: ' + describeError(res), 'error'); return cb(null); }
    const d = res.data();
    const chatData = d.chat || d;
    const chatId = chatData.dialogId || chatData.id || d.dialogId || d.CHAT_ID;
    if (!chatId) { logAction('Не удалось извлечь ID чата: ' + JSON.stringify(d), 'error'); return cb(null); }
    localStorage.setItem('b24_group_chat_id', chatId); // синхронно — чтобы параллельные запросы его увидели
    settings.chatId = chatId;
    saveSettingsToBoth();
    logAction('Групповой чат создан, ID: ' + chatId, 'success');
    cb(chatId);
  });
}

function getGroupChatId(botId, seedUserId, cb) {
  if (settings.chatId) { logAction('Использую настроенный чат ID: ' + settings.chatId, 'info'); return cb(settings.chatId); }
  const cached = localStorage.getItem('b24_group_chat_id');
  if (cached) { settings.chatId = cached; return cb(cached); }

  if (chatInFlight) { logAction('Чат уже создаётся — в очередь', 'info'); chatQueue.push(cb); return; }
  chatInFlight = true;
  createGroupChat(botId, seedUserId, function (chatId) {
    chatInFlight = false;
    cb(chatId);
    drainChatQueue(chatId);
  });
}

function addUserToGroupChat(botId, chatId, userId, cb) {
  cb = cb || function () {};
  if (!chatId || !userId) return cb();
  BX24.callMethod('imbot.v2.Chat.user.add', {
    botId: botId,
    dialogId: chatId,
    userIds: [parseInt(userId)]
  }, function (res) {
    if (res.error()) {
      const errStr = describeError(res);
      logAction('Добавление пользователя ' + userId + ' в чат: ' + errStr, 'info');
      if (/NOT_FOUND|PARAM|ACCESS|404|UNKNOWN/i.test(errStr)) {
        logAction('Пробую пересоздать чат с пользователем внутри...', 'info');
        localStorage.removeItem('b24_group_chat_id');
        settings.chatId = '';
        createGroupChat(botId, userId, function (newId) {
          if (newId) { settings.chatId = newId; saveSettingsToBoth(); logAction('Чат пересоздан, ID: ' + newId, 'success'); }
          cb();
        });
        return;
      }
    } else logAction('Пользователь ' + userId + ' добавлен в чат', 'success');
    cb();
  });
}

function buildKeyboard(links) {
  const btns = (links || []).filter(function (l) { return l && l.url; }).map(function (l) {
    return { TEXT: l.text, LINK: l.url, BG_COLOR_TOKEN: 'primary' };
  });
  return btns.length ? [btns] : [];
}

function botSendToGroup(botId, chatId, title, message, links, cb) {
  BX24.callMethod('imbot.v2.Chat.Message.send', {
    botId: botId, dialogId: chatId,
    fields: { message: '[B]' + title + '[/B]\n' + message, keyboard: buildKeyboard(links) }
  }, (res) => {
    if (res.error()) { logAction('Ошибка отправки в чат: ' + describeError(res), 'error'); if (cb) cb(false); return; }
    logAction('Сообщение отправлено в чат ' + chatId, 'success');
    if (cb) cb(true);
  });
}

function sendToPersonalChat(botId, userId, title, message, links, cb) {
  const key = 'b24_bot_chat_' + userId;
  let dialogId = localStorage.getItem(key);
  function sendMsg(dId) {
    BX24.callMethod('imbot.v2.Chat.Message.send', {
      botId: botId, dialogId: dId,
      fields: { message: '[B]' + title + '[/B]\n' + message, keyboard: buildKeyboard(links) }
    }, (res) => {
      if (res.error()) { logAction('Ошибка отправки в личный чат: ' + describeError(res), 'error'); if (cb) cb(false); }
      else { logAction('Сообщение отправлено в личный чат ' + dId, 'success'); if (cb) cb(true); }
    });
  }
  if (dialogId) return sendMsg(dialogId);
  const userName = (typeof userNames !== 'undefined' && userNames[userId]) ? userNames[userId] : ('Пользователь ' + userId);
  BX24.callMethod('imbot.v2.Chat.add', {
    botId: botId, fields: { title: 'Закупки · ' + userName, userIds: [parseInt(userId)] }
  }, (res) => {
    if (res.error()) { logAction('Ошибка создания личного чата: ' + describeError(res), 'error'); if (cb) cb(false); return; }
    const d = res.data(); const chatData = d.chat || d;
    dialogId = chatData.dialogId || chatData.id || d.dialogId || d.CHAT_ID;
    if (!dialogId) { logAction('Не удалось извлечь ID личного чата', 'error'); if (cb) cb(false); return; }
    localStorage.setItem(key, dialogId);
    sendMsg(dialogId);
  });
}

function notifyUserViaBot(userId, title, message, links, cb, dedupeBase) {
  const fullKey = dedupeBase ? (dedupeBase + '_' + hashStr(message)) : '';
  if (dedupePass(fullKey)) { if (cb) cb(true); return; }
  getBotId(function (botId) {
    if (!botId) { logAction('Не удалось получить ID бота — уведомление пропущено', 'error'); if (cb) cb(false); return; }
    getGroupChatId(botId, userId, function (chatId) {
      if (!chatId) { logAction('Нет группового чата, пробую личный чат...', 'info'); sendToPersonalChat(botId, userId, title, message, links, cb); return; }
      addUserToGroupChat(botId, chatId, userId, function () {
        botSendToGroup(botId, chatId, title, message, links, function (ok) {
          if (!ok) { logAction('Fallback: личный чат', 'info'); sendToPersonalChat(botId, userId, title, message, links, cb); }
          else if (cb) cb(true);
        });
      });
    });
  });
}

// ✅ НЕ удаляем b24_group_chat_id — чат живёт на портале (как и бот)
function clearBotCache() {
  Object.keys(localStorage).filter(function (k) { return k.indexOf('b24_bot_chat_') === 0 || k.indexOf('b24_dk_') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  logAction('Кэш личных чатов и дедупа сброшен (ID бота и группового чата сохранены)', 'info');
}