// ============================================================
// МОДУЛЬ: api.js — Обёртки над BX24 API
// ============================================================

// Регистрация бота для отправки уведомлений
function registerNotificationBot(callback) {
  const savedBotId = localStorage.getItem('notification_bot_id');
  if (savedBotId) {
    logAction(`Бот уже зарегистрирован (ID: ${savedBotId})`, 'info');
    if (callback) callback(savedBotId);
    return;
  }
  logAction('Регистрация бота для уведомлений...', 'info');
  BX24.callMethod('im.bot.register', {
    CODE: 'purchase_app_bot',
    TYPE: 'R',
    NAME: 'Альтернатива (Закупки)',
    FIRST_NAME: 'Альтернатива',
    LAST_NAME: 'Бот',
    CONTEXT: 'PURCHASE_APP'
  }, (res) => {
    if (res.error()) {
      logAction('Ошибка регистрации бота: ' + getApiErrorMessage(res), 'error');
      if (callback) callback(null);
      return;
    }
    const botId = res.data().user_id;
    localStorage.setItem('notification_bot_id', botId);
    logAction(`Бот успешно зарегистрирован (ID: ${botId})`, 'success');
    if (callback) callback(botId);
  });
}

// ✅ Утилита: полный URL портала (не CDN приложения)
function getPortalOrigin() {
  try {
    if (document.referrer) return new URL(document.referrer).origin;
  } catch (e) {}
  try {
    if (window.top && window.top.location && window.top.location.origin &&
        window.top.location.origin !== 'null' &&
        !window.top.location.origin.includes('bitrix24.net') === false) {
      // fallback ниже
    }
  } catch (e) {}
  // Fallback: из appBaseUrl вырезаем домен портала, если он там есть
  return window.location.origin;
}

// ✅ ИСПРАВЛЕНО: уведомления с кликабельными ссылками
// im.notify — только plain text + параметр link (клик по уведомлению)
// im.message.add — BB-коды [URL=...], и ТОЛЬКО в существующий диалог (без im.chat.add!)
function sendNotificationWithMessage(userId, title, message, itemUrl, taskUrl) {
  userId = parseInt(userId);
  if (!userId) return;

  const portalOrigin = getPortalOrigin();
  // Полная ссылка на задачу (taskUrl приходит относительным /company/...)
  const fullTaskUrl = taskUrl ? (taskUrl.startsWith('http') ? taskUrl : portalOrigin + taskUrl) : '';
  const fullItemUrl = itemUrl ? (itemUrl.startsWith('http') ? itemUrl : portalOrigin + itemUrl) : '';

  // 1. Колокольчик: текст без ссылок, кликабельность — через link + button_text
  BX24.callMethod('im.notify', {
    to: userId,
    message: `${title}\n${message}`,
    type: 'SYSTEM',
    link: fullTaskUrl || fullItemUrl || '',
    button_text: (fullTaskUrl || fullItemUrl) ? 'Открыть' : ''
  }, (r) => {
    if (r.error()) {
      logAction(`im.notify (ID ${userId}) не прошёл: ` + getApiErrorMessage(r), 'error');
    } else {
      logAction(`Колокольчик отправлен пользователю ID ${userId}`, 'success');
    }
  });

  // 2. Сообщение в чат — только если диалог УЖЕ существует. Никогда не создаём новый чат!
  BX24.callMethod('im.dialog.get', { USER_ID: userId }, (r) => {
    if (r.error() || !r.data() || !r.data().id) {
      logAction(`Диалог с ID ${userId} не найден — в чат не пишем (колокольчика достаточно)`, 'info');
      return;
    }
    // BB-коды: [B], [URL=...] — HTML-теги НЕ поддерживаются
    let chatMessage = `[B]${title}[/B]\n${message}`;
    if (fullItemUrl) chatMessage += `\n[URL=${fullItemUrl}]📋 Открыть закупку[/URL]`;
    if (fullTaskUrl) chatMessage += `\n[URL=${fullTaskUrl}]✅ Открыть задачу[/URL]`;

    BX24.callMethod('im.message.add', {
      DIALOG_ID: r.data().id,
      MESSAGE: chatMessage
    }, (mr) => {
      if (mr.error()) {
        logAction(`im.message.add (ID ${userId}) не прошёл: ` + getApiErrorMessage(mr), 'error');
      } else {
        logAction(`Сообщение отправлено в существующий диалог с ID ${userId}`, 'success');
      }
    });
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
  BX24.callMethod('crm.item.list', { entityTypeId: ENTITY_TYPE_ID, select: ['*', 'UF_*'] }, (res) => {
    loadAllDataInProgress = false;
    if (res.error()) {
      logAction('Ошибка загрузки данных: ' + getApiErrorMessage(res), 'error');
      document.getElementById('app-container').innerHTML = `<div class="error-box">Ошибка загрузки: ${getApiErrorMessage(res)}</div>`;
      return;
    }
    items = res.data().items || [];
    logAction(`Данные загружены. Всего записей: ${items.length}`, 'success');
    syncManagersFromTasks(() => {
      render();
      handleUrlParams();
    });
  });
}

// Функция смены сценария
function changeScenario(val) {
  currentScenario = val;
  localStorage.setItem('purchase_scenario', val);
  logAction(`Сценарий изменён: ${val}`, 'info');
  const labels = {
    none: 'Обычный тест',
    full: 'Полный проход (все роли)',
    upload: 'Тест загрузки счёта',
    approval: 'Тест согласования'
  };
  showToast(`Сценарий: ${labels[val] || val}`);
}

// Автопроход сценария после создания закупки
function runScenarioAfterCreate(itemId) {
  if (!isTestMode || currentScenario === 'none') return;
  if (scenarioRunning[itemId]) return;
  scenarioRunning[itemId] = true;
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  logAction(`Запуск сценария "${currentScenario}" для закупки ID ${itemId}...`, 'info');
  const secDef = fieldDefs[actualFields.section];
  const dirDef = fieldDefs[actualFields.direction];
  const firstSec = secDef && secDef.items && secDef.items.length > 0 ? secDef.items[0].ID : null;
  const firstDir = dirDef && dirDef.items && dirDef.items.length > 0 ? dirDef.items[0].ID : null;
  const secText = firstSec && secDef ? (secDef.items.find(i => String(i.ID) === String(firstSec)) || {}).VALUE : '';
  const dirText = firstDir && dirDef ? (dirDef.items.find(i => String(i.ID) === String(firstDir)) || {}).VALUE : '';
  const combinedText = (secText && dirText) ? `${secText} / ${dirText}` : secText;
  let targetStageName = '';
  if (currentScenario === 'upload') targetStageName = 'загрузка';
  else if (currentScenario === 'approval') targetStageName = 'согласование';
  else if (currentScenario === 'full') targetStageName = 'сбор данных';
  const targetStageId = getStageIdByName(targetStageName);
  if (!targetStageId) {
    logAction(`Не найдена стадия "${targetStageName}" для сценария`, 'error');
    return;
  }
  const fields = { stageId: targetStageId };
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
  logAction(`Автопроход до стадии "${targetStageName}" (ID: ${targetStageId})...`, 'info');
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(itemId), fields: fields }, (res) => {
    if (res.error()) {
      logAction('Ошибка автопрохода сценария: ' + getApiErrorMessage(res), 'error');
    } else {
      logAction(`Сценарий "${currentScenario}" выполнен`, 'success');
      showToast(`Сценарий: закупка на стадии "${targetStageName}"`);
      loadAllData();
    }
  });
}

// Синхронизация менеджера из соисполнителей задачи
function syncManagersFromTasks(done) {
  done = done || function () {};

  const need = items.filter(i => {
    if (syncManagersInProgress[i.id]) return false;
    const mgr = i[actualFields.manager];
    const has = Array.isArray(mgr) ? mgr.length > 0 : !!mgr;
    const taskId = i[actualFields.taskVyborSotr];
    return !has && taskId && String(taskId).match(/^\d+$/);
  });

  if (need.length === 0) { done(); return; }

  need.forEach(i => { syncManagersInProgress[i.id] = true; });
  logAction(`Проверяем соисполнителей задач для ${need.length} закупки(ок)...`, 'info');

  const batch = {};
  need.forEach(i => {
    batch['t' + i.id] = ['tasks.task.get', { taskId: parseInt(i[actualFields.taskVyborSotr]) }];
  });

  BX24.callBatch(batch, (res) => {
    logAction(`Ответ batch получен. Тип: ${Array.isArray(res) ? 'массив' : 'объект'}, ключей: ${Object.keys(res).length}`, 'info');

    const found = [];

    need.forEach((i, idx) => {
      const r = (res['t' + i.id]) || (Array.isArray(res) ? res[idx] : null);
      if (!r) {
        logAction(`Batch: нет ответа по ключу t${i.id} (закупка ID ${i.id})`, 'error');
        syncManagersInProgress[i.id] = false;
        return;
      }
      if (r.error && r.error()) {
        logAction(`Не удалось получить задачу для закупки ID ${i.id}: ` + getApiErrorMessage(r), 'error');
        syncManagersInProgress[i.id] = false;
        return;
      }
      const taskData = r.data();
      const task = (taskData && taskData.task) || taskData || {};

      const accomplices = task.accomplices || [];
      const status = task.status;
      const responsibleId = task.responsibleId;

      logAction(`Задача ${i[actualFields.taskVyborSotr]} (закупка ${i.id}): accomplices=${JSON.stringify(accomplices)}, status=${status}, responsibleId=${responsibleId}`, 'info');

      const isCompleted = String(status) === '5';

      if (accomplices.length > 0) {
        found.push({ item: i, mgrId: String(accomplices[0]) });
      } else if (isCompleted && responsibleId) {
        logAction(`Задача завершена без соисполнителей — используем ответственного ${responsibleId}`, 'info');
        found.push({ item: i, mgrId: String(responsibleId) });
      } else {
        syncManagersInProgress[i.id] = false;
      }
    });

    if (found.length === 0) { done(); return; }

    let pending = found.length;
    const finish = (itemId) => {
      syncManagersInProgress[itemId] = false;
      pending--;
      if (pending === 0) done();
    };

    found.forEach(f => {
      const sborStageId = getStageIdByName('сбор данных');
      const updFields = { [actualFields.manager]: [f.mgrId] };
      if (sborStageId) updFields.stageId = sborStageId;

      logAction(`Запись менеджера ${userNames[f.mgrId] || f.mgrId} в закупку ID ${f.item.id}, поля: ${JSON.stringify(updFields)}`, 'info');

      BX24.callMethod('crm.item.update', {
        entityTypeId: ENTITY_TYPE_ID,
        id: parseInt(f.item.id),
        fields: updFields
      }, (r2) => {
        if (r2.error()) {
          logAction(`Ошибка записи менеджера для ID ${f.item.id}: ` + getApiErrorMessage(r2), 'error');
          finish(f.item.id);
          return;
        }
        f.item[actualFields.manager] = [f.mgrId];
        if (sborStageId) f.item.stageId = sborStageId;
        logAction(`Менеджер ${userNames[f.mgrId] || f.mgrId} записан в закупку ID ${f.item.id}`, 'success');
        if (sborStageId) logAction(`Стадия изменена на "Сбор данных" (ID: ${sborStageId})`, 'success');

        if (!f.item[actualFields.taskSbor]) {
          const shortDescText = cleanText(f.item[actualFields.shortDesc]) || f.item.title;
          const headArr = Array.isArray(f.item[actualFields.deptHead]) ? f.item[actualFields.deptHead] : (f.item[actualFields.deptHead] ? [f.item[actualFields.deptHead]] : []);
          const createdBy = headArr.length > 0 ? parseInt(headArr[0]) : parseInt(currentUser.ID);
          const taskPayload = {
            TITLE: '[🛒] Сбор данных и расчет по закупке',
            RESPONSIBLE_ID: parseInt(f.mgrId),
            CREATED_BY: createdBy,
            DESCRIPTION: `Необходимо собрать данные и рассчитать стоимость по закупке "${shortDescText}".`,
            STATUS: 2,
            ADD_IN_REPORT: 'Y'
          };
          BX24.callMethod('tasks.task.add', { fields: taskPayload }, (tr) => {
            if (!tr.error()) {
              const newTaskId = tr.data().task.id;
              logAction(`Задача менеджеру создана (ID: ${newTaskId})`, 'success');

              try {
                const itemUrl = `${appBaseUrl}?action=view&id=${f.item.id}`;
                const taskUrl = `/company/personal/user/${f.mgrId}/tasks/task/view/${newTaskId}/`;
                sendNotificationWithMessage(
                  parseInt(f.mgrId),
                  'Назначена задача по закупке',
                  `Необходимо собрать данные и рассчитать стоимость по закупке: ${shortDescText}`,
                  itemUrl,
                  taskUrl
                );
              } catch (e) {
                logAction('Ошибка при отправке уведомления менеджеру: ' + e.message, 'error');
              }

              BX24.callMethod('crm.item.update', {
                entityTypeId: ENTITY_TYPE_ID,
                id: parseInt(f.item.id),
                fields: { [actualFields.taskSbor]: String(newTaskId) }
              }, () => {
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
  }, () => {
    need.forEach(i => { syncManagersInProgress[i.id] = false; });
    done();
  });
}

// Обработка параметров из URL
function handleUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const action = urlParams.get('action');
  const itemId = urlParams.get('id');
  if (itemId) {
    let attempts = 0;
    const maxAttempts = 20;
    const checkItemsInterval = setInterval(() => {
      attempts++;
      if (items.length > 0 || attempts >= maxAttempts) {
        clearInterval(checkItemsInterval);
        if (items.length > 0) {
          const id = parseInt(itemId);
          if (action === 'fill') openDataModal(id);
          else if (action === 'upload') openUploadModal(id);
          else if (action === 'approve') openActionModal(id, 'approve_terms');
          else openViewModal(id);
          const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
          window.history.replaceState({ path: newUrl }, '', newUrl);
        } else {
          showToast('Не удалось загрузить данные для автоматического перехода.', 'error');
        }
      }
    }, 500);
  }
}

function getStageIdByName(keyword) {
  const search = keyword.toLowerCase().replace(/ё/g, 'е');
  let stage = spStagesSorted.find(s => s.name.toLowerCase().replace(/ё/g, 'е') === search);
  if (stage) return stage.id;
  stage = spStagesSorted.find(s => s.name.toLowerCase().replace(/ё/g, 'е').includes(search));
  return stage ? stage.id : null;
}

function getNextStageId(currentStageId) {
  const currentIndex = spStagesSorted.findIndex(s => s.id === currentStageId);
  if (currentIndex === -1) return null;
  for (let i = currentIndex + 1; i < spStagesSorted.length; i++) {
    const stName = spStagesSorted[i].name.toLowerCase().replace(/ё/g, 'е');
    if (!stName.includes('успех') && !stName.includes('провал') && !stName.includes('отмен')) {
      return spStagesSorted[i].id;
    }
  }
  return null;
}

// Автообновление при возврате во вкладку (с троттлингом)
(function setupAutoRefreshOnFocus() {
  let lastSyncTime = 0;
  const MIN_INTERVAL = 15000;
  const tryReload = () => {
    const now = Date.now();
    if (now - lastSyncTime < MIN_INTERVAL) return;
    lastSyncTime = now;
    logAction('Возврат во вкладку приложения — автообновление данных...', 'info');
    loadAllData();
  };
  window.addEventListener('focus', tryReload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryReload();
  });
})();