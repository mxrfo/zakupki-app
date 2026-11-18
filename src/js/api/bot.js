// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2, режим fetch)
// ============================================================
// Устойчив к пересозданию приложения и устаревшему кэшу botId/dialogId:
// при ЛЮБОЙ ошибке отправки (в т.ч. UNKNOWN) сбрасывает кэш и делает
// один ретрай с принудительной перерегистрацией бота и пересозданием диалога.
// Если register возвращает «уже существует» — бот ищется через Bot.list по code.

const BOT_CODE = 'purchase_app_bot';
const BOT_NAME = 'Альтернатива · Закупки';

// Хелпер: полный текст ошибки для логов
function describeError(res) {
  try {
    const e = res.error();
    let code = '', desc = '';
    if (typeof e === 'string') code = e;
    else if (e) { code = e.error || ''; desc = e.error_description || ''; }
    if (!desc && res.error_description) desc = res.error_description;
    return 'Код ошибки: ' + (code || 'UNKNOWN') + (desc ? ' | ' + desc : '');
  } catch (_) {
    return 'Код ошибки: UNKNOWN';
  }
}

// Хелпер: распознать ошибку «бот чужой / нет доступа / не найден»
function isBotOwnershipError(res) {
  try {
    const s = describeError(res);
    return /BOT_OWNERSHIP_ERROR|BOT_NOT_FOUND|ACCESS_DENIED|BOT_ID_REQUIRED|BOT_TOKEN_NOT_SPECIFIED/i.test(s);
  } catch (_) {
    return false;
  }
}

// Хелпер: распознать ошибку «бот с таким code уже существует»
function isBotAlreadyExistsError(res) {
  try {
    const s = describeError(res).toLowerCase();
    return /already|exist|duplicate|taken|существует|занят/i.test(s);
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

// Сброс кэша диалога конкретного пользователя
function clearBotDialogCache(userId) {
  localStorage.removeItem('b24_bot_chat_' + userId);
}

// Поиск существующего бота по code через Bot.list (для случая «уже существует»)
function findExistingBotByCode(cb) {
  BX24.callMethod('imbot.v2.Bot.list', {}, function(res) {
    if (res.error()) {
      logAction('imbot.v2.Bot.list ошибка: ' + describeError(res), 'error');
      return cb(null);
    }
    const list = (res.data() && (res.data().result || res.data())) || [];
    const arr = Array.isArray(list) ? list : [];
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      const code = (b && (b.code || b.CODE)) || '';
      if (String(code) === String(BOT_CODE) && b && (b.id || b.ID)) {
        const id = parseInt(b.id || b.ID);
        logAction('Бот найден через Bot.list, ID: ' + id, 'success');
        return cb(id);
      }
    }
    cb(null);
  });
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
      logAction('Ошибка регистрации бота (v2): ' + describeError(res), 'error');

      // Если бот с таким code уже существует под этим приложением — берём его из Bot.list
      if (isBotAlreadyExistsError(res)) {
        logAction('Бот уже существует — ищу через Bot.list...', 'info');
        findExistingBotByCode(function(foundId) {
          if (foundId) {
            localStorage.setItem('b24_bot_id', foundId);
            return cb(foundId);
          }
          // Не нашли — пробуем v1 как последний резерв
          registerBotV1(cb);
        });
        return;
      }

      // Иначе — fallback на v1
      registerBotV1(cb);
      return;
    }

    const botId = res.data().bot.id;
    localStorage.setItem('b24_bot_id', botId);
    logAction('Бот успешно зарегистрирован (v2), ID: ' + botId, 'success');
    cb(botId);
  });
}

// Регистрация через v1 (резервный путь для старых порталов)
function registerBotV1(cb) {
  logAction('Пробуем резервный метод регистрации (imbot.v1)...', 'info');
  BX24.callMethod('imbot.register', {
    CODE: BOT_CODE,
    TYPE: 'bot',
    NAME: BOT_NAME,
    FIRST_NAME: 'Альтернатива',
    LAST_NAME: 'Бот',
    EVENT_HANDLER: '' // Пустой: события не слушаем, только пишем
  }, (resV1) => {
    if (resV1.error()) {
      logAction('Ошибка регистрации бота (v1): ' + describeError(resV1), 'error');
      return cb(null);
    }
    const botIdV1 = resV1.data().user_id;
    localStorage.setItem('b24_bot_id', botIdV1);
    logAction('Бот успешно зарегистрирован (v1 fallback), ID: ' + botIdV1, 'success');
    cb(botIdV1);
  });
}

/**
 * Получает ID диалога с ботом для пользователя, создавая его при необходимости.
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
      logAction('Ошибка создания чата с ботом: ' + describeError(res), 'error');
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
 * cb(ok, retryable) — retryable=true при любой ошибке (в т.ч. UNKNOWN),
 * чтобы notifyUserViaBot мог сбросить кэш и повторить.
 */
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
      // Любая ошибка send считается retryable: кэш botId/dialogId мог протухнуть
      if (cb) cb(false, true);
      return;
    }
    logAction('Бот успешно отправил уведомление в диалог ' + dialogId, 'success');
    if (cb) cb(true, false);
  });
}

/**
 * Главная функция-обертка для отправки уведомления пользователю через бота.
 * Одна автоматическая попытка ретрая с полным сбросом кэша при ЛЮБОЙ ошибке send.
 */
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

    // Ретраим один раз при любой ошибке send (UNKNOWN, ownership, устаревший dialogId и т.д.)
    if (!retried) {
      retried = true;
      clearBotCache();
      clearBotDialogCache(userId);
      logAction('Повторная попытка отправки с перерегистрацией бота...', 'info');
      attempt(true, function(ok2) {
        if (cb) cb(ok2);
      });
      return;
    }

    if (cb) cb(false);
  });
}