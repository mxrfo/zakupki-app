// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2, режим fetch)
// ============================================================
// Устойчив к пересозданию приложения: если бот из кэша принадлежит
// другому client_id (BOT_OWNERSHIP_ERROR / ACCESS_DENIED / BOT_NOT_FOUND),
// кэш сбрасывается и бот перерегистрируется автоматически.

const BOT_CODE = 'purchase_app_bot';
const BOT_NAME = 'Альтернатива · Закупки';

// Хелпер: распознать ошибку «бот чужой / не найден / нет доступа»
function isBotOwnershipError(res) {
  try {
    const e = res.error();
    let s = '';
    if (typeof e === 'string') s = e;
    else if (e) s = (e.error || '') + ' ' + (e.error_description || '');
    s += ' ' + (res.error_description || '');
    return /BOT_OWNERSHIP_ERROR|BOT_NOT_FOUND|ACCESS_DENIED|BOT_ID_REQUIRED|BOT_TOKEN_NOT_SPECIFIED/i.test(s);
  } catch (_) {
    return false;
  }
}

// Полный сброс кэша бота и его диалогов
function clearBotCache() {
  localStorage.removeItem('b24_bot_id');
  Object.keys(localStorage)
    .filter(function(k) { return k.indexOf('b24_bot_chat_') === 0; })
    .forEach(function(k) { localStorage.removeItem(k); });
  logAction('Кэш бота сброшен (botId + диалоги) — перерегистрация', 'info');
}

/**
 * Получает ID бота, регистрируя его при необходимости.
 * @param {function} cb
 * @param {boolean} force — принудительная регистрация (игнорировать кэш)
 */
function getBotId(cb, force) {
  const cached = localStorage.getItem('b24_bot_id');
  if (cached && !force) {
    return cb(parseInt(cached));
  }

  logAction('Регистрация чат-бота (imbot.v2)...', 'info');

  // eventMode: 'fetch' означает, что нам не нужен публичный URL обработчика
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
      logAction('Ошибка регистрации бота (v2): ' + getApiErrorMessage(res), 'error');

      // Fallback на v1, если портал старый и не поддерживает v2
      logAction('Пробуем резервный метод регистрации (imbot.v1)...', 'info');
      BX24.callMethod('imbot.register', {
        CODE: BOT_CODE,
        TYPE: 'bot',
        NAME: BOT_NAME,
        FIRST_NAME: 'Альтернатива',
        LAST_NAME: 'Бот',
        EVENT_HANDLER: '' // Пустой, так как мы не будем слушать события, только писать
      }, (resV1) => {
        if (resV1.error()) {
          logAction('Ошибка регистрации бота (v1): ' + getApiErrorMessage(resV1), 'error');
          return cb(null);
        }
        const botIdV1 = resV1.data().user_id;
        localStorage.setItem('b24_bot_id', botIdV1);
        logAction('Бот успешно зарегистрирован (v1 fallback), ID: ' + botIdV1, 'success');
        cb(botIdV1);
      });
      return;
    }

    const botId = res.data().bot.id;
    localStorage.setItem('b24_bot_id', botId);
    logAction('Бот успешно зарегистрирован (v2), ID: ' + botId, 'success');
    cb(botId);
  });
}

/**
 * Получает ID диалога с ботом для конкретного пользователя, создавая его при необходимости.
 * @param {number} botId
 * @param {number|string} userId
 * @param {function} cb
 * @param {boolean} force — принудительное создание диалога (игнорировать кэш)
 */
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
      logAction('Ошибка создания чата с ботом: ' + getApiErrorMessage(res), 'error');
      return cb(null);
    }

    const dialogId = res.data().chat.dialogId;
    localStorage.setItem(key, dialogId);
    logAction('Диалог с ботом создан для пользователя ' + userId + ', dialogId: ' + dialogId, 'success');
    cb(dialogId);
  });
}

/**
 * Отправляет сообщение от имени бота с кнопками-ссылками.
 */
function botSend(botId, dialogId, title, message, links, cb) {
  // Формируем клавиатуру из переданных ссылок
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
      logAction('Ошибка отправки сообщения ботом: ' + getApiErrorMessage(res), 'error');
      // Передаём в cb не просто false, а признак «ошибка владения/доступа»,
      // чтобы notifyUserViaBot мог решить — ретраить или нет.
      if (cb) cb(false, isBotOwnershipError(res));
      return;
    }
    logAction('Бот успешно отправил уведомление в диалог ' + dialogId, 'success');
    if (cb) cb(true, false);
  });
}

/**
 * Главная функция-обертка для отправки уведомления пользователю через бота.
 * Одна автоматическая попытка ретрая с перерегистрацией бота при ошибке владения.
 */
function notifyUserViaBot(userId, title, message, links, cb) {
  var retried = false;

  function attempt(force, done) {
    getBotId(function(botId) {
      if (!botId) {
        logAction('Не удалось получить ID бота', 'error');
        return done(false, false);
      }

      getBotDialog(botId, userId, function(dialogId) {
        if (!dialogId) {
          logAction('Не удалось получить dialogId для пользователя ' + userId, 'error');
          return done(false, false);
        }

        botSend(botId, dialogId, title, message, links, function(ok, ownershipErr) {
          done(ok, ownershipErr);
        });
      }, force);
    }, force);
  }

  attempt(false, function(ok, ownershipErr) {
    if (ok) {
      if (cb) cb(true);
      return;
    }

    // Если ошибка «бот чужой / нет доступа» и ещё не ретраили —
    // сбрасываем кэш и пробуем один раз с принудительной перерегистрацией.
    if (ownershipErr && !retried) {
      retried = true;
      clearBotCache();
      attempt(true, function(ok2) {
        if (cb) cb(ok2);
      });
      return;
    }

    if (cb) cb(false);
  });
}