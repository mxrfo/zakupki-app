// js/api/delegate.js — Делегирование закупки

function delegatePurchase(itemId, toUserId, note, cb) {
  itemId = parseInt(itemId); toUserId = parseInt(toUserId);
  if (!itemId || !toUserId) { logAction('delegatePurchase: invalid args', 'error'); if (cb) cb(false); return; }
  const item = items.find(i => i.id === itemId);
  if (!item) { logAction('delegatePurchase: закупка не найдена', 'error'); if (cb) cb(false); return; }
  if (isUserUnavailable(toUserId)) { showToast('Получатель отмечен как недоступный', 'error'); if (cb) cb(false); return; }
  const mgrVal = item[actualFields.manager];
  const fromId = Array.isArray(mgrVal) ? mgrVal[0] : (mgrVal || '');
  const fromName = fromId ? (userNames[fromId] || fromId) : '—';
  const toName = userNames[toUserId] || toUserId;
  const stamp = new Date().toLocaleString('ru-RU');
  const actorName = currentUser ? (currentUser.NAME + ' ' + (currentUser.LAST_NAME || '')) : '—';
  const line = `[ДЕЛЕГ] ${stamp}: ${fromName} → ${toName} (делегировал: ${actorName})` + (note ? ` | ${note}` : '');
  const histField = actualFields.delegateHistory;
  let existing = histField && item[histField] ? String(item[histField]) : '';
  const newHist = existing ? (existing + '\n' + line) : line;
  const updFields = {};
  updFields[actualFields.manager] = [String(toUserId)];
  if (histField && fieldDefs[histField]) updFields[histField] = newHist;
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: itemId, fields: updFields }, function (res) {
    if (res.error()) { showToast('Ошибка делегирования', 'error'); if (cb) cb(false); return; }
    item[actualFields.manager] = [String(toUserId)];
    if (histField) item[histField] = newHist;
    delegateHistory[itemId] = newHist;
    try { localStorage.setItem('purchase_delegate_history_1088', JSON.stringify(delegateHistory)); } catch (e) {}
    const taskSborId = item[actualFields.taskSbor];
    const afterTask = function () {
      try {
        const title = buildTitle('Закупка делегирована вам', item);
        const message = greetUser(toUserId) + '\n\n' + buildBody(item, { creator: true, sum: true, comment: true }) + '\n\nДелегировал: ' + (fromName || '—') + (note ? ('\nПричина: ' + note) : '');
        const links = [{ text: '📝 Заполнить данные', url: buildAppLink('fill', item.id, 'inbox') }].filter(l => l.url);
        notifyUserViaBot(toUserId, title, message, links, function (ok) { if (!ok) sendBotNotification(toUserId, title, message, links); }, 'delegate_' + itemId + '_' + toUserId);
        groupStatusNotify(item, 'assigned', 'group_assigned_' + itemId + '_' + toUserId);
      } catch (e) { logAction('Ошибка уведомления о делегировании: ' + e.message, 'error'); }
      showToast('Закупка делегирована: ' + toName, 'success');
      loadAllData();
      if (cb) cb(true);
    };
    if (taskSborId && String(taskSborId).match(/^\d+$/)) {
      BX24.callMethod('tasks.task.update', { taskId: parseInt(taskSborId), fieldsToSave: { RESPONSIBLE_ID: toUserId } }, function (tr) {
        if (tr.error()) logAction('Ошибка переназначения задачи сбора: ' + getApiErrorMessage(tr), 'error');
        afterTask();
      });
    } else afterTask();
  });
}

window.delegatePurchase = delegatePurchase;