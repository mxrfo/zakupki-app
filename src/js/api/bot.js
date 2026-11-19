// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2, режим fetch)
// ============================================================
// Используем СТАТИЧНЫЙ код бота. При обновлении ZIP через "Редактировать"
// приложение остаётся тем же, и Битрикс просто вернёт ID существующего бота.
// Никакого мусора и пересозданий не требуется.

const BOT_CODE = 'purchase_app_bot';
const BOT_NAME = 'Альтернатива · Закупки';

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
          if (listRes.error()) {
            logAction('Ошибка получения списка ботов: ' + describeError(listRes), 'error');
            return cb(null);
          }
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
          logAction('Бот с кодом ' + BOT_CODE + ' не найден в списке', 'error');
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

function clearBotCache() {
  localStorage.removeItem('b24_bot_id');
  Object.keys(localStorage).filter(function (k) { return k.indexOf('b24_bot_chat_') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  logAction('Кэш бота сброшен', 'info');
}

function getBotDialog(botId, userId, cb) {
  const key = 'b24_bot_chat_' + userId;
  const cached = localStorage.getItem(key);
  if (cached) return cb(cached);

  const userName = (typeof userNames !== 'undefined' && userNames[userId]) ? userNames[userId] : ('Пользователь ' + userId);

  BX24.callMethod('imbot.v2.Chat.add', {
    botId: botId,
    fields: { title: 'Закупки · ' + userName, userIds: [parseInt(userId)] }
  }, (res) => {
    if (res.error()) {
      logAction('Ошибка создания чата: ' + describeError(res), 'error');
      return cb(null);
    }
    const dialogId = res.data().chat.dialogId;
    localStorage.setItem(key, dialogId);
    logAction('Диалог создан для пользователя ' + userId + ', dialogId: ' + dialogId, 'success');
    cb(dialogId);
  });
}

function botSend(botId, dialogId, title, message, links, cb) {
  const keyboard = (links || []).filter(function (l) { return l && l.url; }).map(function (l) {
    return { TEXT: l.text, LINK: l.url, BG_COLOR_TOKEN: 'primary' };
  });

  BX24.callMethod('imbot.v2.Chat.Message.send', {
    botId: botId,
    dialogId: dialogId,
    fields: { message: '[B]' + title + '[/B]\n' + message, keyboard: keyboard }
  }, (res) => {
    if (res.error()) {
      logAction('Ошибка отправки ботом: ' + describeError(res), 'error');
      if (cb) cb(false);
      return;
    }
    logAction('Бот успешно отправил уведомление в диалог ' + dialogId, 'success');
    if (cb) cb(true);
  });
}

function notifyUserViaBot(userId, title, message, links, cb) {
  getBotId(function (botId) {
    if (!botId) { logAction('Не удалось получить ID бота', 'error'); if (cb) cb(false); return; }

    getBotDialog(botId, userId, function (dialogId) {
      if (!dialogId) { logAction('Не удалось получить dialogId', 'error'); if (cb) cb(false); return; }

      botSend(botId, dialogId, title, message, links, function (ok) {
        if (!ok) {
          // Fallback на обычное уведомление, если бот не смог отправить
          logAction('Fallback: отправка через im.notify', 'info');
          const firstLink = (links && links[0] && links[0].url) ? links[0].url : '';
          BX24.callMethod('im.notify', {
            to: userId,
            message: title + '\n' + message,
            type: 'SYSTEM',
            link: firstLink,
            button_text: firstLink ? 'Открыть' : ''
          }, function(r) {
            if (r.error()) logAction('im.notify не прошёл: ' + describeError(r), 'error');
            if (cb) cb(false);
          });
        } else {
          if (cb) cb(true);
        }
      });
    });
  });
}