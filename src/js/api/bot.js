// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2)
// ============================================================
// ИСПРАВЛЕНО (по логам 20.11 08:32):
// 1. ERROR_METHOD_NOT_FOUND: в v2 метод называется imbot.v2.Chat.User.add
//    (заглавная U), а не Chat.user.add.
// 2. PARAM_KEYBOARD_ERROR: в v2 клавиатура — объект
//    {BOT_ID, BUTTONS:[{TEXT,LINK,BG_COLOR_TOKEN},{TYPE:'NEWLINE'},...]},
//    а не «массив строк» из старого im.*. При PARAM_KEYBOARD_ERROR —
//    автоповтор без клавиатуры (текст не теряется).
// 3. NO_AUTH_FOUND: все imbot.v2.* идут прямым fetch с JSON-телом и
//    токеном в query (?auth=) — старый SDK шлет form-urlencode, который
//    imbot.v2 не принимает.
// 4. Схема доставки (В1-c): личная ветка (чат бот+получатель, участник
//    добавляется СРАЗУ при создании через fields.userIds) + дубликат в
//    общий чат «ALT · Закупки» (недостающие участники — Chat.User.add,
//    идемпотентен). im.notify — только аварийный резерв (В3).
// 5. Битые/чужие чаты пересоздаются автоматически (В4), ручной botId
//    имеет приоритет (В5). Имя бота приводится к «ALT · Закупки».
// Публичные имена сохранены: notifyUserViaBot, forceCreateBot,
// clearBotCache, getBotHandlerUrl, lastBotStatus — их используют
// api.js, settings.js, init.js.
// ============================================================

const BOT_CODE = 'purchase_app_bot';
const BOT_NAME = 'ALT · Закупки';
const GROUP_CHAT_TITLE = 'ALT · Закупки';

// Живой статус для админки
var lastBotStatus = { botId: '', chatId: '', result: '', ts: 0 };

function callIfFn(v) {
  if (typeof v === 'function') { try { return v(); } catch (e) { return ''; } }
  return v;
}

function describeError(res) {
  try {
    const e = res.error();
    if (!e) return 'Код ошибки: UNKNOWN';
    let code = 'UNKNOWN', desc = '';
    if (typeof e === 'string') {
      code = e;
    } else if (typeof e === 'object') {
      let src = e;
      if (typeof e.getError === 'function') { try { src = e.getError() || e; } catch (_) {} }
      else if (e.ex && typeof e.ex === 'object') { src = e.ex; }
      code = callIfFn(src.error) || callIfFn(src.code) || 'UNKNOWN';
      desc = callIfFn(src.error_description) || callIfFn(src.description) || '';
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

function extractDialogId(d) {
  if (!d) return null;
  const chatData = d.chat || d;
  return chatData.dialogId || chatData.id || d.dialogId || d.CHAT_ID || d.id || null;
}

// dialogId группового чата в imbot.v2 имеет формат "chatNNNNN".
function normalizeDialogId(d) {
  const s = String(d || '');
  if (/^chat\d+$/i.test(s)) return 'chat' + s.replace(/^chat/i, '');
  if (/^\d+$/.test(s)) return 'chat' + s;
  return s;
}

/* ================= REST-ТРАНСПОРТ ДЛЯ imbot.v2 =================
   Обход бага старого SDK: auth передаётся в query-строке И в JSON-теле. */
function getRestDomain() {
  try {
    if (typeof BX24 !== 'undefined' && BX24.getDomain) {
      const d = BX24.getDomain();
      if (d && d.indexOf('cdn') === -1) return 'https://' + d;
    }
  } catch (e) {}
  try { if (window.__portalDomain) return window.__portalDomain; } catch (e) {}
  try { if (typeof getPortalDomain === 'function') { const d = getPortalDomain(); if (d) return d; } } catch (e) {}
  return '';
}

function getRestAuth() {
  try {
    const a = BX24.getAuth();
    if (a && a.access_token) return a;
  } catch (e) {}
  return null;
}

// result: { ok, result, error, error_description, status }
function restImbotCall(method, payload, cb, _retried) {
  const done = function (r) { if (cb) cb(r); };
  const domain = getRestDomain();
  const auth = getRestAuth();

  if (!domain) { done({ ok: false, error: 'NO_DOMAIN', error_description: 'Не определён адрес портала' }); return; }

  if (!auth || !auth.access_token) {
    if (!_retried && typeof BX24 !== 'undefined' && BX24.refreshAuth) {
      _retried = true;
      try { BX24.refreshAuth(function () { restImbotCall(method, payload, cb, true); }); return; }
      catch (e) { done({ ok: false, error: 'NO_AUTH_FOUND', error_description: 'Нет доступа к токену портала' }); return; }
    }
    done({ ok: false, error: 'NO_AUTH_FOUND', error_description: 'Приложение открыто без авторизации портала' });
    return;
  }

  const body = Object.assign({}, payload, { auth: auth.access_token });
  const url = domain + '/rest/' + encodeURIComponent(method) + '.json?auth=' + encodeURIComponent(auth.access_token);

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
    .then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        return { status: r.status, data: data };
      });
    })
    .then(function (pack) {
      const data = pack.data || {};
      if (data && data.error) {
        const code = String(data.error);
        if (code === 'expired_token' && !_retried) {
          _retried = true;
          try { BX24.refreshAuth(function () { restImbotCall(method, payload, cb, true); }); return; } catch (e) {}
        }
        done({ ok: false, error: code, error_description: data.error_description || '', status: pack.status });
        return;
      }
      done({ ok: true, result: (data && data.result !== undefined) ? data.result : data, status: pack.status });
    })
    .catch(function (err) {
      done({ ok: false, error: 'NETWORK', error_description: String((err && err.message) || err) });
    });
}

// Обёртка, совместимая со старым кодом: res.error() / res.data()
function mkRes(r) {
  return {
    error: function () { return r.ok ? false : { error: r.error, error_description: r.error_description }; },
    data: function () { return r.ok ? r.result : (r.data || null); }
  };
}

function scopeHint(code) {
  if (code === 'insufficient_scope') return '❌ У токена приложения нет scope "imbot". Откройте карточку интеграции → права → добавьте "Чат-боты 2.0", пересохраните и обновите страницу.';
  if (code === 'NO_AUTH_FOUND') return '❌ Портал не принял авторизацию imbot.v2. Проверьте scope "imbot" и перезагрузите приложение.';
  if (code === 'BOT_OWNERSHIP_ERROR') return '❌ Бот принадлежит другому приложению. Выполняю перерегистрацию бота текущим приложением...';
  return '';
}

/* ================= БОТ: регистрация / поиск / имя ================= */
let botInFlight = false;
let botQueue = [];
function drainBotQueue(id) {
  const q = botQueue.slice(); botQueue = [];
  q.forEach(function (cb) { cb(id); });
}

function getOrCreateBotToken() {
  let t = localStorage.getItem('b24_bot_token');
  if (!t) {
    t = 'pab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('b24_bot_token', t);
  }
  return t;
}

// ✅ Приведение имени существующего бота к «ALT · Закупки» (однократно)
function ensureBotName(botId) {
  if (localStorage.getItem('b24_bot_named_' + botId) === '1') return;
  restImbotCall('imbot.v2.Bot.update', {
    botId: botId,
    fields: { properties: { name: BOT_NAME, workPosition: 'Система уведомлений по закупкам' } }
  }, function (r) {
    if (r.ok) {
      localStorage.setItem('b24_bot_named_' + botId, '1');
      logAction('Имя бота обновлено на «' + BOT_NAME + '»', 'success');
    } else {
      logAction('Bot.update (имя): ' + (r.error || '') + ' — не критично', 'info');
    }
  });
}

function registerBotNew(cb) {
  const handler = getBotHandlerUrl();
  logAction('Регистрация бота (v2, JSON-rest)... handler=' + handler, 'info');
  restImbotCall('imbot.v2.Bot.register', {
    fields: {
      code: BOT_CODE,
      type: 'bot',
      eventMode: 'fetch',
      handler: handler,
      botToken: getOrCreateBotToken(),
      properties: { name: BOT_NAME, workPosition: 'Система уведомлений по закупкам' }
    }
  }, function (r) {
    const res = mkRes(r);
    if (res.error()) {
      logAction('Ошибка регистрации (v2): ' + describeError(res), 'error');
      const hint = scopeHint(r.error);
      if (hint) logAction(hint, 'error');
      registerBotV1(cb);
      return;
    }
    const botId = extractBotId(res.data());
    if (!botId) { logAction('Не удалось извлечь ID из ответа: ' + JSON.stringify(res.data()), 'error'); return cb(null); }
    localStorage.setItem('b24_bot_id', botId);
    settings.botId = String(botId);
    saveSettingsToBoth();
    logAction('Бот зарегистрирован (v2), ID: ' + botId, 'success');
    ensureBotName(botId);
    cb(botId);
  });
}

function registerBotV1(cb) {
  logAction('Резервная регистрация (v1)...', 'info');
  BX24.callMethod('imbot.register', {
    CODE: BOT_CODE, TYPE: 'bot', NAME: BOT_NAME,
    FIRST_NAME: 'ALT', LAST_NAME: 'Закупки', EVENT_HANDLER: getBotHandlerUrl()
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
  restImbotCall('imbot.v2.Bot.list', { fields: {} }, function (r) {
    const res = mkRes(r);
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
  if (manual) {
    const id = parseInt(manual);
    if (id) { localStorage.setItem('b24_bot_id', id); logAction('Использую ручной ID бота из настроек: ' + id, 'info'); ensureBotName(id); return cb(id); }
  }
  const cachedBotId = localStorage.getItem('b24_bot_id');
  if (cachedBotId) { const id = parseInt(cachedBotId); ensureBotName(id); return cb(id); }

  if (botInFlight) { logAction('Бот уже создаётся — в очередь', 'info'); botQueue.push(cb); return; }
  botInFlight = true;
  logAction('Поиск существующего бота (код: ' + BOT_CODE + ')...', 'info');
  findBotViaList(function (id) {
    if (id) {
      localStorage.setItem('b24_bot_id', id);
      settings.botId = String(id);
      saveSettingsToBoth();
      logAction('Найден бот через imbot.v2.Bot.list, ID: ' + id, 'success');
      botInFlight = false; ensureBotName(id); cb(id); drainBotQueue(id); return;
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
    if (botId) { lastBotStatus.botId = botId; logAction('Бот создан, ID: ' + botId, 'success'); showToast('Бот создан, ID: ' + botId, 'success'); }
    else showToast('Не удалось создать бота — см. логи', 'error');
    cb(botId);
  });
}

/* ================= ГРУППОВОЙ ЧАТ «ALT · Закупки» ================= */
let chatInFlight = false;
let chatQueue = [];
function drainChatQueue(id) { const q = chatQueue.slice(); chatQueue = []; q.forEach(function (cb) { cb(id); }); }

// ✅ Чат создаётся СРАЗУ с получателем (fields.userIds) — бот автоматически
// становится владельцем/участником, человек — участником.
function createGroupChat(botId, seedUserId, cb) {
  const userIds = [];
  if (seedUserId) userIds.push(parseInt(seedUserId));
  logAction('Создание группового чата «' + GROUP_CHAT_TITLE + '» (userIds=[' + userIds.join(',') + '])...', 'info');
  restImbotCall('imbot.v2.Chat.add', {
    botId: botId,
    fields: { title: GROUP_CHAT_TITLE, userIds: userIds }
  }, function (r) {
    const res = mkRes(r);
    if (res.error()) {
      logAction('Ошибка imbot.v2.Chat.add: ' + describeError(res), 'error');
      const hint = scopeHint(r.error); if (hint) logAction(hint, 'error');
      return cb(null);
    }
    const chatId = extractDialogId(res.data());
    if (!chatId) { logAction('Не удалось извлечь ID чата: ' + JSON.stringify(res.data()), 'error'); return cb(null); }
    const cid = normalizeDialogId(chatId);
    localStorage.setItem('b24_group_chat_id', cid);
    settings.chatId = cid;
    saveSettingsToBoth();
    lastBotStatus.chatId = cid;
    logAction('Групповой чат создан, ID: ' + cid, 'success');
    cb(cid);
  });
}

function getGroupChatId(botId, seedUserId, cb) {
  if (settings.chatId) { const cid = normalizeDialogId(settings.chatId); logAction('Использую групповой чат: ' + cid, 'info'); return cb(cid); }
  const cached = localStorage.getItem('b24_group_chat_id');
  if (cached) { const cid = normalizeDialogId(cached); logAction('Использую групповой чат из localStorage: ' + cid, 'info'); settings.chatId = cid; return cb(cid); }

  if (chatInFlight) { logAction('Чат уже создаётся — в очередь', 'info'); chatQueue.push(cb); return; }
  chatInFlight = true;
  createGroupChat(botId, seedUserId, function (chatId) {
    chatInFlight = false;
    cb(chatId);
    drainChatQueue(chatId);
  });
}

// ✅ Правильное имя метода: imbot.v2.Chat.User.add (заглавная U).
// Идемпотентен: уже состоящих и несуществующих пропускает без ошибки.
function addUserToChat(botId, chatId, userId, cb) {
  cb = cb || function () {};
  if (!chatId || !userId) return cb();
  restImbotCall('imbot.v2.Chat.User.add', {
    botId: botId,
    dialogId: normalizeDialogId(chatId),
    userIds: [parseInt(userId)]
  }, function (r) {
    const res = mkRes(r);
    if (res.error()) {
      logAction('Chat.User.add (' + userId + ' → ' + chatId + '): ' + describeError(res) + ' (продолжаем)', 'info');
    } else {
      logAction('Пользователь ' + userId + ' в чате ' + chatId, 'success');
    }
    cb();
  });
}

/* ================= ОТПРАВКА СООБЩЕНИЙ ================= */

// ✅ Формат клавиатуры imbot.v2: {BOT_ID, BUTTONS:[...]} с полями в ВЕРХНЕМ
// регистре; кнопки на отдельных строках через {TYPE:'NEWLINE'}.
function buildKeyboard(botId, links) {
  const btns = [];
  (links || []).forEach(function (l) {
    if (!l || !l.url) return;
    if (btns.length) btns.push({ TYPE: 'NEWLINE' });
    btns.push({ TEXT: l.text, LINK: l.url, BG_COLOR_TOKEN: 'primary' });
  });
  return btns.length ? { BOT_ID: parseInt(botId), BUTTONS: btns } : null;
}

// ok=false + reason: 'keyboard' | 'chat' | 'auth' | 'other'
function botSendOnce(botId, dialogId, title, message, links, withKeyboard, cb) {
  const fields = { message: '[B]' + title + '[/B]\n' + message };
  if (withKeyboard) {
    const kb = buildKeyboard(botId, links);
    if (kb) fields.keyboard = kb;
  }
  restImbotCall('imbot.v2.Chat.Message.send', {
    botId: botId,
    dialogId: normalizeDialogId(dialogId),
    fields: fields
  }, function (r) {
    if (r.ok) {
      logAction('Сообщение отправлено в ' + dialogId + (withKeyboard ? '' : ' (без кнопок)'), 'success');
      return cb({ ok: true });
    }
    const code = String(r.error || '');
    logAction('Ошибка отправки в ' + dialogId + ': ' + describeError(mkRes(r)), 'error');
    const hint = scopeHint(code);
    if (hint) logAction(hint, 'error');

    if (code === 'PARAM_KEYBOARD_ERROR' && withKeyboard) {
      // ✅ Повтор без клавиатуры — текст дойдёт в любом случае
      logAction('Повторяю отправку без клавиатуры...', 'info');
      return botSendOnce(botId, dialogId, title, message, links, false, cb);
    }
    let reason = 'other';
    if (/CHAT_NOT_FOUND|ACCESS_DENIED|PARAM_DIALOG|NOT_FOUND/i.test(code)) reason = 'chat';
    else if (/NO_AUTH|insufficient_scope|BOT_OWNERSHIP|NETWORK|NO_DOMAIN|expired_token/i.test(code)) reason = 'auth';
    cb({ ok: false, reason: reason, code: code });
  });
}

/* ================= ЛИЧНАЯ ВЕТКА (чат бот + получатель) ================= */
function ensurePersonalChat(botId, userId, cb) {
  const key = 'b24_bot_chat_' + userId;
  const cached = localStorage.getItem(key);
  if (cached) return cb(normalizeDialogId(cached));
  const name = (typeof userNames !== 'undefined' && userNames[userId]) ? userNames[userId] : ('ID ' + userId);
  logAction('Создание личного чата с ' + name + '...', 'info');
  restImbotCall('imbot.v2.Chat.add', {
    botId: botId,
    fields: { title: 'ALT · Закупки: ' + name, userIds: [parseInt(userId)] }
  }, function (r) {
    const res = mkRes(r);
    if (res.error()) { logAction('Ошибка создания личного чата: ' + describeError(res), 'error'); return cb(null); }
    const dId = extractDialogId(res.data());
    if (!dId) { logAction('Не удалось извлечь ID личного чата', 'error'); return cb(null); }
    const cid = normalizeDialogId(dId);
    localStorage.setItem(key, cid);
    logAction('Личный чат создан: ' + cid, 'success');
    cb(cid);
  });
}

// Личная доставка с одним пересозданием чата при проблеме
function deliverPersonal(botId, userId, title, message, links, cb) {
  function attempt(recreated) {
    ensurePersonalChat(botId, userId, function (cid) {
      if (!cid) return cb(false);
      botSendOnce(botId, cid, title, message, links, true, function (r) {
        if (r.ok) return cb(true);
        if (r.reason === 'chat' && !recreated) {
          logAction('⚠ Личный чат ' + cid + ' битый — пересоздаю...', 'error');
          localStorage.removeItem('b24_bot_chat_' + userId);
          return attempt(true);
        }
        cb(false);
      });
    });
  }
  attempt(false);
}

// Сбрасывает сохранённый/ручной chatId группового чата
function resetAutoChat() {
  localStorage.removeItem('b24_group_chat_id');
  settings.chatId = '';
  saveSettingsToBoth();
}

// Групповая доставка: добавить недостающего → отправить; при проблеме чата —
// одно пересоздание чата (с этим же получателем) и повтор.
function deliverGroup(botId, userId, title, message, links, cb) {
  function attempt(recreated) {
    getGroupChatId(botId, recreated ? userId : null, function (cid) {
      if (!cid) return cb(false);
      addUserToChat(botId, cid, userId, function () {
        botSendOnce(botId, cid, title, message, links, true, function (r) {
          if (r.ok) { lastBotStatus.chatId = cid; return cb(true); }
          if ((r.reason === 'chat' || r.reason === 'auth') && !recreated) {
            logAction('⚠ Групповой чат ' + cid + ' не принимает сообщения — пересоздаю...', 'error');
            resetAutoChat();
            return attempt(true);
          }
          cb(false);
        });
      });
    });
  }
  attempt(false);
}

/* ================= РЕЗЕРВНАЯ ДОСТАВКА (im.notify) ================= */
function notifyViaImFallback(userId, title, message, links, cb) {
  logAction('Резервная доставка через im.notify пользователю ' + userId + '...', 'info');
  let text = '[B]' + title + '[/B]\n' + message;
  const firstLink = (links || []).find(function (l) { return l && l.url; });
  if (firstLink) text += '\n[URL=' + firstLink.url + ']' + firstLink.text + '[/URL]';
  BX24.callMethod('im.notify', { USER_ID: parseInt(userId), MESSAGE: text }, function (res) {
    if (res.error()) {
      logAction('im.notify тоже не прошёл: ' + describeError(res) + ' — проверьте scope "im" в карточке интеграции', 'error');
      lastBotStatus.result = 'send fail (fallback too)'; lastBotStatus.ts = Date.now();
      if (cb) cb(false);
      return;
    }
    logAction('Уведомление доставлено через im.notify', 'success');
    lastBotStatus.result = 'ok via im.notify'; lastBotStatus.ts = Date.now();
    if (cb) cb(true);
  });
}

/* ================= ОСНОВНОЙ ПОТОК (В1-c: личная + групповая) ================= */
function notifyUserViaBot(userId, title, message, links, cb, dedupeBase) {
  const fullKey = dedupeBase ? (dedupeBase + '_' + hashStr(message)) : '';
  if (dedupePass(fullKey)) { if (cb) cb(true); return; }

  getBotId(function (botId) {
    if (!botId) {
      logAction('Не удалось получить ID бота — резервная доставка', 'error');
      lastBotStatus.result = 'no bot'; lastBotStatus.ts = Date.now();
      notifyViaImFallback(userId, title, message, links, cb);
      return;
    }
    lastBotStatus.botId = botId;

    let personalOk = false, groupOk = false, finished = false, pending = 2;

    const finish = function () {
      if (finished) return;
      finished = true;
      const both = personalOk && groupOk;
      const any = personalOk || groupOk;
      lastBotStatus.result = any ? ('ok' + (both ? ' (личн+общ) ' : ' (частично) ')) : 'fail';
      lastBotStatus.ts = Date.now();
      if (any) {
        if (!both) logAction('⚠ Доставка неполная: личная=' + personalOk + ', групповая=' + groupOk, 'info');
        if (cb) cb(true);
      } else {
        logAction('❌ Бот не доставил ни в личную, ни в групповую ветку — im.notify', 'error');
        notifyViaImFallback(userId, title, message, links, cb);
      }
    };

    const onBranch = function (setter) {
      return function (ok) { setter(ok); if (--pending > 0) return; finish(); };
    };

    deliverPersonal(botId, userId, title, message, links, onBranch(function (ok) { personalOk = ok; }));
    deliverGroup(botId, userId, title, message, links, onBranch(function (ok) { groupOk = ok; }));
  });
}

// НЕ удаляем b24_bot_id / b24_group_chat_id — они живут на портале и в app.option
function clearBotCache() {
  Object.keys(localStorage).filter(function (k) { return k.indexOf('b24_bot_chat_') === 0 || k.indexOf('b24_dk_') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  logAction('Кэш личных чатов и дедупа сброшен (ID бота и группового чата сохранены)', 'info');
}