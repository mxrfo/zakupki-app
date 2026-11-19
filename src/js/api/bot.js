// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2, режим fetch)
// ============================================================
// Групповой чат: один чат на приложение, бот добавляет пользователей.
// ID чата хранится в settings.chatId (настройка в админке).

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

function getBotId(cb) {
  const cachedBotId = localStorage.getItem('b24_bot_id');
  if (cachedBotId) return cb(parseInt(cachedBotId));

  logAction('Инициализация чат-бота (код: ' + BOT_CODE + ')...', 'info');

  BX24.callMethod('imbot.v2.Bot.register', {
    fields: {
      code: BOT_CODE,
      type: 'bot',
      eventMode: 'fetch',
      properties: { name: BOT_NAME, workPosition: 'Система уведомлений по закупкам' }
    }
  }, (res) => {
    if (res.error()) {
      const errStr = describeError(res);
      if (/already|exist|duplicate|taken|существует|занят/i.test(errStr.toLowerCase())) {
        logAction('Бот уже существует, получаю его ID...', 'info');
        BX24.callMethod('imbot.v2.Bot.list', {}, function (listRes) {
          if (listRes.error()) { logAction('Ошибка получения списка ботов: ' + describeError(listRes), 'error'); return cb(null); }
          const list = (listRes.data() && (listRes.data().result || listRes.data())) || [];
          const arr = Array.isArray(list) ? list : [];
          for (let i = 0; i < arr.length; i++) {
            const b = arr[i];
            if (String((b && (b.code || b.CODE)) || '') === String(BOT_CODE) && b && (b.id || b.ID)) {
              const id = parseInt(b.id || b.ID);
              localStorage.setItem('b24_bot_id', id);
              logAction('Найден существующий бот, ID: ' + id, 'success');
              return cb(id);
            }
          }
          logAction('Не удалось найти существующего бота по коду', 'error');
          cb(null);
        });
        return;
      }
      logAction('Ошибка регистрации бота (v2): ' + errStr, 'error');
      registerBotV1(cb);
      return;
    }
    const botId = res.data().bot.id;
    localStorage.setItem('b24_bot_id', botId);
    logAction('Бот успешно зарегистрирован (v2), ID: ' + botId, 'success');
    cb(botId);
  });
}

function registerBotV1(cb) {
  logAction('Пробуем резервный метод регистрации (imbot.v1)...', 'info');
  BX24.callMethod('imbot.register', {
    CODE: BOT_CODE, TYPE: 'bot', NAME: BOT_NAME,
    FIRST_NAME: 'Альтернатива', LAST_NAME: 'Бот', EVENT_HANDLER: ''
  }, (resV1) => {
    if (resV1.error()) { logAction('Ошибка регистрации бота (v1): ' + describeError(resV1), 'error'); return cb(null); }
    const botIdV1 = resV1.data().user_id;
    localStorage.setItem('b24_bot_id', botIdV1);
    logAction('Бот успешно зарегистрирован (v1 fallback), ID: ' + botIdV1, 'success');
    cb(botIdV1);
  });
}

// ✅ Получение ID группового чата. Если settings.chatId задан — используем его.
//    Иначе создаём новый групповой чат с ботом и сохраняем ID.
function getGroupChatId(botId, cb) {
  // 1. Проверяем настройку chatId
  if (settings.chatId) {
    logAction('Используем настроенный групповой чат ID: ' + settings.chatId, 'info');
    return cb(settings.chatId);
  }

  // 2. Проверяем кэш
  const cachedChatId = localStorage.getItem('b24_group_chat_id');
  if (cachedChatId) {
    settings.chatId = cachedChatId;
    return cb(cachedChatId);
  }

  // 3. Создаём новый групповой чат
  logAction('Создание нового группового чата...', 'info');
  BX24.callMethod('imbot.v2.Chat.add', {
    botId: botId,
    fields: {
      title: GROUP_CHAT_TITLE,
      userIds: [] // пустой — добавим пользователей позже
    }
  }, (res) => {
    if (res.error()) {
      logAction('Ошибка создания группового чата: ' + describeError(res), 'error');
      return cb(null);
    }
    const chatId = res.data().chat.dialogId;
    localStorage.setItem('b24_group_chat_id', chatId);
    settings.chatId = chatId;
    logAction('Групповой чат создан, ID: ' + chatId, 'success');
    cb(chatId);
  });
}

// ✅ Добавление пользователя в групповой чат (если ещё не добавлен)
function addUserToGroupChat(botId, chatId, userId, cb) {
  cb = cb || function() {};
  if (!chatId || !userId) return cb();

  // Проверяем, есть ли пользователь в чате (через im.dialog.users.get)
  BX24.callMethod('im.dialog.users.get', { DIALOG_ID: chatId }, function (res) {
    if (res.error()) {
      // Если метод недоступен — просто добавляем
      logAction('im.dialog.users.get ошибка: ' + describeError(res) + ', добавляю пользователя...', 'info');
      return addUserToGroupChatForce(botId, chatId, userId, cb);
    }
    const users = res.data() || [];
    const userIds = Array.isArray(users) ? users.map(u => String(u.ID || u)) : [];
    if (userIds.includes(String(userId))) {
      return cb(); // уже в чате
    }
    addUserToGroupChatForce(botId, chatId, userId, cb);
  });
}

function addUserToGroupChatForce(botId, chatId, userId, cb) {
  BX24.callMethod('imbot.v2.Chat.user.add', {
    botId: botId,
    dialogId: chatId,
    userIds: [parseInt(userId)]
  }, function (res) {
    if (res.error()) {
      logAction('Ошибка добавления пользователя ' + userId + ' в чат: ' + describeError(res), 'error');
    } else {
      logAction('Пользователь ' + userId + ' добавлен в групповой чат', 'success');
    }
    if (cb) cb();
  });
}

// ✅ Отправка сообщения в групповой чат
function botSendToGroup(botId, chatId, title, message, links, cb) {
  const keyboard = (links || []).filter(function (l) { return l && l.url; }).map(function (l) {
    return { TEXT: l.text, LINK: l.url, BG_COLOR_TOKEN: 'primary' };
  });
  const finalMessage = '[B]' + title + '[/B]\n' + message;

  BX24.callMethod('imbot.v2.Chat.Message.send', {
    botId: botId,
    dialogId: chatId,
    fields: { message: finalMessage, keyboard: keyboard }
  }, (res) => {
    if (res.error()) {
      logAction('Ошибка отправки в групповой чат: ' + describeError(res), 'error');
      if (cb) cb(false);
      return;
    }
    logAction('Сообщение отправлено в групповой чат ' + chatId, 'success');
    if (cb) cb(true);
  });
}

// ✅ Главная функция: отправить уведомление в групповой чат, добавив получателя
function notifyUserViaBot(userId, title, message, links, cb) {
  getBotId(function (botId) {
    if (!botId) { logAction('Не удалось получить ID бота', 'error'); if (cb) cb(false); return; }

    getGroupChatId(botId, function (chatId) {
      if (!chatId) { logAction('Не удалось получить ID группового чата', 'error'); if (cb) cb(false); return; }

      // Добавляем пользователя в чат
      addUserToGroupChat(botId, chatId, userId, function () {
        botSendToGroup(botId, chatId, title, message, links, function (ok) {
          if (!ok) {
            // Fallback на личный чат
            logAction('Fallback: отправка через личный чат', 'info');
            sendToPersonalChat(botId, userId, title, message, links, cb);
          } else {
            if (cb) cb(true);
          }
        });
      });
    });
  });
}

// ✅ Fallback: отправка в личный чат (если групповой не сработал)
function sendToPersonalChat(botId, userId, title, message, links, cb) {
  const key = 'b24_bot_chat_' + userId;
  let dialogId = localStorage.getItem(key);

  function sendMsg(dId) {
    const keyboard = (links || []).filter(function (l) { return l && l.url; }).map(function (l) {
      return { TEXT: l.text, LINK: l.url, BG_COLOR_TOKEN: 'primary' };
    });
    BX24.callMethod('imbot.v2.Chat.Message.send', {
      botId: botId,
      dialogId: dId,
      fields: { message: '[B]' + title + '[/B]\n' + message, keyboard: keyboard }
    }, (res) => {
      if (res.error()) {
        logAction('Ошибка отправки в личный чат: ' + describeError(res), 'error');
        if (cb) cb(false);
      } else {
        logAction('Сообщение отправлено в личный чат ' + dId, 'success');
        if (cb) cb(true);
      }
    });
  }

  if (dialogId) {
    sendMsg(dialogId);
  } else {
    const userName = (typeof userNames !== 'undefined' && userNames[userId]) ? userNames[userId] : ('Пользователь ' + userId);
    BX24.callMethod('imbot.v2.Chat.add', {
      botId: botId,
      fields: { title: 'Закупки · ' + userName, userIds: [parseInt(userId)] }
    }, (res) => {
      if (res.error()) { logAction('Ошибка создания личного чата: ' + describeError(res), 'error'); if (cb) cb(false); return; }
      dialogId = res.data().chat.dialogId;
      localStorage.setItem(key, dialogId);
      sendMsg(dialogId);
    });
  }
}