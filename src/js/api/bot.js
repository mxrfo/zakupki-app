// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2)
// ============================================================
const BOT_CODE = 'purchase_app_bot';
const BOT_NAME = 'Альтернатива · Закупки';

var lastBotStatus = { botId: '', result: '', ts: 0 };

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

/* ================= РЕГИСТРАЦИЯ БОТА ================= */
let botInFlight = false;
let botQueue = [];
function drainBotQueue(id) { const q = botQueue.slice(); botQueue = []; q.forEach(function (cb) { cb(id); }); }

// ✅ ИСПРАВЛЕНО: imbot.v2.Bot.register принимает параметры НАПРЯМУЮ, без обёртки 'fields'
function registerBotNew(cb) {
  const handler = getBotHandlerUrl();
  logAction('Регистрация бота (v2)... handler=' + handler, 'info');
  BX24.callMethod('imbot.v2.Bot.register', {
    CODE: BOT_CODE,
    TYPE: 'bot',
    EVENT_HANDLER: handler,
    PROPERTIES: { NAME: BOT_NAME, WORK_POSITION: 'Система уведомлений по закупкам' }
  }, (res) => {
    if (res.error()) {
      const errStr = describeError(res);
      logAction('Ошибка регистрации (v2): ' + errStr, 'error');
      if (/NO_AUTH|auth/i.test(errStr)) {
        logAction('❌ Портал не даёт создать бота: проверьте, что в правах приложения включено "Чат-боты" (imbot).', 'error');
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
  // ✅ imbot.v2.Bot.list также принимает параметры напрямую
  BX24.callMethod('imbot.v2.Bot.list', {}, function (res) {
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
    else showToast('Не удалось создать бота — см. логи', 'error');
    cb(botId);
  });
}

/* ================= ОТПРАВКА СООБЩЕНИЙ ================= */

function buildKeyboard(links) {
  // imbot.v2 ожидает массив рядов (массив массивов кнопок)
  const btns = (links || []).filter(function (l) { return l && l.url; }).map(function (l) {
    return { TEXT: l.text, LINK: l.url, BG_COLOR_TOKEN: 'primary' };
  });
  return btns.length ? [btns] : [];
}

// ✅ ИСПРАВЛЕНО: imbot.v2.Chat.Message.send принимает параметры НАПРЯМУЮ
function sendBotMessage(botId, dialogId, title, message, links, cb) {
  const payload = {
    botId: parseInt(botId),
    dialogId: String(dialogId), // Для личного чата dialogId ДОЛЖЕН быть строкой, равной ID пользователя (напр. "265")
    message: '[B]' + title + '[/B]\n' + message,
    keyboard: buildKeyboard(links)
  };

  logAction('Отправка сообщения ботом. dialogId=' + dialogId, 'info');

  BX24.callMethod('imbot.v2.Chat.Message.send', payload, (res) => {
    if (res.error()) {
      logAction('Ошибка imbot.v2.Chat.Message.send: ' + describeError(res), 'error');
      if (cb) cb(false);
      return;
    }
    logAction('Сообщение успешно отправлено в диалог ' + dialogId, 'success');
    lastBotStatus.result = 'ok @ ' + dialogId;
    lastBotStatus.ts = Date.now();
    if (cb) cb(true);
  });
}

// ✅ КЛЮЧЕВОЕ УПРОЩЕНИЕ: Для личных уведомлений нам НЕ НУЖНО создавать чат через imbot.v2.Chat.add.
// Мы можем отправлять сообщения напрямую в личный диалог, указав dialogId = String(userId).
// Битрикс24 автоматически создаст личный чат с ботом, если его еще нет.
function notifyUserViaBot(userId, title, message, links, cb, dedupeBase) {
  const fullKey = dedupeBase ? (dedupeBase + '_' + hashStr(message)) : '';
  if (dedupePass(fullKey)) { if (cb) cb(true); return; }

  getBotId(function (botId) {
    if (!botId) {
      logAction('Не удалось получить ID бота — уведомление пропущено', 'error');
      lastBotStatus.result = 'no bot';
      lastBotStatus.ts = Date.now();
      if (cb) cb(false);
      return;
    }

    // Используем ID пользователя как dialogId для личного чата
    const dialogId = String(userId);

    sendBotMessage(botId, dialogId, title, message, links, function (ok) {
      if (ok) {
        if (cb) cb(true);
      } else {
        logAction('Не удалось доставить сообщение пользователю ' + userId, 'error');
        lastBotStatus.result = 'send fail';
        lastBotStatus.ts = Date.now();
        if (cb) cb(false);
      }
    });
  });
}

function clearBotCache() {
  Object.keys(localStorage).filter(function (k) { return k.indexOf('b24_bot_chat_') === 0 || k.indexOf('b24_dk_') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  logAction('Кэш дедупа сброшен (ID бота сохранён)', 'info');
}