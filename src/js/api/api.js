// ============================================================
// МОДУЛЬ: api.js — Обёртки над BX24 API
// ============================================================

// Флаг: BX24 SDK загружен и init() успешно отработал
// Устанавливается в src/js/core/init.js после BX24.init()
let b24Ready = false;

// ✅ Утилита: домен портала (надёжно, через BX24.getDomain, а не через CDN)
function getPortalDomain() {
  // 1) Основной источник: SDK знает адрес портала, даже до BX24.init
  try {
    if (typeof BX24 !== 'undefined' && typeof BX24.getDomain === 'function') {
      const d = BX24.getDomain();
      if (d && d.indexOf('cdn-') === -1) return 'https://' + d;
    }
  } catch (e) {}

  // 2) Запасной: параметр DOMAIN в query (если портал его подставил)
  try {
    const m = window.location.search.match(/[?&]DOMAIN=([^&]+)/);
    if (m) {
      const dom = decodeURIComponent(m[1]);
      if (dom && dom.indexOf('cdn-') === -1) return 'https://' + dom;
    }
  } catch (e) {}

  // 3) Запасной: referrer портала
  try {
    if (document.referrer) {
      const o = new URL(document.referrer).origin;
      if (o.indexOf('bitrix24') !== -1 && o.indexOf('cdn-') === -1) return o;
    }
  } catch (e) {}

  // 4) Запасной: текущий origin, если это НЕ CDN
  const origin = window.location.origin;
  if (origin && origin.indexOf('cdn-') === -1) return origin;

  // Не удалось определить портал
  return '';
}

// ✅ Построение ссылки, которая открывает приложение ЧЕРЕЗ ПОРТАЛ (с авторизацией)
// Если задан client_id — открываем кастомное приложение в слайдере через /marketplace/view/
// Иначе — нативную карточку smart-процесса (тоже открывается через портал, всегда работает)
function buildAppLink(action, itemId) {
  const domain = getPortalDomain();
  if (!domain || !itemId) return '';

  const clientId = (settings.clientId || '').trim();
  if (clientId) {
    // Параметры передаются ТОЛЬКО через ключ params[] — иначе не дойдут до приложения
    return domain + '/marketplace/view/' + encodeURIComponent(clientId) +
      '/?params[action]=' + encodeURIComponent(action) +
      '&params[id]=' + encodeURIComponent(itemId);
  }

  // Fallback: стандартная карточка записи smart-процесса
  return domain + '/crm/smartprocess/' + ENTITY_TYPE_ID + '/item/' + itemId + '/';
}

// ✅ Чтение входящих параметров: из placement (открытие через /marketplace/view/),
// затем из query string (legacy/прямые ссылки)
function getIncomingParams() {
  // 1) Открытие через слайдер портала: параметры приходят в placement.info().options
  try {
    if (typeof BX24 !== 'undefined' && BX24.placement && typeof BX24.placement.info === 'function') {
      const info = BX24.placement.info();
      const o = (info && info.options) || {};
      if (o.id) return { action: o.action || 'view', itemId: o.id };
    }
  } catch (e) {}

  // 2) Прямой query string
  try {
    const up = new URLSearchParams(window.location.search);
    if (up.get('id')) return { action: up.get('action') || 'view', itemId: up.get('id') };
  } catch (e) {}

  // 3) Hash (на всякий случай)
  try {
    const h = (window.location.hash || '').replace(/^#/, '');
    if (h) {
      const hp = new URLSearchParams(h);
      if (hp.get('id')) return { action: hp.get('action') || 'view', itemId: hp.get('id') };
    }
  } catch (e) {}

  return { action: '', itemId: '' };
}

// ✅ ОБНОВЛЕНО: уведомления идут через бота, а ссылки строятся НА ПОРТАЛ, а не на CDN
// Сигнатура сохранена обратно-совместимой: 4-й аргумент может быть и старой CDN-ссылкой
function sendNotificationWithMessage(userId, title, message, itemUrl, taskUrl, linkText = 'Начать выполнение') {
  userId = parseInt(userId);
  if (!userId) return;

  const domain = getPortalDomain();

  // Извлекаем itemId из переданного itemUrl (работает и для старых вызовов с CDN-ссылкой ?id=NNN)
  let itemId = '';
  if (itemUrl) {
    const m = String(itemUrl).match(/[?&]id=(\d+)/);
    if (m) itemId = m[1];
  }

  // Формируем ссылку на приложение ЧЕРЕЗ ПОРТАЛ (не на CDN!)
  let fullItemUrl = '';
  if (itemId) {
    fullItemUrl = buildAppLink('view', itemId);
  } else if (itemUrl) {
    fullItemUrl = itemUrl.startsWith('http') ? itemUrl : (domain ? domain + itemUrl : itemUrl);
  }

  // Ссылка на задачу — тоже через портал
  let fullTaskUrl = '';
  if (taskUrl) {
    if (taskUrl.startsWith('http')) fullTaskUrl = taskUrl;
    else if (domain) fullTaskUrl = domain + taskUrl;
    else fullTaskUrl = taskUrl;
  }

  const links = [
    fullItemUrl ? { text: '📋 Открыть закупку', url: fullItemUrl } : null,
    fullTaskUrl ? { text: '✅ ' + linkText, url: fullTaskUrl } : null
  ].filter(function(l) { return l !== null; });

  // 1. Основная отправка через чат-бота (создаст ЛС, если его нет, и даст push/unread)
  notifyUserViaBot(userId, title, message, links, function(success) {
    if (!success) {
      // 2. Fallback: если бот не сработал — колокольчик
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
  // ✅ ЗАЩИТА: не грузим данные, пока BX24 не инициализирован
  if (!b24Ready) {
    logAction('loadAllData вызван до инициализации BX24 — пропуск (ждём init)', 'info');
    return;
  }

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

// Обработка параметров из URL / placement (открытие через портал)
function handleUrlParams() {
  var params = getIncomingParams();
  var itemId = params.itemId;
  var action = params.action;
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
          // Чистим query/hash, чтобы при повторном фокусе не открывалось заново
          try {
            var newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({ path: newUrl }, '', newUrl);
          } catch (e) {}
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
    // ✅ ЗАЩИТА: не обновляем, пока BX24 не инициализирован
    if (!b24Ready) return;
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