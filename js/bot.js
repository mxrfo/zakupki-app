// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2, режим fetch)
// ============================================================

const BOT_CODE = 'purchase_app_bot';
const BOT_NAME = 'Альтернатива · Закупки';

/**
 * Получает ID бота, регистрируя его при необходимости
 */
function getBotId(cb) {
  const cached = localStorage.getItem('b24_bot_id');
  if (cached) {
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
 * Получает ID диалога с ботом для конкретного пользователя, создавая его при необходимости
 */
function getBotDialog(botId, userId, cb) {
  const key = 'b24_bot_chat_' + userId;
  const cached = localStorage.getItem(key);
  
  if (cached) {
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
 * Отправляет сообщение от имени бота с кнопками-ссылками
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
      if (cb) cb(false);
      return;
    }
    logAction('Бот успешно отправил уведомление в диалог ' + dialogId, 'success');
    if (cb) cb(true);
  });
}

/**
 * Главная функция-обертка для отправки уведомления пользователю через бота
 */
function notifyUserViaBot(userId, title, message, links, cb) {
  getBotId(function(botId) {
    if (!botId) {
      logAction('Не удалось получить ID бота, отмена отправки', 'error');
      if (cb) cb(false);
      return;
    }
    
    getBotDialog(botId, userId, function(dialogId) {
      if (!dialogId) {
        logAction('Не удалось получить dialogId для пользователя ' + userId, 'error');
        if (cb) cb(false);
        return;
      }
      
      botSend(botId, dialogId, title, message, links, cb);
    });
  });
}