// ============================================================
// МОДУЛЬ: bot.js — Чат-бот уведомлений (imbot.v2)
// ============================================================
// ИСПРАВЛЕНО (NO_AUTH_FOUND / 400 на imbot.v2.Chat.Message.send):
// 1. Старый SDK (api.bitrix24.com/api/v1/) отправляет auth в form-теле
//    (application/x-www-form-urlencoded). Новые методы imbot.v2.* такую
//    авторизацию не принимают и возвращают 400 NO_AUTH_FOUND
//    ("не передан ни access-токен, ни код вебхука").
//    Теперь ВСЕ вызовы imbot.v2.* идут прямым fetch с JSON-телом и
//    токеном в query-строке (?auth=...) и в теле — как требует OAuth-
//    сценарий из документации. Остальные методы (crm.*, tasks.*, im.notify)
//    продолжают работать через BX24.callMethod.
// 2. describeError() научилась извлекать реальный код ошибки из объекта
//    ajaxError старого SDK (раньше всегда писалось "UNKNOWN").
// 3. Добавлена обработка expired_token (автообновление токена + повтор),
//    insufficient_scope / NO_AUTH_FOUND (подсказка про scope imbot),
//    BOT_OWNERSHIP_ERROR (перерегистрация бота текущим приложением).
// 4. dialogId нормализуется к формату "chatNNNNN" (требование imbot.v2).
// 5. Если доставка ботом невозможна — резервная отправка через im.notify,
//    чтобы уведомление не терялось.
// Публичные имена функций сохранены: notifyUserViaBot, forceCreateBot,
// clearBotCache, getBotHandlerUrl, lastBotStatus — их используют api.js,
// settings.js, init.js.
// ============================================================

const BOT_CODE = 'purchase_app_bot';
const BOT_NAME = 'Альтернатива · Закупки';
const GROUP_CHAT_TITLE = 'Закупки · Альтернатива';

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
      // Старый SDK: ajaxError.ex = { error, error_description }
      let src = e;
      if (typeof e.getError === 'function') { try { src = e.getError() || e; } catch (_) {} }
      else if (e.ex && typeof e.ex === 'object') { src = e.ex; }
      code = callIfFn(src.error) || callIfFn(src.code) || 'UNKNOWN';
      desc = callIfFn(src.error_description) || callIfFn(src.description) || '';
      if (!desc && typeof e.toString === 'function') {
        const s = e.toString();
        if (s && s.indexOf('[object') !== 0) desc = s;
      }
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

// ✅ dialogId группового чата в imbot.v2 имеет формат "chatNNNNN".
// Если ID вбит руками числом — приводим к правильному формату.
function normalizeGroupDialogId(d) {
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
    // Токен истёк — просим старый SDK обновить пару и повторяем один раз
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
  if (code === 'insufficient_scope') return '❌ У токена приложения нет scope "imbot". Откройте карточку интеграции → права → добавьте "Чат-боты 2.0", пересохраните приложение и обновите страницу.';
  if (code === 'NO_AUTH_FOUND') return '❌ Портал не принял авторизацию imbot.v2. Проверьте scope "imbot" в карточке интеграции и перезагрузите приложение.';
  if (code === 'BOT_OWNERSHIP_ERROR') return '❌ Бот принадлежит другому приложению/токену. Выполняю перерегистрацию бота текущим приложением...';
  return '';
}

/* ================= МЬЮТЕКС СОЗДАНИЯ БОТА ================= */
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

function registerBotNew(cb) {
  const handler = getBotHandlerUrl();
  logAction('Регистрация бота (v2, JSON-rest)... handler=' + handler, 'info');
  restImbotCall('imbot.v2.Bot.register', {
    fields: {
      code: BOT_CODE,
      type: 'bot',
      eventMode: 'fetch',
      handler: handler,
      botToken: getOrCreateBotToken(), // на всякий случай: пригодится для webhook-сценария
      properties: { name: BOT_NAME, workPosition: 'Система уведомлений по закупкам' }
    }
  }, function (r) {
    const res = mkRes(r);
    if (res.error()) {
      const errStr = describeError(res);
      logAction('Ошибка регистрации (v2): ' + errStr, 'error');
      const hint = scopeHint(r.error);
      if (hint) logAction(hint, 'error');
      registerBotV1(cb); // старый SDK для v1-методов работает корректно
      return;
    }
    const botId = extractBotId(res.data());
    if (!botId) { logAction('Не удалось извлечь ID из ответа: ' + JSON.stringify(res.data()), 'error'); return cb(null); }
    localStorage.setItem('b24_bot_id', botId);
    settings.botId = String(botId);
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
  if (manual) { const id = parseInt(manual); if (id) { localStorage.setItem('b24_bot_id', id); logAction('Использую ручной ID бота из настроек: ' + id, 'info'); return cb(id); } }
  const cachedBotId = localStorage.getItem('b24_bot_id');
  if (cachedBotId) return cb(parseInt(cachedBotId));

  if (botInFlight) { logAction('Бот уже создаётся — в очередь', 'info'); botQueue.push(cb); return; }
  botInFlight = true;
  logAction('Поиск существующего бота (код: ' + BOT_CODE + ')...', 'info');
  findBotViaList(function (id) {
    if (id) {
      localStorage.setItem('b24_bot_id', id);
      settings.botId = String(id);
      saveSettingsToBoth();
      logAction('Найден бот через imbot.v2.Bot.list, ID: ' + id, 'success');
      botInFlight = false; cb(id); drainBotQueue(id); return;
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

/* ================= МЬЮТЕКС СОЗДАНИЯ ЧАТА ================= */
let chatInFlight = false;
let chatQueue = [];
function drainChatQueue(id) { const q = chatQueue.slice(); chatQueue = []; q.forEach(function (cb) { cb(id); }); }

// Чат создаётся ПУСТЫМ (userIds: []), бот — владелец диалога,
// пользователь добавляется отдельно через Chat.user.add.
function createGroupChat(botId, cb) {
  logAction('Создание группового чата (пустой, userIds=[])...', 'info');
  restImbotCall('imbot.v2.Chat.add', {
    botId: botId,
    fields: { title: GROUP_CHAT_TITLE, userIds: [] }
  }, function (r) {
    const res = mkRes(r);
    if (res.error()) {
      logAction('Ошибка imbot.v2.Chat.add: ' + describeError(res), 'error');
      const hint = scopeHint(r.error); if (hint) logAction(hint, 'error');
      return cb(null);
    }
    const chatId = extractDialogId(res.data());
    if (!chatId) { logAction('Не удалось извлечь ID чата: ' + JSON.stringify(res.data()), 'error'); return cb(null); }
    localStorage.setItem('b24_group_chat_id', chatId);
    settings.chatId = chatId;
    saveSettingsToBoth();
    lastBotStatus.chatId = chatId;
    logAction('Групповой чат создан (ботом), ID: ' + chatId, 'success');
    cb(chatId);
  });
}

function getGroupChatId(botId, cb) {
  if (settings.chatId) {
    const cid = normalizeGroupDialogId(settings.chatId);
    logAction('Использую чат ID (настроенный/сохранённый): ' + cid, 'info');
    return cb(cid);
  }
  const cached = localStorage.getItem('b24_group_chat_id');
  if (cached) { const cid = normalizeGroupDialogId(cached); logAction('Использую чат ID из localStorage: ' + cid, 'info'); settings.chatId = cid; return cb(cid); }

  if (chatInFlight) { logAction('Чат уже создаётся — в очередь', 'info'); chatQueue.push(cb); return; }
  chatInFlight = true;
  createGroupChat(botId, function (chatId) {
    chatInFlight = false;
    cb(chatId);
    drainChatQueue(chatId);
  });
}

function addUserToGroupChat(botId, chatId, userId, cb) {
  cb = cb || function () {};
  if (!chatId || !userId) return cb();
  restImbotCall('imbot.v2.Chat.user.add', {
    botId: botId,
    dialogId: normalizeGroupDialogId(chatId),
    userIds: [parseInt(userId)]
  }, function (r) {
    const res = mkRes(r);
    if (res.error()) {
      logAction('Добавление пользователя ' + userId + ' в чат ' + chatId + ': ' + describeError(res) + ' (продолжаем)', 'info');
    } else {
      logAction('Пользователь ' + userId + ' добавлен в чат ' + chatId, 'success');
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

// ✅ Главный исправленный вызов: JSON-transport + диагностика кодов ошибок.
// ok=false передаётся наружу, но с честным кодом ошибки вместо UNKNOWN.
function botSendToGroup(botId, chatId, title, message, links, cb, onAuthProblem) {
  restImbotCall('imbot.v2.Chat.Message.send', {
    botId: botId,
    dialogId: normalizeGroupDialogId(chatId),
    fields: { message: '[B]' + title + '[/B]\n' + message, keyboard: buildKeyboard(links) }
  }, function (r) {
    const res = mkRes(r);
    if (res.error()) {
      logAction('Ошибка отправки в чат ' + chatId + ': ' + describeError(res), 'error');
      const hint = scopeHint(r.error);
      if (hint) logAction(hint, 'error');
      const authProblem = /NO_AUTH_FOUND|insufficient_scope|BOT_OWNERSHIP_ERROR|NETWORK|NO_DOMAIN/.test(String(r.error || ''));
      if (authProblem && onAuthProblem) { onAuthProblem(r.error); if (cb) cb(false); return; }
      if (cb) cb(false);
      return;
    }
    logAction('Сообщение отправлено в чат ' + chatId, 'success');
    lastBotStatus.result = 'ok @ ' + chatId; lastBotStatus.ts = Date.now();
    if (cb) cb(true);
  });
}

// Личной чат тоже создаётся пустым + user.add
function sendToPersonalChat(botId, userId, title, message, links, cb) {
  const key = 'b24_bot_chat_' + userId;
  let dialogId = localStorage.getItem(key);
  function sendMsg(dId) { botSendToGroup(botId, dId, title, message, links, cb); }
  if (dialogId) return sendMsg(dialogId);
  restImbotCall('imbot.v2.Chat.add', {
    botId: botId, fields: { title: 'Закупки · ' + (userNames[userId] || userId), userIds: [] }
  }, function (r) {
    const res = mkRes(r);
    if (res.error()) { logAction('Ошибка создания личного чата: ' + describeError(res), 'error'); if (cb) cb(false); return; }
    const dId = extractDialogId(res.data());
    if (!dId) { logAction('Не удалось извлечь ID личного чата', 'error'); if (cb) cb(false); return; }
    localStorage.setItem(key, dId);
    addUserToGroupChat(botId, dId, userId, function () { sendMsg(dId); });
  });
}

// Сбрасывает сохранённый/ручной chatId (localStorage + settings + app.option)
function resetAutoChat() {
  localStorage.removeItem('b24_group_chat_id');
  settings.chatId = '';
  saveSettingsToBoth();
}

// ✅ Резервная доставка: im.notify (работает через обычный access_token
// приложения, старые методы старым SDK не ломаются). Используется только
// когда imbot.v2 принципиально недоступен (нет scope / чужой бот / сеть).
function notifyViaImFallback(userId, title, message, links, cb) {
  logAction('Резервная доставка через im.notify пользователю ' + userId + '...', 'info');
  let text = '[B]' + title + '[/B]\n' + message;
  const firstLink = (links || []).find(function (l) { return l && l.url; });
  if (firstLink) text += '\n[URL=' + firstLink.url + ']' + firstLink.text + '[/URL]';
  BX24.callMethod('im.notify', { USER_ID: parseInt(userId), MESSAGE: text }, function (res) {
    if (res.error()) {
      logAction('im.notify тоже не прошёл: ' + describeError(res) + ' — проверьте scope "im" и "imbot" в карточке интеграции', 'error');
      lastBotStatus.result = 'send fail (fallback too)'; lastBotStatus.ts = Date.now();
      if (cb) cb(false);
      return;
    }
    logAction('Уведомление доставлено через im.notify', 'success');
    lastBotStatus.result = 'ok via im.notify'; lastBotStatus.ts = Date.now();
    if (cb) cb(true);
  });
}

// ✅ Основной поток. При проблемах с авторизацией imbot.v2 — один раз
// перерегистрируем бота, при проблемах с чатом — пересоздаём чат,
// при полном провале — im.notify.
function notifyUserViaBot(userId, title, message, links, cb, dedupeBase) {
  const fullKey = dedupeBase ? (dedupeBase + '_' + hashStr(message)) : '';
  if (dedupePass(fullKey)) { if (cb) cb(true); return; }
  getBotId(function (botId) {
    if (!botId) {
      logAction('Не удалось получить ID бота — уведомление пропущено', 'error');
      lastBotStatus.result = 'no bot'; lastBotStatus.ts = Date.now();
      notifyViaImFallback(userId, title, message, links, cb);
      return;
    }
    getGroupChatId(botId, function (chatId) {
      if (!chatId) {
        logAction('Не удалось получить/создать чат', 'error');
        lastBotStatus.result = 'no chat'; lastBotStatus.ts = Date.now();
        notifyViaImFallback(userId, title, message, links, cb);
        return;
      }

      let ownershipRetried = false;

      const attempt = function (cid, isRetry) {
        addUserToGroupChat(botId, cid, userId, function () {
          botSendToGroup(botId, cid, title, message, links, function (ok) {
            if (ok) { if (cb) cb(true); return; }

            // Проблемы авторизации/владения ботом — перерегистрация бота один раз
            if (!ownershipRetried) {
              ownershipRetried = true;
              logAction('⚠ Проблемы с ботом/авторизацией imbot.v2. Пробую перерегистрировать бота текущим приложением...', 'error');
              localStorage.removeItem('b24_bot_id');
              settings.botId = '';
              saveSettingsToBoth();
              registerBotNew(function (newBotId) {
                if (!newBotId) { notifyViaImFallback(userId, title, message, links, cb); return; }
                createGroupChat(newBotId, function (newChatId) {
                  if (!newChatId) { notifyViaImFallback(userId, title, message, links, cb); return; }
                  const oldCb = cb;
                  notifyUserViaBotFresh(newBotId, newChatId, userId, title, message, links, oldCb);
                });
              });
              return;
            }

            // Битый/чужой чат — пересоздаём пустой чат и повторяем один раз
            if (!isRetry) {
              logAction('⚠ Чат ' + cid + ' не принимает imbot-сообщения (битый/чужой). Пересоздаю пустой чат ботом...', 'error');
              resetAutoChat();
              createGroupChat(botId, function (newId) {
                if (!newId) {
                  logAction('Не удалось пересоздать чат', 'error');
                  lastBotStatus.result = 'chat recreate fail'; lastBotStatus.ts = Date.now();
                  notifyViaImFallback(userId, title, message, links, cb);
                  return;
                }
                logAction('Создан новый чат ' + newId + ', повторяю отправку', 'info');
                attempt(newId, true);
              });
              return;
            }

            logAction('❌ Не удалось доставить сообщение ботом — включаю резервную доставку im.notify.', 'error');
            lastBotStatus.result = 'send fail'; lastBotStatus.ts = Date.now();
            notifyViaImFallback(userId, title, message, links, cb);
          }, function (errCode) {
            // onAuthProblem: NO_AUTH_FOUND / insufficient_scope и т.п.
            lastBotStatus.result = 'auth: ' + errCode; lastBotStatus.ts = Date.now();
          });
        });
      };

      // Повторная доставка уже с новым ботом/чатом (без рекурсивной перерегистрации)
      function notifyUserViaBotFresh(nb, nc, uid, t, m, l, cb2) {
        addUserToGroupChat(nb, nc, uid, function () {
          botSendToGroup(nb, nc, t, m, l, function (ok2) {
            if (ok2) { if (cb2) cb2(true); return; }
            notifyViaImFallback(uid, t, m, l, cb2);
          });
        });
      }

      attempt(chatId, false);
    });
  });
}

// НЕ удаляем b24_bot_id / b24_group_chat_id — они живут на портале и в app.option
function clearBotCache() {
  Object.keys(localStorage).filter(function (k) { return k.indexOf('b24_bot_chat_') === 0 || k.indexOf('b24_dk_') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  logAction('Кэш личных чатов и дедупа сброшен (ID бота и группового чата сохранены)', 'info');
}