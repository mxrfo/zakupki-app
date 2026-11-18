// ============================================================
// МОДУЛЬ: api.js — Обёртки над BX24 API
// ============================================================

// ✅ Утилита: полный URL портала (надежное определение домена)
function getPortalOrigin() {
  const m = window.location.search.match(/[?&]DOMAIN=([^&]+)/);
  if (m) {
    return `https://${decodeURIComponent(m[1])}.bitrix24.ru`;
  }
  try {
    if (document.referrer) {
      const origin = new URL(document.referrer).origin;
      if (origin.includes('bitrix24')) return origin;
    }
  } catch (e) {}
  return window.location.origin;
}

// ✅ ОБНОВЛЕНО: уведомления теперь гарантированно приходят в чат через бота
function sendNotificationWithMessage(userId, title, message, itemUrl, taskUrl, linkText = 'Начать выполнение') {
  userId = parseInt(userId);
  if (!userId) return;

  const portalOrigin = getPortalOrigin();
  const fullTaskUrl = taskUrl ? (taskUrl.startsWith('http') ? taskUrl : portalOrigin + taskUrl) : '';
  const fullItemUrl = itemUrl ? (itemUrl.startsWith('http') ? itemUrl : portalOrigin + itemUrl) : '';

  const links = [
    fullItemUrl ? { text: '📋 Открыть закупку', url: fullItemUrl } : null,
    fullTaskUrl ? { text: '✅ ' + linkText, url: taskUrl } : null
  ].filter(function(l) { return l !== null; });

  // 1. Основная отправка через чат-бота (создаст ЛС, если её нет, и даст push/unread)
  notifyUserViaBot(userId, title, message, links, function(success) {
    if (!success) {
      // 2. Fallback: если бот по какой-то причине не сработал, пробуем старый метод (колокольчик)
      logAction('Fallback: отправка через im.notify', 'info');
      
      let notifyText = title + '\n' + message;
      if (fullTaskUrl) {
        notifyText += '\n[url=' + fullTaskUrl + ']' + linkText + '[/url]';
      } else if (fullItemUrl) {
        notifyText += '\n[url=' + fullItemUrl + ']Открыть закупку[/url]';
      }

      BX24.callMethod('im.notify', {
        to: userId,
        message: notifyText,
        type: 'SYSTEM',
        link: fullTaskUrl || fullItemUrl || '',
        button_text: (fullTaskUrl || fullItemUrl) ? 'Открыть' : ''
      }, function(r) {
        if (r.error()) {
          logAction('im.notify (ID ' + userId + ') не прошёл: ' + getApiErrorMessage(r), 'error');
        }
      });
    }
  });
}

// Загрузка списка закупок
function loadAllData() {
  if (loadAllDataInProgress) {
    logAction('Загрузка уже идёт, пропускаем повторный вызов', 'info');
    return;
  }
  loadAllDataInProgress = true;
  logAction('Загрузка списка закупок...', 'info');
  if (items.length === 0) {
    document.getElementById('app-container').innerHTML = '<div class="loading" style="grid-column: 1/-1;">Загрузка данных...</div>';
  }
  BX24.callMethod('crm.item.list', { entityTypeId: ENTITY_TYPE_ID, select: ['*', 'UF_*'] }, function(res) {
    loadAllDataInProgress = false;
    if (res.error()) {
      logAction('Ошибка загрузки данных: ' + getApiErrorMessage(res), 'error');
      document.getElementById('app-container').innerHTML = '<div class="error-box">Ошибка загрузки: ' + getApiErrorMessage(res) + '</div>';
      return;
    }
    items = res.data().items || [];
    logAction('Данные загружены. Всего записей: ' + items.length, 'success');
    syncManagersFromTasks(function() {
      render();
      handleUrlParams();
    });
  });
}

// Функция смены сценария
function changeScenario(val) {
  currentScenario = val;
  localStorage.setItem('purchase_scenario', val);
  logAction('Сценарий изменён: ' + val, 'info');
  var labels = {
    none: 'Обычный тест',
    full: 'Полный проход (все роли)',
    upload: 'Тест загрузки счёта',
    approval: 'Тест согласования'
  };
  showToast('Сценарий: ' + (labels[val] || val));
}

// Автопроход сценария после создания закупки
function runScenarioAfterCreate(itemId) {
  if (!isTestMode || currentScenario === 'none') return;
  if (scenarioRunning[itemId]) return;
  scenarioRunning[itemId] = true;
  var item = items.find(function(i) { return i.id === itemId; });
  if (!item) return;
  
  logAction('Запуск сценария "' + currentScenario + '" для закупки ID ' + itemId + '...', 'info');
  
  var secDef = fieldDefs[actualFields.section];
  var dirDef = fieldDefs[actualFields.direction];
  var firstSec = secDef && secDef.items && secDef.items.length > 0 ? secDef.items[0].ID : null;
  var firstDir = dirDef && dirDef.items && dirDef.items.length > 0 ? dirDef.items[0].ID : null;
  
  var secText = firstSec && secDef ? (secDef.items.find(function(i) { return String(i.ID) === String(firstSec); }) || {}).VALUE : '';
  var dirText = firstDir && dirDef ? (dirDef.items.find(function(i) { return String(i.ID) === String(firstDir); }) || {}).VALUE : '';
  var combinedText = (secText && dirText) ? (secText + ' / ' + dirText) : secText;
  
  var targetStageName = '';
  if (currentScenario === 'upload') targetStageName = 'загрузка';
  else if (currentScenario === 'approval') targetStageName = 'согласование';
  else if (currentScenario === 'full') targetStageName = 'сбор данных';
  
  var targetStageId = getStageIdByName(targetStageName);
  if (!targetStageId) {
    logAction('Не найдена стадия "' + targetStageName + '" для сценария', 'error');
    return;
  }
  
  var fields = { stageId: targetStageId };
  if (actualFields.manager && fieldDefs[actualFields.manager]) fields[actualFields.manager] = [String(currentUser.ID)];
  if (actualFields.deptHead && fieldDefs[actualFields.deptHead]) fields[actualFields.deptHead] = [String(currentUser.ID)];
  
  if (currentScenario === 'upload' || currentScenario === 'approval') {
    if (firstSec) fields[actualFields.section] = firstSec;
    if (firstDir) fields[actualFields.direction] = firstDir;
    if (combinedText && actualFields.combinedDir) fields[actualFields.combinedDir] = combinedText;
    if (!item[actualFields.amountProduct] || parseFloat(item[actualFields.amountProduct]) === 0) {
      fields[actualFields.amountProduct] = 10000;
    }
  }
  
  logAction('Автопроход до стадии "' + targetStageName + '" (ID: ' + targetStageId + ')...', 'info');
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(itemId), fields: fields }, function(res) {
    if (res.error()) {
      logAction('Ошибка автопрохода сценария: ' + getApiErrorMessage(res), 'error');
    } else {
      logAction('Сценарий "' + currentScenario + '" выполнен', 'success');
      showToast('Сценарий: закупка на стадии "' + targetStageName + '"');
      loadAllData();
    }
  });
}

// Синхронизация менеджера из соисполнителей задачи
function syncManagersFromTasks(done) {
  done = done || function () {};

  var need = items.filter(function(i) {
    if (syncManagersInProgress[i.id]) return false;
    var mgr = i[actualFields.manager];
    var has = Array.isArray(mgr) ? mgr.length > 0 : !!mgr;
    var taskId = i[actualFields.taskVyborSotr];
    return !has && taskId && String(taskId).match(/^\d+$/);
  });

  if (need.length === 0) { done(); return; }

  need.forEach(function(i) { syncManagersInProgress[i.id] = true; });
  logAction('Проверяем соисполнителей задач для ' + need.length + ' закупки(ок)...', 'info');

  var batch = {};
  need.forEach(function(i) {
    batch['t' + i.id] = ['tasks.task.get', { taskId: parseInt(i[actualFields.taskVyborSotr]) }];
  });

  BX24.callBatch(batch, function(res) {
    logAction('Ответ batch получен. Тип: ' + (Array.isArray(res) ? 'массив' : 'объект') + ', ключей: ' + Object.keys(res).length, 'info');

    var found = [];

    need.forEach(function(i, idx) {
      var r = (res['t' + i.id]) || (Array.isArray(res) ? res[idx] : null);
      if (!r) {
        logAction('Batch: нет ответа по ключу t' + i.id + ' (закупка ID ' + i.id + ')', 'error');
        syncManagersInProgress[i.id] = false;
        return;
      }
      if (r.error && r.error()) {
        logAction('Не удалось получить задачу для закупки ID ' + i.id + ': ' + getApiErrorMessage(r), 'error');
        syncManagersInProgress[i.id] = false;
        return;
      }
      var taskData = r.data();
      var task = (taskData && taskData.task) || taskData || {};

      var accomplices = task.accomplices || [];
      var status = task.status;
      var responsibleId = task.responsibleId;

      logAction('Задача ' + i[actualFields.taskVyborSotr] + ' (закупка ' + i.id + '): accomplices=' + JSON.stringify(accomplices) + ', status=' + status + ', responsibleId=' + responsibleId, 'info');

      var isCompleted = String(status) === '5';

      if (accomplices.length > 0) {
        found.push({ item: i, mgrId: String(accomplices[0]) });
      } else if (isCompleted && responsibleId) {
        logAction('Задача завершена без соисполнителей — используем ответственного ' + responsibleId, 'info');
        found.push({ item: i, mgrId: String(responsibleId) });
      } else {
        syncManagersInProgress[i.id] = false;
      }
    });

    if (found.length === 0) { done(); return; }

    var pending = found.length;
    var finish = function(itemId) {
      syncManagersInProgress[itemId] = false;
      pending--;
      if (pending === 0) done();
    };

    found.forEach(function(f) {
      var sborStageId = getStageIdByName('сбор данных');
      var updFields = {};
      updFields[actualFields.manager] = [f.mgrId];
      if (sborStageId) updFields.stageId = sborStageId;

      logAction('Запись менеджера ' + (userNames[f.mgrId] || f.mgrId) + ' в закупку ID ' + f.item.id + ', поля: ' + JSON.stringify(updFields), 'info');

      BX24.callMethod('crm.item.update', {
        entityTypeId: ENTITY_TYPE_ID,
        id: parseInt(f.item.id),
        fields: updFields
      }, function(r2) {
        if (r2.error()) {
          logAction('Ошибка записи менеджера для ID ' + f.item.id + ': ' + getApiErrorMessage(r2), 'error');
          finish(f.item.id);
          return;
        }
        f.item[actualFields.manager] = [f.mgrId];
        if (sborStageId) f.item.stageId = sborStageId;
        logAction('Менеджер ' + (userNames[f.mgrId] || f.mgrId) + ' записан в закупку ID ' + f.item.id, 'success');
        if (sborStageId) logAction('Стадия изменена на "Сбор данных" (ID: ' + sborStageId + ')', 'success');

        if (!f.item[actualFields.taskSbor]) {
          var shortDescText = cleanText(f.item[actualFields.shortDesc]) || f.item.title;
          var headArr = Array.isArray(f.item[actualFields.deptHead]) ? f.item[actualFields.deptHead] : (f.item[actualFields.deptHead] ? [f.item[actualFields.deptHead]] : []);
          var createdBy = headArr.length > 0 ? parseInt(headArr[0]) : parseInt(currentUser.ID);
          var taskPayload = {
            TITLE: '[🛒] Сбор данных и расчет по закупке',
            RESPONSIBLE_ID: parseInt(f.mgrId),
            CREATED_BY: createdBy,
            DESCRIPTION: 'Необходимо собрать данные и рассчитать стоимость по закупке "' + shortDescText + '".',
            STATUS: 2,
            ADD_IN_REPORT: 'Y'
          };
          
          BX24.callMethod('tasks.task.add', { fields: taskPayload }, function(tr) {
            if (!tr.error()) {
              var newTaskId = tr.data().task.id;
              logAction('Задача менеджеру создана (ID: ' + newTaskId + ')', 'success');

              try {
                var itemUrl = appBaseUrl + '?action=view&id=' + f.item.id;
                var taskUrl = '/company/personal/user/' + f.mgrId + '/tasks/task/view/' + newTaskId + '/';
                sendNotificationWithMessage(
                  parseInt(f.mgrId),
                  'Назначена задача по закупке',
                  'Необходимо собрать данные и рассчитать стоимость по закупке: ' + shortDescText,
                  itemUrl,
                  taskUrl,
                  'Начать выполнение'
                );
              } catch (e) {
                logAction('Ошибка при отправке уведомления менеджеру: ' + e.message, 'error');
              }

              BX24.callMethod('crm.item.update', {
                entityTypeId: ENTITY_TYPE_ID,
                id: parseInt(f.item.id),
                fields: { [actualFields.taskSbor]: String(newTaskId) }
              }, function() {
                f.item[actualFields.taskSbor] = String(newTaskId);
                finish(f.item.id);
              });
            } else {
              logAction('Ошибка создания задачи менеджеру: ' + getApiErrorMessage(tr), 'error');
              finish(f.item.id);
            }
          });
        } else {
          finish(f.item.id);
        }
      });
    });
  }, function() {
    need.forEach(function(i) { syncManagersInProgress[i.id] = false; });
    done();
  });
}

// Обработка параметров из URL
function handleUrlParams() {
  var urlParams = new URLSearchParams(window.location.search);
  var action = urlParams.get('action');
  var itemId = urlParams.get('id');
  if (itemId) {
    var attempts = 0;
    var maxAttempts = 20;
    var checkItemsInterval = setInterval(function() {
      attempts++;
      if (items.length > 0 || attempts >= maxAttempts) {
        clearInterval(checkItemsInterval);
        if (items.length > 0) {
          var id = parseInt(itemId);
          if (action === 'fill') openDataModal(id);
          else if (action === 'upload') openUploadModal(id);
          else if (action === 'approve') openActionModal(id, 'approve_terms');
          else openViewModal(id);
          var newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
          window.history.replaceState({ path: newUrl }, '', newUrl);
        } else {
          showToast('Не удалось загрузить данные для автоматического перехода.', 'error');
        }
      }
    }, 500);
  }
}

function getStageIdByName(keyword) {
  var search = keyword.toLowerCase().replace(/ё/g, 'е');
  var stage = spStagesSorted.find(function(s) { return s.name.toLowerCase().replace(/ё/g, 'е') === search; });
  if (stage) return stage.id;
  stage = spStagesSorted.find(function(s) { return s.name.toLowerCase().replace(/ё/g, 'е').includes(search); });
  return stage ? stage.id : null;
}

function getNextStageId(currentStageId) {
  var currentIndex = spStagesSorted.findIndex(function(s) { return s.id === currentStageId; });
  if (currentIndex === -1) return null;
  for (var i = currentIndex + 1; i < spStagesSorted.length; i++) {
    var stName = spStagesSorted[i].name.toLowerCase().replace(/ё/g, 'е');
    if (!stName.includes('успех') && !stName.includes('провал') && !stName.includes('отмен')) {
      return spStagesSorted[i].id;
    }
  }
  return null;
}

// Автообновление при возврате во вкладку (с троттлингом)
(function setupAutoRefreshOnFocus() {
  var lastSyncTime = 0;
  var MIN_INTERVAL = 15000;
  var tryReload = function() {
    var now = Date.now();
    if (now - lastSyncTime < MIN_INTERVAL) return;
    lastSyncTime = now;
    logAction('Возврат во вкладку приложения — автообновление данных...', 'info');
    loadAllData();
  };
  window.addEventListener('focus', tryReload);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') tryReload();
  });
})();