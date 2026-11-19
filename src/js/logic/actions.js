// ============================================================
// МОДУЛЬ: actions.js
// ============================================================
// js/actions.js — Действия: согласование, отклонение, доработка, откат, отправка в работу

function submitAction(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('action-id').value);
  const type = document.getElementById('action-type').value;
  const comment = document.getElementById('action-comment').value;
  const postponeDate = document.getElementById('action-postpone-date').value;
  let targetStageId = null;
  let fields = {};

  logAction(`Инициализация действия: ${type} для закупки ID ${id}`, 'info');

  // Снятие отложки
  if (type === 'remove_postpone') {
    if (actualFields.postponeDate && fieldDefs[actualFields.postponeDate]) {
      fields[actualFields.postponeDate] = null;
    }
    if (comment && actualFields.comment && fieldDefs[actualFields.comment]) {
      fields[actualFields.comment] = comment;
    }
    if (Object.keys(fields).length === 0) {
      logAction('Нет полей для изменения, обновление пропущено', 'info');
      closeModal('modal-action');
      loadAllData();
      return;
    }
    logAction('Снятие отложенной даты...', 'info');
    BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
      if (res.error()) {
        logAction('Ошибка снятия отложки: ' + getApiErrorMessage(res), 'error');
        showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
      } else {
        logAction('Отложка снята', 'success');
        showToast('Отложка снята');
        closeModal('modal-action');
        loadAllData();
      }
    });
    return;
  }

  // ✅ ОТПРАВКА В РАБОТУ
  if (type === 'send_to_work') {
    if (sendToWorkInProgress[id]) {
      logAction(`Запрос "В работу" уже обрабатывается для закупки ID ${id}, игнорируем повторный клик`, 'info');
      return;
    }
    const item = items.find(i => i.id == id);
    if (!item) return showToast('Закупка не найдена', 'error');

    const existingTaskId = item[actualFields.taskVyborSotr];
    if (existingTaskId && String(existingTaskId).match(/^\d+$/)) {
      logAction(`Задача уже существует (ID: ${existingTaskId}), повторное создание пропущено`, 'info');
      showToast(`Задача уже создана (ID: ${existingTaskId})`, 'info');
      closeModal('modal-action');
      return;
    }

    const submitBtn = document.querySelector('#action-footer-buttons button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.originalText = submitBtn.innerText;
      submitBtn.innerText = 'Создание...';
    }
    sendToWorkInProgress[id] = true;

    const shortDescText = cleanText(item[actualFields.shortDesc]) || item.title;
    let headId = null;

    if (isTestMode) {
      headId = parseInt(currentUser.ID);
    } else {
      const deptId = String(Array.isArray(item[actualFields.dept]) ? item[actualFields.dept][0] : (item[actualFields.dept] || ''));
      headId = settings.deptHeads[deptId] ? parseInt(settings.deptHeads[deptId]) : null;
      if (!headId) {
        const b24Dept = departments.find(d => String(d.ID) === deptId);
        if (b24Dept && b24Dept.UF_HEAD) headId = parseInt(b24Dept.UF_HEAD);
      }
      if (!headId) {
        const existingHead = item[actualFields.deptHead];
        const arr = Array.isArray(existingHead) ? existingHead : (existingHead ? [existingHead] : []);
        if (arr.length) headId = parseInt(arr[0]);
      }
      if (!headId) headId = parseInt(currentUser.ID);

      if (actualFields.deptHead && fieldDefs[actualFields.deptHead]) {
        fields[actualFields.deptHead] = [String(headId)];
        logAction(`deptHead → ${actualFields.deptHead} = ${headId}`, 'info');
      } else {
        logAction(`⚠ Поле deptHead "${actualFields.deptHead}" НЕ найдено в fieldDefs — запись руководителя пропущена`, 'error');
        showToast('Поле «Руководитель отдела» не найдено в CRM — обратитесь к администратору', 'error');
      }
    }

    if (comment && actualFields.comment && fieldDefs[actualFields.comment]) {
      fields[actualFields.comment] = comment;
    }

    const headIdNum = parseInt(headId);
    if (!headIdNum) {
      logAction('ОШИБКА: не определён руководитель (headId)', 'error');
      showToast('Не определён руководитель отдела', 'error');
      sendToWorkInProgress[id] = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = submitBtn.dataset.originalText || 'Отправить'; }
      return;
    }

    logAction(`Отправка в работу: headId=${headIdNum}, поля для обновления: ${Object.keys(fields).join(', ') || '(нет)'}`, 'info');

    const proceedToTask = () => {
      const adminUserId = parseInt(settings.systemUserId) || 1;

      const taskPayload = {
        TITLE: '[🛒] Утверждение исполняющего сотрудника по закупке',
        RESPONSIBLE_ID: headIdNum,
        CREATED_BY: adminUserId,
        DESCRIPTION: `Задача:
1. Выбрать в качестве СОИСПОЛНИТЕЛЯ сотрудника, который будет выполнять сбор данных и расчёт примерной стоимости закупки
2. Завершить задачу
Необходимо закупить:
${shortDescText}`,
        STATUS: 2,
        ADD_IN_REPORT: 'Y'
      };

      if (item[actualFields.deadlineZakup]) {
        const d = new Date(item[actualFields.deadlineZakup]);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() - 1);
          taskPayload.DEADLINE = d.toISOString();
        }
      }

      logAction('Создание задачи для руководителя...', 'info');
      BX24.callMethod('tasks.task.add', { fields: taskPayload }, (taskRes) => {
        if (taskRes.error()) {
          const errMsg = getApiErrorMessage(taskRes);
          logAction(`ОШИБКА СОЗДАНИЯ ЗАДАЧИ: ${errMsg} | Payload: ${JSON.stringify(taskPayload)}`, 'error');
          showToast('Ошибка создания задачи: ' + errMsg, 'error');
          sendToWorkInProgress[id] = false;
          if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = submitBtn.dataset.originalText || 'Отправить'; }
          return;
        }
        const taskId = taskRes.data().task.id;
        logAction(`Задача для руководителя создана (ID: ${taskId})`, 'success');

        try {
          notifySelectExecutor(headIdNum, item, taskId);
        } catch (e) {
          logAction('Ошибка при отправке уведомления руководителю: ' + e.message, 'error');
        }

        const finish = () => {
          sendToWorkInProgress[id] = false;
          showToast('Задача создана', 'success');
          closeModal('modal-action');
          loadAllData();
        };

        if (actualFields.taskVyborSotr && fieldDefs[actualFields.taskVyborSotr]) {
          BX24.callMethod('crm.item.update', {
            entityTypeId: ENTITY_TYPE_ID, id: id,
            fields: { [actualFields.taskVyborSotr]: String(taskId) }
          }, (saveRes) => {
            if (saveRes.error()) {
              logAction('Ошибка сохранения ID задачи: ' + getApiErrorMessage(saveRes), 'error');
            } else {
              item[actualFields.taskVyborSotr] = String(taskId);
              logAction('ID задачи сохранён в закупке', 'success');
            }
            finish();
          });
        } else {
          logAction(`Поле taskVyborSotr (${actualFields.taskVyborSotr}) не найдено в CRM`, 'info');
          finish();
        }
      });
    };

    if (Object.keys(fields).length === 0) {
      logAction('Нет полей для обновления закупки — пропускаем crm.item.update, сразу создаём задачу', 'info');
      proceedToTask();
      return;
    }

    BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
      if (res.error()) {
        const errMsg = getApiErrorMessage(res);
        logAction('Ошибка обновления закупки: ' + errMsg, 'error');
        showToast('Ошибка: ' + errMsg, 'error');
        sendToWorkInProgress[id] = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = submitBtn.dataset.originalText || 'Отправить'; }
        return;
      }
      proceedToTask();
    });
    return;
  }

  // ✅ ОТПРАВКА НА ДОРАБОТКУ — стадия "доработка", комментарий обязателен
  if (type === 'send_to_rework') {
    if (!comment || !comment.trim()) {
      showToast('Для отправки на доработку обязательно укажите комментарий (что исправить)', 'error');
      return;
    }
    targetStageId = getStageIdByName('корректировка');
    if (!targetStageId) {
      logAction('ОШИБКА: стадия "Корректировка" не найдена в справочнике статусов', 'error');
      showToast('Не найдена стадия "Корректировка". Добавьте её в справочник статусов smart-процесса «Закупки» (см. инструкцию).', 'error');
      return;
    }
    const item = items.find(i => i.id == id);
    if (!item) return showToast('Закупка не найдена', 'error');

    fields.stageId = targetStageId;
    if (actualFields.comment && fieldDefs[actualFields.comment]) fields[actualFields.comment] = comment;

    BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
      if (res.error()) {
        logAction('Ошибка отправки на доработку: ' + getApiErrorMessage(res), 'error');
        showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
      } else {
        logAction('Закупка отправлена на доработку', 'success');
        showToast('Отправлено на доработку', 'success');
        try {
          const mgrArr = Array.isArray(item[actualFields.manager]) ? item[actualFields.manager] : (item[actualFields.manager] ? [item[actualFields.manager]] : []);
          const mgrId = mgrArr.length > 0 ? parseInt(mgrArr[0]) : null;
          if (mgrId) notifyReworkNeeded(mgrId, item, comment);
        } catch (e) {
          logAction('Ошибка при отправке уведомления о доработке: ' + e.message, 'error');
        }
        closeModal('modal-action');
        loadAllData();
      }
    });
    return;
  }

  // Остальные действия
  if (type === 'approve_terms') {
    targetStageId = getStageIdByName('загрузка');
  } else if (type === 'reject_terms') {
    targetStageId = getStageIdByName('отмен') || getStageIdByName('провал');
  } else if (type === 'approve_invoice') {
    approvedInvoices[id] = true;
    localStorage.setItem('approved_invoices_1088', JSON.stringify(approvedInvoices));
    targetStageId = items.find(i => i.id == id).stageId;
  } else if (type === 'reject_invoice') {
    targetStageId = getStageIdByName('отмен') || getStageIdByName('провал');
  } else if (type === 'confirm_payment') {
    targetStageId = getStageIdByName('получение заказа') || getStageIdByName('ожидание') || getStageIdByName('успех');
  } else if (type === 'confirm_receipt') {
    targetStageId = getStageIdByName('исполн') || getStageIdByName('успех') || getStageIdByName('заверш');
  }

  if (!targetStageId) {
    logAction('ОШИБКА: Не найдена стадия для перехода!', 'error');
    return showToast('Критическая ошибка: не найдена стадия для перехода.', 'error');
  }

  const item = items.find(i => i.id == id);
  if (!item) return showToast('Закупка не найдена', 'error');

  fields.stageId = targetStageId;
  if (comment && actualFields.comment && fieldDefs[actualFields.comment]) fields[actualFields.comment] = comment;
  if (postponeDate && actualFields.postponeDate && fieldDefs[actualFields.postponeDate]) fields[actualFields.postponeDate] = postponeDate;

  if (type === 'approve_terms') {
    if (actualFields.approver && fieldDefs[actualFields.approver]) {
      fields[actualFields.approver] = [String(currentUser.ID)];
    }
    const amt = calculateTotalAmount(item);
    approvedAmounts[id] = amt;
    localStorage.setItem('approved_amounts_1088', JSON.stringify(approvedAmounts));
  }

  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
    if (res.error()) {
      const err = getApiErrorMessage(res);
      logAction(`ОШИБКА СМЕНЫ СТАДИИ: ${err}`, 'error');
      showToast('Ошибка: ' + err, 'error');
    } else {
      showToast('Статус обновлен', 'success');

      if (type === 'approve_terms' || type === 'reject_terms') {
        try {
          const mgrArr = Array.isArray(item[actualFields.manager]) ? item[actualFields.manager] : (item[actualFields.manager] ? [item[actualFields.manager]] : []);
          const mgrId = mgrArr.length > 0 ? parseInt(mgrArr[0]) : null;
          if (mgrId) {
            notifyAfterDecision(mgrId, item, type === 'approve_terms');
          }
        } catch (e) {
          logAction('Ошибка при отправке уведомления о решении: ' + e.message, 'error');
        }
      }

      closeModal('modal-action');
      loadAllData();
    }
  });
}

// Откат закупки на предыдущую стадию
function rollbackItem(id) {
  if (!confirm('Вернуть закупку на предыдущую стадию?')) return;
  const item = items.find(i => i.id === id);
  const currentStage = spStages[item.stageId];
  const stName = currentStage ? currentStage.name.toLowerCase().replace(/ё/g, 'е') : '';
  let prevStageId = null;

  if (stName.includes('отмен') || stName.includes('провал')) {
    prevStageId = getStageIdByName('сбор данных') || getStageIdByName('создание');
  } else {
    const currentIndex = spStagesSorted.findIndex(s => s.id === item.stageId);
    if (currentIndex <= 0) return showToast('Это первая стадия', 'error');
    for (let i = currentIndex - 1; i >= 0; i--) {
      const prevStName = spStagesSorted[i].name.toLowerCase().replace(/ё/g, 'е');
      if (!prevStName.includes('успех') && !prevStName.includes('провал') && !prevStName.includes('отмен')) {
        prevStageId = spStagesSorted[i].id;
        break;
      }
    }
  }

  if (!prevStageId) return showToast('Не найдена предыдущая рабочая стадия для возврата.', 'error');

  logAction(`Откат закупки ID ${id} на стадию ${prevStageId}`, 'info');
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(id), fields: { stageId: prevStageId } }, (res) => {
    if (res.error()) {
      logAction('Ошибка отката: ' + getApiErrorMessage(res), 'error');
      showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
    } else {
      logAction('Стадия откачена', 'success');
      showToast('Стадия откачена');
      loadAllData();
    }
  });
}