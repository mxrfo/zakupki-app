// js/api/scenarios.js — Тестовые сценарии

function changeScenario(val) { currentScenario = val; localStorage.setItem('purchase_scenario', val); showToast('Сценарий: ' + val); }

function runScenarioAfterCreate(itemId) {
  if (!isTestMode || currentScenario === 'none') return;
  if (scenarioRunning[itemId]) return;
  scenarioRunning[itemId] = true;
  var item = items.find(function (i) { return i.id === itemId; });
  if (!item) return;
  var targetStageName = currentScenario === 'upload' ? 'загрузка' : currentScenario === 'approval' ? 'согласование' : 'сбор данных';
  var targetStageId = getStageIdByName(targetStageName);
  if (!targetStageId) { logAction('Стадия "' + targetStageName + '" не найдена', 'error'); return; }
  var fields = { stageId: targetStageId };
  if (actualFields.manager && fieldDefs[actualFields.manager]) fields[actualFields.manager] = [String(currentUser.ID)];
  if (actualFields.deptHead && fieldDefs[actualFields.deptHead]) fields[actualFields.deptHead] = [String(currentUser.ID)];
  if (currentScenario === 'upload' || currentScenario === 'approval') {
    if (!item[actualFields.amountProduct] || parseFloat(item[actualFields.amountProduct]) === 0) fields[actualFields.amountProduct] = 10000;
  }
  BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: parseInt(itemId), fields: fields }, function (res) {
    if (res.error()) logAction('Ошибка сценария: ' + getApiErrorMessage(res), 'error');
    else { showToast('Сценарий: ' + targetStageName); loadAllData(); }
  });
}

window.changeScenario = changeScenario;
window.runScenarioAfterCreate = runScenarioAfterCreate;