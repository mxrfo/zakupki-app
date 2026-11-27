// js/logic/settings/bot.js — Вкладка "Чат-бот"

function renderBotStatus() {
  const box = document.getElementById('bot-status-box');
  if (!box) return;
  const botId = (settings.botId || localStorage.getItem('b24_bot_id') || '—');
  const chatId = (lastBotStatus.chatId || settings.chatId || localStorage.getItem('b24_group_chat_id') || '—');
  const res = lastBotStatus.result || 'нет данных';
  const ts = lastBotStatus.ts ? new Date(lastBotStatus.ts).toLocaleTimeString('ru-RU') : '—';
  const ok = /ok/.test(res);
  // ✅ FIX: цвета статусов через CSS-переменные
  box.innerHTML = `
    <div class="bot-stat"><span class="bot-stat-label">ID бота</span><span class="bot-stat-value">${botId}</span></div>
    <div class="bot-stat"><span class="bot-stat-label">Последний диалог</span><span class="bot-stat-value">${chatId}</span></div>
    <div class="bot-stat"><span class="bot-stat-label">Последняя доставка</span><span class="bot-stat-value" style="color:${ok ? 'var(--st-success-text)' : 'var(--st-danger-text)'}">${res} @ ${ts}</span></div>
    <div class="bot-stat"><span class="bot-stat-label">Handler</span><span class="bot-stat-value text-word-break">${getBotHandlerUrl() || '—'}</span></div>
    <div class="flex-row-sm">
      <button type="button" class="btn btn-sm btn-primary" onclick="forceCreateGroupChat()">Проверить групповой чат</button>
    </div>
  `;
}

function resetBotChat() {
  if (!confirm('Сбросить диалоги бота? Приложение создаст новые при следующем уведомлении.')) return;
  if (typeof resetAutoChat === 'function') resetAutoChat();
  else { localStorage.removeItem('b24_group_chat_id'); Object.keys(localStorage).filter(function (k) { return k.indexOf('b24_bot_chat_') === 0; }).forEach(function (k) { localStorage.removeItem(k); }); }
  Object.keys(localStorage).filter(function (k) { return k.indexOf('b24_dk_') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  const el = document.getElementById('set-chatid'); if (el) el.value = '';
  logAction('Диалоги бота сброшены. Перезагрузка...', 'info');
  showToast('Диалоги сброшены, перезагрузка...', 'success');
  setTimeout(function () { location.reload(); }, 800);
}

function testBotSend() {
  const uid = parseInt(currentUser.ID, 10);
  logAction('Тестовая отправка (личная) пользователю ' + uid + '...', 'info');
  // ✅ FIX: передаём itemId = currentUser.ID вместо 0
  notifyUserViaBot(uid, 'Тестовое сообщение', 'Проверка ЛИЧНОЙ ветки чат-бота «' + BOT_NAME + '». Если вы видите это в личном чате с ботом — личная доставка работает.', [{ text: '📋 Открыть приложение', url: buildAppLink('view', uid, 'my_requests') }], function (ok) {
    renderBotStatus();
    if (ok) showToast('Личное тестовое сообщение отправлено', 'success');
    else showToast('Личная доставка не удалась — см. логи', 'error');
  }, 'test_' + uid + '_' + Date.now());

  logAction('Тестовая отправка (групповой статус)...', 'info');
  notifyGroupStatus('Тест группового чата', 'Проверка СТАТУСНОЙ доставки в общий чат «' + GROUP_CHAT_TITLE + '». Если видите это здесь — групповая доставка работает.', [uid], function (okG) {
    renderBotStatus();
    if (okG) showToast('Групповой тестовый статус отправлен', 'success');
    else showToast('Групповая доставка не удалась — см. логи', 'error');
  }, 'test_group_' + uid + '_' + Date.now());
}

window.renderBotStatus = renderBotStatus;
window.resetBotChat = resetBotChat;
window.testBotSend = testBotSend;