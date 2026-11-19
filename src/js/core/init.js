// js/init.js — Инициализация приложения

window.addEventListener('error', function (ev) {
  try { if (typeof logAction === 'function') logAction('JS ERROR: ' + (ev.message || 'unknown') + ' @ ' + (ev.filename || '') + ':' + (ev.lineno || ''), 'error'); } catch (e) {}
});
window.addEventListener('unhandledrejection', function (ev) {
  try { if (typeof logAction === 'function') logAction('UNHANDLED REJECTION: ' + (ev.reason && ev.reason.message ? ev.reason.message : ev.reason), 'error'); } catch (e) {}
});

function setLoadingStep(step, total) {
  const container = document.getElementById('app-container');
  const pct = Math.round((step / total) * 100);
  container.innerHTML = `<div class="loading" style="grid-column: 1/-1;"><div style="margin-bottom:12px;">Загрузка данных... ${pct}%</div><div style="width:300px; height:6px; background:#e2e8f0; border-radius:3px; margin:0 auto; overflow:hidden;"><div style="width:${pct}%; height:100%; background:var(--brand-blue); transition:width 0.3s;"></div></div></div>`;
}

function showNoAuthError() {
  const container = document.getElementById('app-container');
  if (!container) return;
  container.innerHTML = `<div class="error-box" style="text-align:center; padding:32px; max-width:560px; margin:0 auto;"><h3 style="margin-top:0;">Откройте приложение через портал Битрикс24</h3><p style="line-height:1.5;">Вы перешли по прямой ссылке на файл приложения (домен <code>cdn-*.bitrix24.ru</code>). В этом режиме нет авторизации портала.</p><p style="line-height:1.5;">Откройте приложение из левого меню портала, либо нажмите на уведомление бота.</p><button class="btn btn-primary" onclick="tryRedirectToPortal()" style="margin-top:8px;">Перейти в Битрикс24</button></div>`;
  logAction('BX24.init не выполнился — приложение открыто без авторизации портала', 'error');
}

function tryRedirectToPortal() {
  const domain = (typeof getPortalDomain === 'function') ? getPortalDomain() : '';
  if (domain) window.location.href = domain + '/crm/smartprocess/' + ENTITY_TYPE_ID + '/';
  else showToast('Не удалось определить адрес портала.', 'error');
}

function getClientId() {
  try { const auth = BX24.getAuth(); if (auth) { if (auth.client_id) return auth.client_id; if (auth.CLIENT_ID) return auth.CLIENT_ID; } } catch (e) {}
  try { const params = new URLSearchParams(window.location.search); const clientId = params.get('client_id') || params.get('CLIENT_ID'); if (clientId) return decodeURIComponent(clientId); } catch (e) {}
  try { if (typeof BX24 !== 'undefined' && BX24.placement && typeof BX24.placement.info === 'function') { const info = BX24.placement.info(); const o = (info && info.options) || {}; if (o.client_id) return o.client_id; if (o.CLIENT_ID) return o.CLIENT_ID; } } catch (e) {}
  return (settings.clientId || '').trim();
}

function getCurrentHandlerUrl() {
  return window.location.href.split('?')[0].split('#')[0];
}

function ensureAppPlacement() {
  const current = getCurrentHandlerUrl();
  const saved = (settings.lastHandlerUrl || '').trim();
  logAction('Текущий путь обработчика (из iframe): ' + current, 'info');

  function doBind() {
    BX24.callMethod('placement.bind', { PLACEMENT: 'REST_APP_URI', HANDLER: current, TITLE: 'Закупки' }, function (bindRes) {
      if (bindRes.error()) {
        const errStr = getApiErrorMessage(bindRes);
        if (/already|binded/i.test(errStr)) logAction('placement.bind: handler уже привязан', 'info');
        else if (/UNKNOWN/i.test(errStr)) logAction('placement.bind: UNKNOWN — право "placement" не активно в токене. Убедитесь, что вы открыли приложение ИМЕННО ИЗ ЛЕВОГО МЕНЮ ПОРТАЛА, а не по прямой ссылке. Если из меню — снимите и заново поставьте галку placement в Интеграциях и сохраните.', 'error');
        else logAction('placement.bind: ' + errStr, 'error');
      } else {
        logAction('placement.bind: виджет REST_APP_URI успешно зарегистрирован на: ' + current, 'success');
      }
      settings.lastHandlerUrl = current;
      saveSettingsToBoth();
    });
  }

  if (saved && saved !== current) {
    logAction('Обнаружен старый handler: ' + saved + ' → удаляю привязку', 'info');
    BX24.callMethod('placement.unbind', { PLACEMENT: 'REST_APP_URI', HANDLER: saved }, function (unbindRes) {
      if (unbindRes.error() && !/not found|not binded|UNKNOWN/i.test(getApiErrorMessage(unbindRes))) {
        logAction('placement.unbind: ' + getApiErrorMessage(unbindRes), 'error');
      }
      doBind();
    });
  } else {
    logAction('Handler не изменился или первый запуск — привязываю: ' + current, 'info');
    doBind();
  }
}

function autoMapFields() {
  const fd = window.fieldDefs || {};
  const mapping = settings.mapping || {};
  let changed = false;
  const searchTerms = {
    comment: ['комментарий', 'comment'], detailPrice: ['цена за 1', 'цена за единицу', 'price'],
    manager: ['менеджер отдела', 'исполнитель', 'manager'], deptHead: ['руководитель отдела', 'dept head', 'head'],
    taskVyborSotr: ['задача по выбору', 'vybor', 'выбор сотрудника'], taskSbor: ['задача по сбору', 'sbor', 'сбор данных'],
    taskZagruz: ['задача по загрузке', 'zagruz', 'загрузка счёта'], delegateHistory: ['делегирован', 'delegate', 'история делегирований']
  };
  for (const key in searchTerms) {
    if (!mapping[key] || mapping[key] === '') {
      for (const fieldCode in fd) {
        const title = (fd[fieldCode].title || '').toLowerCase();
        let hit = false;
        for (const term of searchTerms[key]) { if (title.includes(term.toLowerCase())) { hit = true; break; } }
        if (hit) { mapping[key] = fieldCode; changed = true; logAction(`Авто-маппинг: ${key} → ${fieldCode} (${fd[fieldCode].title})`, 'info'); break; }
      }
    }
  }
  if (changed) { settings.mapping = mapping; saveSettingsToBoth(); }
}

function loadSettingsWithFallback() {
  return new Promise(function (resolve) {
    BX24.callMethod('app.option.get', {}, function (res) {
      let loaded = false;
      if (res && !res.error() && res.data() && res.data().settings) {
        try { settings = { ...settings, ...JSON.parse(res.data().settings) }; loaded = true; logAction('Настройки загружены из app.option', 'success'); } catch (e) { logAction('Ошибка парсинга app.option: ' + e.message, 'error'); }
      }
      if (!loaded) {
        try {
          const backup = localStorage.getItem('purchase_settings_backup');
          if (backup) {
            settings = { ...settings, ...JSON.parse(backup) };
            logAction('Настройки восстановлены из localStorage', 'info');
            BX24.callMethod('app.option.set', { options: { settings: JSON.stringify(settings) } }, function () {});
          } else { logAction('Настройки не найдены — используются значения по умолчанию', 'info'); }
        } catch (e) { logAction('Ошибка чтения backup: ' + e.message, 'error'); }
      }
      resolve();
    });
  });
}

function saveSettingsToBoth() {
  const json = JSON.stringify(settings);
  try { localStorage.setItem('purchase_settings_backup', json); } catch (e) {}
  BX24.callMethod('app.option.set', { options: { settings: json } }, function (res) {
    if (res && res.error()) logAction('Ошибка сохранения в app.option: ' + getApiErrorMessage(res), 'error');
    else logAction('Настройки сохранены в app.option + localStorage', 'success');
  });
}

function syncClientIdAndBuild() {
  const liveId = getClientId();
  const savedId = (settings.clientId || '').trim();
  if (liveId && liveId !== savedId) { logAction('client_id обновлён: ' + (savedId || '—') + ' → ' + liveId, 'info'); settings.clientId = liveId; saveSettingsToBoth(); }
  else if (!liveId) { logAction('⚠ client_id недоступен. Впишите его вручную: ⚙ Настройки → "Client ID приложения" → значение из карточки интеграции → Сохранить.', 'error'); }

  const savedBuild = (settings.lastBuildId || '').trim();
  if ((savedBuild && savedBuild !== APP_BUILD_ID) || !savedBuild) {
    logAction('Обнаружено обновление архива (' + (savedBuild || 'первый запуск') + ' → ' + APP_BUILD_ID + '). Сбрасываю кэш бота.', 'info');
    try { if (typeof clearBotCache === 'function') clearBotCache(); } catch (e) {}
    settings.lastBuildId = APP_BUILD_ID;
    saveSettingsToBoth();
  }
}

function init() {
  logAction('Инициализация приложения... build=' + APP_BUILD_ID, 'info');
  setLoadingStep(0, 5);

  if (typeof BX24 === 'undefined') {
    logAction('ОШИБКА: BX24 API не загружен.', 'error');
    document.getElementById('app-container').innerHTML = '<div class="error-box">Ошибка подключения к Битрикс24. Обновите страницу.</div>';
    return;
  }

  let inited = false;
  const initTimeout = setTimeout(function () { if (inited) return; showNoAuthError(); }, 8000);

  BX24.init(() => {
    inited = true;
    clearTimeout(initTimeout);
    b24Ready = true;

    try { const d = BX24.getDomain(); if (d && d.indexOf('cdn-') === -1) window.__portalDomain = 'https://' + d; } catch (e) {}

    setLoadingStep(1, 5);
    BX24.callBatch({ user: ['user.current', {}], isAdmin: ['user.admin', {}] }, (res) => {
      if (res.user && !res.user.error()) {
        currentUser = res.user.data();
        userNames[currentUser.ID] = `${currentUser.NAME} ${currentUser.LAST_NAME}`;
      } else { logAction('Ошибка получения пользователя', 'error'); return; }

      if (res.isAdmin && !res.isAdmin.error()) {
        actualRoles.isAdmin = res.isAdmin.data() === true;
        if (actualRoles.isAdmin) {
          document.getElementById('btn-settings').style.display = 'flex';
          document.getElementById('role-viewer-container').style.display = 'flex';
          document.getElementById('test-mode-container').style.display = 'flex';
          const scenarioContainer = document.getElementById('scenario-container');
          if (scenarioContainer) { scenarioContainer.style.display = 'flex'; document.getElementById('scenario-select').value = currentScenario; }
        }
      }

      loadSettingsWithFallback().then(function () {
        let mappingMigrated = false;
        if (!settings.mapping) { settings.mapping = { ...DEFAULT_MAPPING }; mappingMigrated = true; }
        else {
          if (settings.mapping.shortDesc === 'ufCrm17_1792761268') { settings.mapping.shortDesc = DEFAULT_MAPPING.shortDesc; mappingMigrated = true; }
          if (settings.mapping.postponeDate === 'ufCrm17_1793859756') { settings.mapping.postponeDate = DEFAULT_MAPPING.postponeDate; mappingMigrated = true; }
          if (settings.mapping.detailPrice === 'ufCrm17_price_ed') { settings.mapping.detailPrice = DEFAULT_MAPPING.detailPrice; mappingMigrated = true; }
          ['manager', 'deptHead', 'approver', 'taskVyborSotr', 'taskSbor', 'taskZagruz', 'delegateHistory'].forEach(k => { if (!settings.mapping[k]) { settings.mapping[k] = DEFAULT_MAPPING[k]; mappingMigrated = true; } });
        }
        if (mappingMigrated) { logAction('Миграция маппинга выполнена', 'info'); saveSettingsToBoth(); }

        isTestMode = localStorage.getItem('purchase_test_mode') === 'true';
        document.getElementById('test-mode-toggle').checked = isTestMode;
        currentScenario = localStorage.getItem('purchase_scenario') || 'none';
        ENTITY_TYPE_ID = settings.entityTypeId || 1072;
        INVOICE_ENTITY_ID = settings.invoiceEntityTypeId || 15;
        currentCategoryId = settings.categoryId || 65;
        systemUserId = settings.systemUserId || 175;

        setLoadingStep(2, 5);
        syncClientIdAndBuild();

        try { if (actualRoles.isAdmin) ensureAppPlacement(); } catch (e) {}

        const CACHE_TTL = 5 * 60 * 1000;
        const cachedMeta = localStorage.getItem(CACHE_KEY);
        let useCache = false;
        if (cachedMeta) {
          try {
            const parsed = JSON.parse(cachedMeta);
            if (parsed.timestamp && (Date.now() - parsed.timestamp) < CACHE_TTL) {
              useCache = true;
              fieldDefs = parsed.fieldDefs || {}; spStages = parsed.spStages || {}; spStagesSorted = parsed.spStagesSorted || [];
              departments = parsed.departments || []; allUsers = parsed.allUsers || [];
              userNames = { ...userNames, ...(parsed.userNames || {}) }; userDepts = { ...userDepts, ...(parsed.userDepts || {}) };
              logAction(`Использован свежий кэш метаданных (${Math.round((Date.now() - parsed.timestamp) / 1000)} сек назад)`, 'info');
            }
          } catch (e) { console.warn('Ошибка чтения кэша', e); }
        }

        if (useCache) { applyActualFieldsFromMapping(); autoMapFields(); checkUserRoles(); setLoadingStep(5, 5); loadAllData(); return; }

        logAction('Загрузка свежих полей и справочников...', 'info');
        setLoadingStep(3, 5);

        BX24.callBatch({
          uCurrent: ['user.get', { ID: currentUser.ID }],
          fields: ['crm.item.fields', { entityTypeId: ENTITY_TYPE_ID }],
          statuses: ['crm.status.list', {}],
          depts: ['department.get', {}],
          users: ['user.get', { active: true, SELECT: ['ID', 'NAME', 'LAST_NAME', 'UF_DEPARTMENT', 'ACTIVE'], ORDER: { LAST_NAME: 'ASC' } }]
        }, (metaRes) => {
          setLoadingStep(4, 5);
          if (metaRes.uCurrent && !metaRes.uCurrent.error() && metaRes.uCurrent.data().length > 0) currentUser.UF_DEPARTMENT = metaRes.uCurrent.data()[0].UF_DEPARTMENT;
          if (metaRes.fields && !metaRes.fields.error()) { fieldDefs = metaRes.fields.data().fields; applyActualFieldsFromMapping(); autoMapFields(); logAction('Поля успешно обновлены', 'success'); }
          if (metaRes.statuses && !metaRes.statuses.error()) {
            spStages = {}; spStagesSorted = [];
            const prefix = `DT${ENTITY_TYPE_ID}_${currentCategoryId}:`;
            metaRes.statuses.data().forEach(s => { if (s.STATUS_ID && s.STATUS_ID.startsWith(prefix)) { spStages[s.STATUS_ID] = { name: s.NAME, color: s.COLOR }; spStagesSorted.push({ id: s.STATUS_ID, name: s.NAME, sort: parseInt(s.SORT) || 0 }); } });
            spStagesSorted.sort((a, b) => a.sort - b.sort);
          }
          if (metaRes.depts && !metaRes.depts.error()) { departments = metaRes.depts.data() || []; departments.sort((a, b) => a.NAME.localeCompare(b.NAME)); }
          if (metaRes.users && !metaRes.users.error()) {
            allUsers = metaRes.users.data() || [];
            allUsers.forEach(u => {
              userNames[u.ID] = `${u.NAME} ${u.LAST_NAME}`;
              if (u.UF_DEPARTMENT && Array.isArray(u.UF_DEPARTMENT) && u.UF_DEPARTMENT.length > 0) {
                let deptNames = u.UF_DEPARTMENT.map(dId => { let dept = departments.find(d => String(d.ID) === String(dId)); return dept ? dept.NAME : ''; }).filter(n => n);
                if (deptNames.length > 0) userDepts[u.ID] = deptNames.join(', ');
              }
            });
            if (!userDepts[currentUser.ID] && currentUser.UF_DEPARTMENT) {
              let dIds = Array.isArray(currentUser.UF_DEPARTMENT) ? currentUser.UF_DEPARTMENT : [currentUser.UF_DEPARTMENT];
              let deptNames = dIds.map(dId => { let dept = departments.find(d => String(d.ID) === String(dId)); return dept ? dept.NAME : ''; }).filter(n => n);
              if (deptNames.length > 0) userDepts[currentUser.ID] = deptNames.join(', ');
            }
            logAction(`Загружено пользователей: ${allUsers.length} (все активные)`, 'info');
          }
          saveToCacheWithTimestamp();
          checkUserRoles();
          setLoadingStep(5, 5);
          loadAllData();
        });
      });
    });
  });
}

function applyActualFieldsFromMapping() {
  actualFields = {};
  for (let key in settings.mapping) {
    const fieldCode = settings.mapping[key];
    let foundKey = Object.keys(fieldDefs).find(k => k.toLowerCase() === fieldCode.toLowerCase());
    if (foundKey) actualFields[key] = foundKey; else actualFields[key] = fieldCode;
  }
  for (let key in fieldDefs) {
    const title = (fieldDefs[key].title || '').toLowerCase();
    if (title.includes('ответственный отдел') || title.includes('отдел')) { actualFields.dept = key; break; }
  }
  if (!actualFields.combinedDir) {
    for (let key in fieldDefs) {
      const title = (fieldDefs[key].title || '').toLowerCase();
      if (title.includes('раздел+направление') || title.includes('раздел + направление')) { actualFields.combinedDir = key; break; }
    }
  }
}

function saveToCacheWithTimestamp() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), fieldDefs, spStages, spStagesSorted, departments, allUsers, userNames, userDepts })); } catch (e) { console.warn('Ошибка сохранения кэша', e); }
}

window.onload = init;