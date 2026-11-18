// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2, режим fetch)
// ============================================================
// При каждом запуске приложения удаляет ВСЕХ старых ботов с кодом purchase_app_bot
// и создаёт нового, привязанного к текущему архиву.

const BOT_CODE = 'purchase_app_bot';
const BOT_NAME = 'Альтернатива · Закупки';

function getCurrentClientId() {
  try {
    const auth = BX24.getAuth();
    if (auth && auth.client_id) return auth.client_id;
  } catch (e) {}
  return (settings.clientId || '').trim() || 'unknown';
}

function describeError(res) {
  try {
    const e = res.error();
    let code = 'UNKNOWN', desc = '';
    if (typeof e === 'string') {
      code = e;
    } else if (typeof e === 'function') {
      try { code = e() || 'UNKNOWN'; } catch (err) { code = 'UNKNOWN'; }
    } else if (e && typeof e === 'object') {
      code = e.error || e.code || 'UNKNOWN';
      desc = e.error_description || e.description || '';
    }
    if (!desc && res.error_description) desc = res.error_description;
    return 'Код ошибки: ' + code + (desc ? ' | ' + desc : '');
  } catch (_) {
    return 'Код ошибки: UNKNOWN';
  }
}

// ✅ Удаляет ВСЕХ ботов с кодом BOT_CODE (старые версии)
function removeAllOldBots(cb) {
  logAction('Поиск старых ботов с кодом ' + BOT_CODE + '...', 'info');
  
  BX24.callMethod('imbot.v2.Bot.list', {}, function(res) {
    if (res.error()) {
      logAction('Bot.list ошибка: ' + describeError(res), 'error');
      return cb();
    }
    
    const list = (res.data() && (res.data().result || res.data())) || [];
    const arr = Array.isArray(list) ? list : [];
    const botsToDelete = [];
    
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      const code = (b && (b.code || b.CODE)) || '';
      if (String(code) === String(BOT_CODE) && b && (b.id || b.ID)) {
        botsToDelete.push(parseInt(b.id || b.ID));
      }
    }
    
    if (botsToDelete.length === 0) {
      logAction('Старых ботов не найдено', 'info');
      return cb();
    }
    
    logAction('Найдено старых ботов: ' + botsToDelete.length + ' (ID: ' + botsToDelete.join(', ') + '). Удаляю...', 'info');
    
    let deleted = 0;
    botsToDelete.forEach(function(botId) {
      // Используем legacy метод imbot.remove (работает и для v2 ботов)
      BX24.callMethod('imbot.remove', { ID: botId }, function(removeRes) {
        if (removeRes.error()) {
          logAction('Ошибка удаления бота ID ' + botId + ': ' + describeError(removeRes), 'error');
        } else {
          logAction('Бот ID ' + botId + ' удалён', 'success');
        }
        deleted++;
        if (deleted === botsToDelete.length) {
          logAction('Все старые боты удалены', 'success');
          cb();
        }
      });
    });
  });
}

// ✅ Полный сброс кэша бота, диалогов и client_id
function clearBotCache() {
  localStorage.removeItem('b24_bot_id');
  localStorage.removeItem('b24_bot_client_id');
  Object.keys(localStorage)
    .filter(function(k) { return k.indexOf('b24_bot_chat_') === 0; })
    .forEach(function(k) { localStorage.removeItem(k); });
  logAction('Кэш бота полностью сброшен', 'info');
}

function clearBotDialogCache(userId) {
  localStorage.removeItem('b24_bot_chat_' + userId);
}

/**
 * Получает ID бота, удаляя старых и создавая нового при необходимости.
 * Вызывается ОДИН РАЗ при первом запуске приложения.
 */
function getBotId(cb, force) {
  const cachedBotId = localStorage.getItem('b24_bot_id');
  const cachedClientId = localStorage.getItem('b24_bot_client_id');
  const currentClientId = getCurrentClientId();

  // ✅ Если client_id изменился ИЛИ force=true — удаляем старых ботов и создаём нового
  if (force || (cachedBotId && cachedClientId !== currentClientId)) {
    if (cachedBotId && cachedClientId !== currentClientId) {
      logAction('client_id изменился (' + cachedClientId + ' → ' + currentClientId + '). Пересоздаём бота...', 'info');
    } else {
      logAction('Принудительное пересоздание бота...', 'info');
    }
    
    clearBotCache();
    
    // Удаляем всех старых ботов и создаём нового
    removeAllOldBots(function() {
      registerNewBot(cb);
    });
    return;
  }

  if (cachedBotId) {
    return cb(parseInt(cachedBotId));
  }

  // Первый запуск — удаляем старых (если есть) и создаём нового
  removeAllOldBots(function() {
    registerNewBot(cb);
  });
}

function registerNewBot(cb) {
  logAction('Регистрация нового чат-бота (imbot.v2)...', 'info');

  BX24.callMethod('imbot.v2.Bot.register', {
    fields: {
      code: BOT_CODE,
      type: 'bot',
      eventMode: 'fetch',
      properties: {
        name: BOT_NAME,
        workPosition: 'Система уведомлений по закупкам'
      }
    }
  }, (res) => {
    if (res.error()) {
      logAction('Ошибка регистрации бота (v2): ' + describeError(res), 'error');
      registerBotV1(cb);
      return;
    }

    const botId = res.data().bot.id;
    localStorage.setItem('b24_bot_id', botId);
    localStorage.setItem('b24_bot_client_id', getCurrentClientId());
    logAction('Бот успешно зарегистрирован (v2), ID: ' + botId, 'success');
    cb(botId);
  });
}

function registerBotV1(cb) {
  logAction('Пробуем резервный метод регистрации (imbot.v1)...', 'info');
  BX24.callMethod('imbot.register', {
    CODE: BOT_CODE,
    TYPE: 'bot',
    NAME: BOT_NAME,
    FIRST_NAME: 'Альтернатива',
    LAST_NAME: 'Бот',
    EVENT_HANDLER: ''
  }, (resV1) => {
    if (resV1.error()) {
      logAction('Ошибка регистрации бота (v1): ' + describeError(resV1), 'error');
      return cb(null);
    }
    const botIdV1 = resV1.data().user_id;
    localStorage.setItem('b24_bot_id', botIdV1);
    localStorage.setItem('b24_bot_client_id', getCurrentClientId());
    logAction('Бот успешно зарегистрирован (v1 fallback), ID: ' + botIdV1, 'success');
    cb(botIdV1);
  });
}

function getBotDialog(botId, userId, cb, force) {
  const key = 'b24_bot_chat_' + userId;
  const cached = localStorage.getItem(key);

  if (cached && !force) {
    return cb(cached);
  }

  const userName = (typeof userNames !== 'undefined' && userNames[userId]) ? userNames[userId] : ('Пользователь ' + userId);

  BX24.callMethod('imbot.v2.Chat.add', {
    botId: botId,
    fields: {
      title: 'Закупки · ' + userName,
      userIds: [parseInt(userId)]
    }
  }, (res) => {
    if (res.error()) {
      logAction('Ошибка создания чата с ботом: ' + describeError(res), 'error');
      return cb(null);
    }

    const dialogId = res.data().chat.dialogId;
    localStorage.setItem(key, dialogId);
    logAction('Диалог с ботом создан для пользователя ' + userId + ', dialogId: ' + dialogId, 'success');
    cb(dialogId);
  });
}

function botSend(botId, dialogId, title, message, links, cb) {
  const keyboard = (links || []).filter(function(l) {
    return l && l.url;
  }).map(function(l) {
    return {
      TEXT: l.text,
      LINK: l.url,
      BG_COLOR_TOKEN: 'primary'
    };
  });

  const finalMessage = '[B]' + title + '[/B]\n' + message;

  BX24.callMethod('imbot.v2.Chat.Message.send', {
    botId: botId,
    dialogId: dialogId,
    fields: {
      message: finalMessage,
      keyboard: keyboard
    }
  }, (res) => {
    if (res.error()) {
      logAction('Ошибка отправки сообщения ботом: ' + describeError(res), 'error');
      if (cb) cb(false, true);
      return;
    }
    logAction('Бот успешно отправил уведомление в диалог ' + dialogId, 'success');
    if (cb) cb(true, false);
  });
}

function notifyUserViaBot(userId, title, message, links, cb) {
  var retried = false;

  function attempt(force, done) {
    getBotId(function(botId) {
      if (!botId) {
        logAction('Не удалось получить ID бота', 'error');
        return done(false);
      }

      getBotDialog(botId, userId, function(dialogId) {
        if (!dialogId) {
          logAction('Не удалось получить dialogId для пользователя ' + userId, 'error');
          return done(false);
        }

        botSend(botId, dialogId, title, message, links, function(ok, retryable) {
          done(ok, retryable);
        });
      }, force);
    }, force);
  }

  attempt(false, function(ok, retryable) {
    if (ok) {
      if (cb) cb(true);
      return;
    }

    if (!retried) {
      retried = true;
      clearBotCache();
      clearBotDialogCache(userId);
      logAction('Повторная попытка отправки с пересозданием бота...', 'info');
      attempt(true, function(ok2) {
        if (cb) cb(ok2);
      });
      return;
    }

    if (cb) cb(false);
  });
}