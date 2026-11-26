// js/ui/modals/executor.js — Модалка выбора исполнителя

function openExecutorModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  const taskId = item[actualFields.taskVyborSotr];
  if (!taskId || !String(taskId).match(/^\d+$/)) { showToast('Задача на выбор исполнителя не найдена', 'error'); return; }
  if (item[actualFields.manager] && (Array.isArray(item[actualFields.manager]) ? item[actualFields.manager].length : true)) {
    showToast('Исполнитель уже выбран. Откройте карточку закупки.', 'info');
    openViewModal(id);
    return;
  }
  document.getElementById('executor-id').value = id;
  document.getElementById('executor-task-id').value = taskId;
  document.getElementById('executor-title').innerText = 'Выбор исполнителя — закупка №' + id;
  document.getElementById('executor-desc').value = (getShortDesc(item));

  let deptId = '';
  const deptVal = item[actualFields.dept];
  if (deptVal) deptId = String(Array.isArray(deptVal) ? deptVal[0] : deptVal);

  const sel = document.getElementById('executor-to');
  sel.innerHTML = '<option value="">-- Выберите сотрудника из отдела --</option>';
  const addedIds = new Set();
  let added = 0;
  allUsers.forEach(u => {
    if (String(u.ACTIVE) === 'N') return;
    const depts = Array.isArray(u.UF_DEPARTMENT) ? u.UF_DEPARTMENT : (u.UF_DEPARTMENT ? [u.UF_DEPARTMENT] : []);
    const inDept = deptId ? depts.some(d => String(d) === deptId) : false;
    const isSelf = String(u.ID) === String(currentUser.ID);
    if (inDept || isSelf) {
      sel.innerHTML += `<option value="${u.ID}">${u.LAST_NAME} ${u.NAME}${isSelf ? ' (я)' : ''}${isUserUnavailable(u.ID) ? ' (недоступен)' : ''}</option>`;
      addedIds.add(String(u.ID));
      added++;
    }
  });
  if (added === 0) {
    allUsers.forEach(u => {
      if (String(u.ACTIVE) === 'N') return;
      const self = String(u.ID) === String(currentUser.ID) ? ' (я)' : '';
      sel.innerHTML += `<option value="${u.ID}">${u.LAST_NAME} ${u.NAME}${self}${isUserUnavailable(u.ID) ? ' (недоступен)' : ''}</option>`;
      addedIds.add(String(u.ID));
    });
  }
  if (currentUser && currentUser.ID && !addedIds.has(String(currentUser.ID))) {
    const cu = allUsers.find(u => String(u.ID) === String(currentUser.ID));
    const label = cu ? (cu.LAST_NAME + ' ' + cu.NAME) : (userNames[currentUser.ID] || 'Я');
    sel.innerHTML += `<option value="${currentUser.ID}">${label} (я)</option>`;
  }
  document.getElementById('modal-executor').style.display = 'flex';
}

function submitExecutor(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('executor-id').value);
  const taskId = parseInt(document.getElementById('executor-task-id').value);
  const toUserId = parseInt(document.getElementById('executor-to').value);

  if (!toUserId) return showToast('Выберите сотрудника', 'error');
  if (isUserUnavailable(toUserId)) return showToast('Сотрудник недоступен (отсутствие)', 'error');

  const btn = document.getElementById('btn-executor-save');
  if (btn) { btn.disabled = true; btn.innerText = 'Утверждение...'; }

  const item = items.find(i => i.id === id);
  logAction('Утверждение исполнителя ' + toUserId + ' для закупки ' + id, 'info');

  BX24.callMethod('tasks.task.update', { taskId: taskId, fields: { ACCOMPLICES: [toUserId], STATUS: 5 } }, function (tr) {
    if (tr.error()) {
      logAction('Ошибка обновления задачи: ' + getApiErrorMessage(tr), 'error');
    } else {
      logAction('Задача закрыта, соисполнитель назначен', 'success');
    }

    const sborStageId = getStageIdByName('сбор данных');
    const updFields = {};
    updFields[actualFields.manager] = [String(toUserId)];
    if (sborStageId) updFields.stageId = sborStageId;

    BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: updFields }, function (r2) {
      if (r2.error()) {
        logAction('Ошибка записи менеджера: ' + getApiErrorMessage(r2), 'error');
        if (btn) { btn.disabled = false; btn.innerText = 'Утвердить'; }
        return;
      }
      if (item) {
        item[actualFields.manager] = [String(toUserId)];
        if (sborStageId) item.stageId = sborStageId;
      }
      closeModal('modal-executor');
      if (btn) { btn.disabled = false; btn.innerText = 'Утвердить'; }
      showToast('Исполнитель утверждён: ' + (userNames[toUserId] || toUserId), 'success');

      try {
        if (item) groupStatusNotify(item, 'assigned', 'group_assigned_' + item.id + '_' + toUserId);
      } catch (err) {
        logAction('Ошибка группового статуса: ' + err.message, 'error');
      }

      try {
        if (item && !item[actualFields.taskSbor]) {
          const shortDescText = getShortDesc(item);
          const headId = resolveDeptHeadId(item, true);
          const taskPayload = {
            TITLE: '[🛒] Сбор данных и расчет по закупке',
            RESPONSIBLE_ID: toUserId,
            CREATED_BY: parseInt(systemUserId) || 1,
            DESCRIPTION: 'Необходимо собрать данные по закупке "' + shortDescText + '".',
            STATUS: 2,
            ADD_IN_REPORT: 'Y'
          };
          if (headId) taskPayload.OBSERVERS = [headId];

          BX24.callMethod('tasks.task.add', { fields: taskPayload }, function (tr2) {
            if (!tr2.error()) {
              const newTaskId = tr2.data().task.id;
              notifyCollectData(toUserId, item);
              BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: { [actualFields.taskSbor]: String(newTaskId) } }, function () {
                loadAllData();
              });
            } else {
              loadAllData();
            }
          });
        } else {
          notifyCollectData(toUserId, item);
          loadAllData();
        }
      } catch (err) {
        logAction('Ошибка уведомления менеджера: ' + err.message, 'error');
        loadAllData();
      }
    });
  });
}

window.openExecutorModal = openExecutorModal;
window.submitExecutor = submitExecutor;