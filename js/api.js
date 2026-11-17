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

// Утилита: полный URL портала
function getPortalOrigin() {
  try {
    if (document.referrer) return new URL(document.referrer).origin;
  } catch (e) {}
  return window.location.origin;
}

// Уведомления с кликабельными ссылками
function sendNotificationWithMessage(userId, title, message, itemUrl, taskUrl) {
  userId = parseInt(userId);
  if (!userId || isNaN(userId)) return;

  const portalOrigin = getPortalOrigin();
  const fullTaskUrl = taskUrl ? (taskUrl.startsWith('http') ? taskUrl : portalOrigin + taskUrl) : '';
  const fullItemUrl = itemUrl ? (itemUrl.startsWith('http') ? itemUrl : portalOrigin + itemUrl) : '';

  // 1. Колокольчик
  BX24.callMethod('im.notify', {
    to: userId,
    message: `${title}\n${message}`,
    type: 'SYSTEM',
    link: fullTaskUrl || fullItemUrl || '',
    button_text: (fullTaskUrl || fullItemUrl) ? 'Открыть' : ''
  }, (r) => {
    if (r.error()) {
      logAction(`im.notify (ID ${userId}) не прошёл: ` + getApiErrorMessage(r), 'error');
    }
  });

  // 2. Сообщение в чат (только если диалог существует)
  BX24.callMethod('im.dialog.get', { USER_ID: userId }, (r) => {
    if (r.error() || !r.data() || !r.data().id) return;
    
    let chatMessage = `[B]${title}[/B]\n${message}`;
    if (fullItemUrl) chatMessage += `\n[URL=${fullItemUrl}]📋 Открыть закупку[/URL]`;
    if (fullTaskUrl) chatMessage += `\n[URL=${fullTaskUrl}]✅ Открыть задачу[/URL]`;

    BX24.callMethod('im.message.add', {
      DIALOG_ID: r.data().id,
      MESSAGE: chatMessage
    }, (mr) => {
      if (mr.error()) {
        logAction(`im.message.add не прошёл: ` + getApiErrorMessage(mr), 'error');
      }
    });
  });
}

// Загрузка списка закупок (ОПТИМИЗИРОВАНО: тянем только нужные поля)
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

  // Оптимизация: берем только базовые поля + поля из маппинга
  const baseFields = ['id', 'title', 'stageId', 'createdBy', 'assignedById'];
  const mappedFields = Object.values(settings.mapping).filter(Boolean);
  const selectFields = [...new Set([...baseFields, ...mappedFields])];

  BX24.callMethod('crm.item.list', { 
    entityTypeId: ENTITY_TYPE_ID, 
    select: selectFields 
  }, (res) => {
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
    const found = [];

    need.forEach((i, idx) => {
      const r = (res['t' + i.id]) || (Array.isArray(res) ? res[idx] : null);
      if (!r || (r.error && r.error())) {
        syncManagersInProgress[i.id] = false;
        return;
      }
      
      const taskData = r.data();
      const task = (taskData && taskData.task) || taskData || {};
      const accomplices = task.accomplices || [];
      const status = task.status;
      const responsibleId = task.responsibleId;
      const isCompleted = String(status) === '5';

      if (accomplices.length > 0) {
        found.push({ item: i, mgrId: String(accomplices[0]) });
      } else if (isCompleted && responsibleId) {
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

        if (!f.item[actualFields.taskSbor]) {
          const shortDescText = cleanText(f.item[actualFields.shortDesc]) || f.item.title;
          
          // 🔥 ИСПРАВЛЕНИЕ: Создаем задачу ОТ ИМЕНИ АДМИНИСТРАТОРА (systemUserId), 
          // чтобы избежать ERROR_CORE из-за нехватки прав у обычного сотрудника.
          const adminUserId = parseInt(settings.systemUserId) || 1; 
          const responsibleUserId = parseInt(f.mgrId);

          if (isNaN(responsibleUserId) || responsibleUserId <= 0) {
            logAction(`Критическая ошибка: некорректный ID ответственного (${f.mgrId}) для закупки ${f.item.id}`, 'error');
            finish(f.item.id);
            return;
          }

          const taskPayload = {
            TITLE: '[🛒] Сбор данных и расчет по закупке',
            RESPONSIBLE_ID: responsibleUserId,
            CREATED_BY: adminUserId, // <-- Жёстко задаем админа как постановщика
            DESCRIPTION: `Необходимо собрать данные и рассчитать стоимость по закупке "${shortDescText}".`,
            STATUS: 2, // Новая
            ADD_IN_REPORT: 'Y'
          };

          logAction(`Создание задачи: RESPONSIBLE_ID=${responsibleUserId}, CREATED_BY=${adminUserId}`, 'info');

          BX24.callMethod('tasks.task.add', { fields: taskPayload }, (tr) => {
            if (tr.error()) {
              // Теперь ошибка будет полной и понятной
              logAction(`tasks.task.add ОШИБКА: ${getApiErrorMessage(tr)} | Payload: ${JSON.stringify(taskPayload)}`, 'error');
              finish(f.item.id);
              return;
            }
            
            const newTaskId = tr.data().task.id;
            logAction(`Задача менеджеру создана (ID: ${newTaskId})`, 'success');
            
            try {
              const itemUrl = `${appBaseUrl}?action=view&id=${f.item.id}`;
              const taskUrl = `/company/personal/user/${responsibleUserId}/tasks/task/view/${newTaskId}/`;
              sendNotificationWithMessage(
                responsibleUserId,
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
        }
      }
    }, 500);
  }
}

function getStageIdByName(keyword) {
  const search = keyword.toLowerCase().replace(/ё/g, 'е');
  let stage = (typeof spStagesSorted !== 'undefined' && spStagesSorted) ? spStagesSorted.find(s => s.name.toLowerCase().replace(/ё/g, 'е') === search) : null;
  if (stage) return stage.id;
  stage = (typeof spStagesSorted !== 'undefined' && spStagesSorted) ? spStagesSorted.find(s => s.name.toLowerCase().replace(/ё/g, 'е').includes(search)) : null;
  return stage ? stage.id : null;
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