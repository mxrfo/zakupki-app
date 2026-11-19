// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2, режим fetch)
// ============================================================
const BOT_CODE_BASE = 'purchase_app_bot';
const BOT_NAME = 'Альтернатива · Закупки';

function getBotCode() {
  const build = (typeof APP_BUILD_ID !== 'undefined' && APP_BUILD_ID && APP_BUILD_ID !== 'AUTO')
    ? APP_BUILD_ID
    : 'default';
  return BOT_CODE_BASE + '_' + String(build).replace(/[^A-Za-z0-9_]/g, '_');
}

function getCurrentClientId() {
  try {
    const auth = BX24.getAuth();
    if (auth) { if (auth.client_id) return auth.client_id; if (auth.CLIENT_ID) return auth.CLIENT_ID; }
  } catch (e) {}
  return (settings.clientId || '').trim() || '';
}

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

function removeAllOldBots(cb) {
  cb = cb || function () {};
  const ourCode = getBotCode();
  logAction('Поиск и очистка старых ботов с префиксом ' + BOT_CODE_BASE + '...', 'info');

  BX24.callMethod('imbot.v2.Bot.list', {}, function (res) {
    if (res.error()) { logAction('Bot.list ошибка: ' + describeError(res), 'error'); return cb(); }
    const list = (res.data() && (res.data().result || res.data())) || [];
    const arr = Array.isArray(list) ? list : [];
    const botsToDelete = [];
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      const code = (b && (b.code || b.CODE)) || '';
      if (String(code).indexOf(BOT_CODE_BASE) === 0 && b && (b.id || b.ID)) {
        botsToDelete.push({ id: parseInt(b.id || b.ID), code: String(code) });
      }
    }
    if (botsToDelete.length === 0) { logAction('Старых ботов не найдено', 'info'); return cb(); }
    
    logAction('Найдено ботов: ' + botsToDelete.length + '. Удаляю...', 'info');
    let deleted = 0;
    botsToDelete.forEach(function (bot) {
      BX24.callMethod('imbot.remove', { ID: bot.id }, function (removeRes) {
        if (removeRes.error()) logAction('Бот ID ' + bot.id + ' не удалён (возможно, чужое приложение): ' + describeError(removeRes), 'info');
        else logAction('Бот ID ' + bot.id + ' удалён', 'success');
        deleted++;
        if (deleted === botsToDelete.length) { logAction('Очистка старых ботов завершена', 'success'); cb(); }
      });
    });
  });
}

function clearBotCache() {
  localStorage.removeItem('b24_bot_id');
  localStorage.removeItem('b24_bot_client_id');
  localStorage.removeItem('b24_bot_build_id');
  localStorage.removeItem('b24_bot_code');
  Object.keys(localStorage).filter(function (k) { return k.indexOf('b24_bot_chat_') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  logAction('Кэш бота полностью сброшен', 'info');
}

function needRecreateBot() {
  const cachedBuild = localStorage.getItem('b24_bot_build_id');
  const cachedClient = localStorage.getItem('b24_bot_client_id');
  const cachedCode = localStorage.getItem('b24_bot_code');
  const currentClient = getCurrentClientId();
  const currentCode = getBotCode();
  if (cachedCode && cachedCode !== currentCode) return true;
  if (cachedBuild && cachedBuild !== APP_BUILD_ID) return true;
  if (cachedClient && currentClient && cachedClient !== currentClient) return true;
  if (!cachedBuild && !localStorage.getItem('b24_bot_id')) return true;
  return false;
}

function getBotId(cb, force) {
  const cachedBotId = localStorage.getItem('b24_bot_id');
  if (force || needRecreateBot()) {
    if (needRecreateBot() && !force) logAction('Обнаружено обновление. Пересоздаём бота (код: ' + getBotCode() + ')...', 'info');
    clearBotCache();
    removeAllOldBots(function () { registerNewBot(cb); });
    return;
  }
  if (cachedBotId) return cb(parseInt(cachedBotId));
  removeAllOldBots(function () { registerNewBot(cb); });
}

function registerNewBot(cb) {
  const ourCode = getBotCode();
  logAction('Регистрация нового чат-бота (imbot.v2), код: ' + ourCode + '...', 'info');

  BX24.callMethod('imbot.v2.Bot.register', {
    fields: { code: ourCode, type: 'bot', eventMode: 'fetch', properties: { name: BOT_NAME, workPosition: 'Система уведомлений' } }
  }, (res) => {
    if (res.error()) {
      logAction('Ошибка регистрации бота (v2): ' + describeError(res), 'error');
      // Если уже существует под этим кодом, просто берём его ID
      BX24.callMethod('imbot.v2.Bot.list', {}, function (listRes) {
        if (listRes.error()) return cb(null);
        const list = (listRes.data() && (listRes.data().result || listRes.data())) || [];
        const arr = Array.isArray(list) ? list : [];
        for (let i = 0; i < arr.length; i++) {
          const b = arr[i];
          if (String((b && (b.code || b.CODE)) || '') === String(ourCode) && b && (b.id || b.ID)) {
            const id = parseInt(b.id || b.ID);
            localStorage.setItem('b24_bot_id', id);
            localStorage.setItem('b24_bot_client_id', getCurrentClientId());
            localStorage.setItem('b24_bot_build_id', APP_BUILD_ID);
            localStorage.setItem('b24_bot_code', ourCode);
            return cb(id);
          }
        }
        cb(null);
      });
      return;
    }
    const botId = res.data().bot.id;
    localStorage.setItem('b24_bot_id', botId);
    localStorage.setItem('b24_bot_client_id', getCurrentClientId());
    localStorage.setItem('b24_bot_build_id', APP_BUILD_ID);
    localStorage.setItem('b24_bot_code', ourCode);
    logAction('Бот успешно зарегистрирован (v2), ID: ' + botId, 'success');
    cb(botId);
  });
}

function getBotDialog(botId, userId, cb, force) {
  const key = 'b24_bot_chat_' + userId;
  const cached = localStorage.getItem(key);
  if (cached && !force) return cb(cached);

  const userName = (typeof userNames !== 'undefined' && userNames[userId]) ? userNames[userId] : ('Пользователь ' + userId);
  BX24.callMethod('imbot.v2.Chat.add', {
    botId: botId,
    fields: { title: 'Закупки · ' + userName, userIds: [parseInt(userId)] }
  }, (res) => {
    if (res.error()) { logAction('Ошибка создания чата: ' + describeError(res), 'error'); return cb(null); }
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
    botId: botId, dialogId: dialogId, fields: { message: '[B]' + title + '[/B]\n' + message, keyboard: keyboard }
  }, (res) => {
    if (res.error()) { logAction('Ошибка отправки ботом: ' + describeError(res), 'error'); if (cb) cb(false, true); return; }
    logAction('Бот успешно отправил уведомление в диалог ' + dialogId, 'success');
    if (cb) cb(true, false);
  });
}

function notifyUserViaBot(userId, title, message, links, cb) {
  var retried = false;
  function attempt(force, done) {
    getBotId(function (botId) {
      if (!botId) { logAction('Не удалось получить ID бота', 'error'); return done(false); }
      getBotDialog(botId, userId, function (dialogId) {
        if (!dialogId) { logAction('Не удалось получить dialogId', 'error'); return done(false); }
        botSend(botId, dialogId, title, message, links, function (ok, retryable) { done(ok, retryable); });
      }, force);
    }, force);
  }
  attempt(false, function (ok, retryable) {
    if (ok) { if (cb) cb(true); return; }
    if (!retried) {
      retried = true;
      clearBotCache();
      localStorage.removeItem('b24_bot_chat_' + userId);
      logAction('Повторная попытка отправки с пересозданием бота...', 'info');
      attempt(true, function (ok2) { if (cb) cb(ok2); });
      return;
    }
    if (cb) cb(false);
  });
}