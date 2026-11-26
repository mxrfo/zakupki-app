// js/api/sync.js — Синхронизация менеджеров, загрузка данных, удаление, автообновление

function deletePurchaseWithCleanup(id, done) {
  id = parseInt(id);
  if (!id) { if (done) done(false); return; }
  if (deleteInProgress[id]) return;
  deleteInProgress[id] = true;
  const item = items.find(function (i) { return i.id === id; });
  if (!item) { deleteInProgress[id] = false; if (done) done(false); return; }
  logAction('[ОЧИСТКА] закупка ID ' + id, 'info');
  var tasksToDelete = [];
  [actualFields.taskVyborSotr, actualFields.taskSbor, actualFields.taskZagruz].forEach(function (f) {
    const v = item[f]; if (v && /^\d+$/.test(String(v))) tasksToDelete.push(parseInt(String(v)));
  });
  function finalizeDelete() {
    BX24.callMethod('crm.item.delete', { entityTypeId: ENTITY_TYPE_ID, id: id }, function (res) {
      deleteInProgress[id] = false;
      if (res.error()) { logAction('[ОЧИСТКА] ошибка: ' + getApiErrorMessage(res), 'error'); if (done) done(false); }
      else { items = items.filter(function (i) { return i.id !== id; }); render(); if (done) done(true); }
    });
  }
  if (tasksToDelete.length === 0) { finalizeDelete(); return; }
  var taskBatch = {};
  tasksToDelete.forEach(function (tid, idx) { taskBatch['t' + idx] = ['tasks.task.delete', { taskId: tid }]; });
  BX24.callBatch(taskBatch, function (res) {
    tasksToDelete.forEach(function (tid, idx) { var r = res['t' + idx]; if (r && r.error && r.error() && !/UNKNOWN/i.test(getApiErrorMessage(r))) logAction('[ОЧИСТКА] задача ' + tid + ': ' + getApiErrorMessage(r), 'error'); });
    finalizeDelete();
  });
}

function loadAllData() {
  if (!b24Ready) return;
  if (loadAllDataInProgress) { logAction('Загрузка уже идёт', 'info'); return; }
  loadAllDataInProgress = true;
  logAction('Загрузка списка закупок...', 'info');
  if (items.length === 0) document.getElementById('app-container').innerHTML = '<div class="loading loading-full">Загрузка данных...</div>';
  BX24.callMethod('crm.item.list', { entityTypeId: ENTITY_TYPE_ID, select: ['*', 'UF_*'] }, function (res) {
    loadAllDataInProgress = false;
    if (res.error()) { document.getElementById('app-container').innerHTML = '<div class="error-box">Ошибка: ' + getApiErrorMessage(res) + '</div>'; return; }
    items = res.data().items || [];
    logAction('Данные загружены. Всего: ' + items.length, 'success');
    syncManagersFromTasks(function () { render(); handleUrlParams(); });
  });
}

function syncManagersFromTasks(done) {
  done = done || function () {};
  var need = items.filter(function (i) {
    if (syncManagersInProgress[i.id]) return false;
    var mgr = i[actualFields.manager];
    var has = Array.isArray(mgr) ? mgr.length > 0 : !!mgr;
    var taskId = i[actualFields.taskVyborSotr];
    return !has && taskId && String(taskId).match(/^\d+$/);
  });
  if (need.length === 0) { done(); return; }
  need.forEach(function (i) { syncManagersInProgress[i.id] = true; });
  var batch = {};
  need.forEach(function (i) { batch['t' + i.id] = ['tasks.task.get', { taskId: parseInt(i[actualFields.taskVyborSotr]) }]; });
  BX24.callBatch(batch, function (res) {
    var found = [];
    need.forEach(function (i, idx) {
      var r = (res['t' + i.id]) || (Array.isArray(res) ? res[idx] : null);
      if (!r) { syncManagersInProgress[i.id] = false; return; }
      if (r.error && r.error()) { syncManagersInProgress[i.id] = false; return; }
      var task = (r.data() && r.data().task) || r.data() || {};
      var accomplices = task.accomplices || [];
      var isCompleted = String(task.status) === '5';
      if (accomplices.length > 0) found.push({ item: i, mgrId: String(accomplices[0]) });
      else if (isCompleted && task.responsibleId) found.push({ item: i, mgrId: String(task.responsibleId) });
      else syncManagersInProgress[i.id] = false;
    });
    if (found.length === 0) { done(); return; }
    var pending = found.length;
    var finish = function (itemId) { syncManagersInProgress[itemId] = false; pending--; if (pending === 0) done(); };
    found.forEach(function (f) {
      if (isUserUnavailable(f.mgrId)) {
        logAction('Исполнитель недоступен: ' + (userNames[f.mgrId] || f.mgrId), 'error');
        const headId = resolveDeptHeadId(f.item, true);
        if (headId) sendBotNotification(headId, 'Исполнитель недоступен', greetUser(headId) + '\n\nИсполнитель ' + (userNames[f.mgrId] || f.mgrId) + ' недоступен. Делегируйте закупку №' + f.item.id + '.', [{ text: '📋 Открыть закупку №' + f.item.id, url: buildAppLink('view', f.item.id, 'my_requests') }].filter(l => l.url), null, 'unavail_' + f.item.id);
        finish(f.item.id);
        return;
      }
      var sborStageId = getStageIdByName('сбор данных');
      var updFields = {};
      updFields[actualFields.manager] = [f.mgrId];
      if (sborStageId) updFields.stageId = sborStageId;
      BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(f.item.id), fields: updFields }, function (r2) {
        if (r2.error()) { finish(f.item.id); return; }
        f.item[actualFields.manager] = [f.mgrId];
        if (sborStageId) f.item.stageId = sborStageId;
        groupStatusNotify(f.item, 'assigned');
        if (!f.item[actualFields.taskSbor]) {
          var shortDescText = getShortDesc(f.item);
          var headId = resolveDeptHeadId(f.item, true);
          var createdBy = parseInt(systemUserId) || 1;
          var taskPayload = {
            TITLE: '[🛒] Сбор данных и расчет по закупке',
            RESPONSIBLE_ID: parseInt(f.mgrId),
            CREATED_BY: createdBy,
            DESCRIPTION: 'Необходимо собрать данные по закупке "' + shortDescText + '".',
            STATUS: 2,
            ADD_IN_REPORT: 'Y'
          };
          if (headId) taskPayload.OBSERVERS = [headId];
          BX24.callMethod('tasks.task.add', { fields: taskPayload }, function (tr) {
            if (!tr.error()) {
              var newTaskId = tr.data().task.id;
              logAction('Задача сбора создана (ID: ' + newTaskId + ')', 'success');
              try { notifyCollectData(parseInt(f.mgrId), f.item); } catch (e) { logAction('Ошибка уведомления: ' + e.message, 'error'); }
              BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(f.item.id), fields: { [actualFields.taskSbor]: String(newTaskId) } }, function () {
                f.item[actualFields.taskSbor] = String(newTaskId);
                finish(f.item.id);
              });
            } else { logAction('Ошибка создания задачи сбора: ' + getApiErrorMessage(tr), 'error'); finish(f.item.id); }
          });
        } else finish(f.item.id);
      });
    });
  }, function () { need.forEach(function (i) { syncManagersInProgress[i.id] = false; }); done(); });
}

(function setupAutoRefreshOnFocus() {
  var lastSyncTime = 0;
  var MIN_INTERVAL = 15000;
  var tryReload = function () {
    if (!b24Ready) return;
    var now = Date.now();
    if (now - lastSyncTime < MIN_INTERVAL) return;
    lastSyncTime = now;
    logAction('Возврат во вкладку — автообновление', 'info');
    loadAllData();
    handleUrlParams();
  };
  window.addEventListener('focus', tryReload);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') tryReload(); });
})();

window.deletePurchaseWithCleanup = deletePurchaseWithCleanup;
window.loadAllData = loadAllData;
window.syncManagersFromTasks = syncManagersFromTasks;