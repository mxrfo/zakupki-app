// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2)
// ============================================================
const BOT_CODE = 'purchase_app_bot';
const BOT_NAME = 'Альтернатива · Закупки';
const GROUP_CHAT_TITLE = 'Закупки · Альтернатива';

function describeError(res) {
  try {
    const e = res.error();
    let code = 'UNKNOWN', desc = '';
    if (typeof e === 'string') code = e;
    else if (typeof e === 'function') { try { code = e() || 'UNKNOWN'; } catch (err) { code = 'UNKNOWN'; } }
    else if (e && typeof e === 'object') { code = e.error || e.code || 'UNKNOWN'; desc = e.error_description || e.description || ''; }
    if (!desc && res.error_description) desc = res.error_description;
    return 'Код ошибки: ' + code + (desc ? ' | ' + desc : '');
  } catch (_) { return 'Код ошибки: UNKNOWN'; }
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

function getBotId(cb) {
  const cachedBotId = localStorage.getItem('b24_bot_id');
  if (cachedBotId) return cb(parseInt(cachedBotId));
  logAction('Инициализация чат-бота (код: ' + BOT_CODE + ')...', 'info');
  BX24.callMethod('imbot.v2.Bot.register', {
    CODE: BOT_CODE,
    TYPE: 'bot',
    EVENT_MODE: 'fetch',
    PROPERTIES: { NAME: BOT_NAME, WORK_POSITION: 'Система уведомлений по закупкам' }
  }, (res) => {
    if (res.error()) {
      const errStr = describeError(res);
      if (/already|exist|duplicate|taken|существует|занят/i.test(errStr.toLowerCase())) {
        logAction('Бот уже существует, ищу его ID...', 'info');
        BX24.callMethod('imbot.v2.Bot.list', {}, function (listRes) {
          if (listRes.error()) { logAction('Bot.list ошибка: ' + describeError(listRes), 'error'); return cb(null); }
          const arr = (listRes.data() && (listRes.data().result || listRes.data())) || [];
          const list = Array.isArray(arr) ? arr : [];
          for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (String((b && (b.CODE || b.code)) || '') === String(BOT_CODE) && b && (b.ID || b.id)) {
              const id = parseInt(b.ID || b.id);
              localStorage.setItem('b24_bot_id', id);
              logAction('Найден существующий бот, ID: ' + id, 'success');
              return cb(id);
            }
          }
          logAction('Бот с кодом ' + BOT_CODE + ' не найден в списке', 'error');
          cb(null);
        });
        return;
      }
      logAction('Ошибка регистрации бота (v2): ' + errStr, 'error');
      registerBotV1(cb);
      return;
    }
    const botId = res.data().BOT_ID || res.data().botId || res.data().id;
    localStorage.setItem('b24_bot_id', botId);
    logAction('Бот зарегистрирован (v2), ID: ' + botId, 'success');
    cb(botId);
  });
}

function registerBotV1(cb) {
  logAction('Резервная регистрация (imbot.v1)...', 'info');
  BX24.callMethod('imbot.register', { CODE: BOT_CODE, TYPE: 'bot', NAME: BOT_NAME, FIRST_NAME: 'Альтернатива', LAST_NAME: 'Бот', EVENT_HANDLER: '' }, (resV1) => {
    if (resV1.error()) { logAction('Ошибка регистрации (v1): ' + describeError(resV1), 'error'); return cb(null); }
    const botIdV1 = resV1.data().user_id;
    localStorage.setItem('b24_bot_id', botIdV1);
    logAction('Бот зарегистрирован (v1), ID: ' + botIdV1, 'success');
    cb(botIdV1);
  });
}

function getGroupChatId(botId, cb) {
  if (settings.chatId) { logAction('Использую настроенный чат ID: ' + settings.chatId, 'info'); return cb(settings.chatId); }
  const cached = localStorage.getItem('b24_group_chat_id');
  if (cached) { settings.chatId = cached; return cb(cached); }
  logAction('Создание группового чата...', 'info');
  BX24.callMethod('imbot.v2.Chat.add', {
    BOT_ID: botId,
    TITLE: GROUP_CHAT_TITLE,
    USER_IDS: []
  }, (res) => {
    if (res.error()) { logAction('Ошибка создания группового чата: ' + describeError(res), 'error'); return cb(null); }
    const chatId = res.data().CHAT_ID || res.data().chatId || res.data().id;
    localStorage.setItem('b24_group_chat_id', chatId);
    settings.chatId = chatId;
    logAction('Групповой чат создан, ID: ' + chatId, 'success');
    cb(chatId);
  });
}

// ✅ imchat.user.add — правильный метод добавления в чат
function addUserToGroupChat(botId, chatId, userId, cb) {
  cb = cb || function () {};
  if (!chatId || !userId) return cb();
  BX24.callMethod('imchat.user.add', {
    CHAT_ID: chatId,
    USER_ID: parseInt(userId)
  }, function (res) {
    if (res.error()) {
      logAction('Добавление пользователя ' + userId + ' в чат: ' + describeError(res) + ' (продолжаем)', 'info');
    } else {
      logAction('Пользователь ' + userId + ' добавлен в чат', 'success');
    }
    cb();
  });
}

function buildKeyboard(links) {
  const btns = (links || []).filter(function (l) { return l && l.url; }).map(function (l) {
    return { TEXT: l.text, LINK: l.url, BG_COLOR_TOKEN: 'primary' };
  });
  return btns.length ? [btns] : [];
}

// ✅ imbot.v2.Chat.Message.send — UPPER_SNAKE_CASE параметры
function botSendToGroup(botId, chatId, title, message, links, cb) {
  BX24.callMethod('imbot.v2.Chat.Message.send', {
    BOT_ID: botId,
    CHAT_ID: chatId,
    MESSAGE: '[B]' + title + '[/B]\n' + message,
    KEYBOARD: buildKeyboard(links)
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
      BOT_ID: botId,
      CHAT_ID: dId,
      MESSAGE: '[B]' + title + '[/B]\n' + message,
      KEYBOARD: buildKeyboard(links)
    }, (res) => {
      if (res.error()) { logAction('Ошибка отправки в личный чат: ' + describeError(res), 'error'); if (cb) cb(false); }
      else { logAction('Сообщение отправлено в личный чат ' + dId, 'success'); if (cb) cb(true); }
    });
  }
  if (dialogId) return sendMsg(dialogId);
  const userName = (typeof userNames !== 'undefined' && userNames[userId]) ? userNames[userId] : ('Пользователь ' + userId);
  BX24.callMethod('imbot.v2.Chat.add', {
    BOT_ID: botId,
    TITLE: 'Закупки · ' + userName,
    USER_IDS: [parseInt(userId)]
  }, (res) => {
    if (res.error()) { logAction('Ошибка создания личного чата: ' + describeError(res), 'error'); if (cb) cb(false); return; }
    dialogId = res.data().CHAT_ID || res.data().chatId || res.data().id;
    localStorage.setItem(key, dialogId);
    sendMsg(dialogId);
  });
}

function notifyUserViaBot(userId, title, message, links, cb, dedupeBase) {
  const fullKey = dedupeBase ? (dedupeBase + '_' + hashStr(message)) : '';
  if (dedupePass(fullKey)) { if (cb) cb(true); return; }
  getBotId(function (botId) {
    if (!botId) { logAction('Не удалось получить ID бота', 'error'); if (cb) cb(false); return; }
    getGroupChatId(botId, function (chatId) {
      if (!chatId) { logAction('Не удалось получить ID чата', 'error'); if (cb) cb(false); return; }
      addUserToGroupChat(botId, chatId, userId, function () {
        botSendToGroup(botId, chatId, title, message, links, function (ok) {
          if (!ok) {
            logAction('Fallback: личный чат', 'info');
            sendToPersonalChat(botId, userId, title, message, links, cb);
          } else if (cb) cb(true);
        });
      });
    });
  });
}

function clearBotCache() {
  localStorage.removeItem('b24_bot_id');
  localStorage.removeItem('b24_group_chat_id');
  Object.keys(localStorage).filter(function (k) { return k.indexOf('b24_bot_chat_') === 0 || k.indexOf('b24_dk_') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  logAction('Кэш бота и дедупа сброшен', 'info');
}