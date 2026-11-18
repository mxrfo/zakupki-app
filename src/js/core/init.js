// js/init.js — Инициализация приложения (оптимизированная)

// ✅ Глобальный перехват ошибок для диагностики
window.addEventListener('error', function(ev) {
  try {
    if (typeof logAction === 'function') {
      logAction('JS ERROR: ' + (ev.message || 'unknown') + ' @ ' + (ev.filename || '') + ':' + (ev.lineno || ''), 'error');
    }
  } catch (e) {}
});
window.addEventListener('unhandledrejection', function(ev) {
  try {
    if (typeof logAction === 'function') {
      logAction('UNHANDLED REJECTION: ' + (ev.reason && ev.reason.message ? ev.reason.message : ev.reason), 'error');
    }
  } catch (e) {}
});

// ✅ Показ прогресса загрузки
function setLoadingStep(step, total) {
  const container = document.getElementById('app-container');
  const pct = Math.round((step / total) * 100);
  container.innerHTML = `
    <div class="loading" style="grid-column: 1/-1;">
      <div style="margin-bottom:12px;">Загрузка данных... ${pct}%</div>
      <div style="width:300px; height:6px; background:#e2e8f0; border-radius:3px; margin:0 auto; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:var(--brand-blue); transition:width 0.3s;"></div>
      </div>
    </div>
  `;
}

// ✅ Защита от зависания: если приложение открыли напрямую по CDN-ссылке (без портала)
function showNoAuthError() {
  const container = document.getElementById('app-container');
  if (!container) return;
  container.innerHTML = `
    <div class="error-box" style="text-align:center; padding:32px; max-width:560px; margin:0 auto;">
      <h3 style="margin-top:0;">Откройте приложение через портал Битрикс24</h3>
      <p style="line-height:1.5;">
        Вы перешли по прямой ссылке на файл приложения (домен <code>cdn-*.bitrix24.ru</code>).
        В этом режиме нет авторизации портала, поэтому данные не загрузятся.
      </p>
      <p style="line-height:1.5;">
        Откройте приложение из меню портала, либо нажмите на уведомление бота —
        там ссылка ведёт на портал и приложение запустится корректно.
      </p>
      <button class="btn btn-primary" onclick="tryRedirectToPortal()" style="margin-top:8px;">Перейти в Битрикс24</button>
    </div>
  `;
  logAction('BX24.init не выполнился — приложение открыто без авторизации портала (прямая CDN-ссылка)', 'error');
}

function tryRedirectToPortal() {
  const domain = (typeof getPortalDomain === 'function') ? getPortalDomain() : '';
  if (domain) {
    window.location.href = domain + '/crm/smartprocess/' + ENTITY_TYPE_ID + '/';
  } else {
    showToast('Не удалось определить адрес портала. Откройте приложение из меню Битрикс24.', 'error');
  }
}

// ✅ Регистрация виджета REST_APP_URI, чтобы ссылка /marketplace/view/{client_id}/
//    открывала приложение в слайдере, а не показывала «Ошибка при показе приложения».
//    Выполняется только админом и один раз (идемпотентно через localStorage-флаг).
function ensureAppPlacement() {
  const handlerUrl = window.location.href.split('?')[0].split('#')[0];
  const bindKey = 'b24_placement_bound_' + handlerUrl;
  if (localStorage.getItem(bindKey)) return;
  BX24.callMethod('placement.bind', {
    PLACEMENT: 'REST_APP_URI',
    HANDLER: handlerUrl,
    TITLE: 'Закупки'
  }, function(res) {
    if (res.error()) {
      logAction('placement.bind: ' + getApiErrorMessage(res) + ' (возможно уже зарегистрирован)', 'info');
    } else {
      logAction('Виджет REST_APP_URI зарегистрирован: ' + handlerUrl, 'success');
    }
    localStorage.setItem(bindKey, '1');
  });
}

function init() {
  logAction('Инициализация приложения...', 'info');
  setLoadingStep(0, 5);

  if (typeof BX24 === 'undefined') {
    logAction('ОШИБКА: BX24 API не загружен. Проверьте подключение скрипта.', 'error');
    document.getElementById('app-container').innerHTML = '<div class="error-box">Ошибка подключения к Битрикс24. Обновите страницу.</div>';
    return;
  }

  let inited = false;
  const initTimeout = setTimeout(function() {
    if (inited) return;
    showNoAuthError();
  }, 8000);

  BX24.init(() => {
    inited = true;
    clearTimeout(initTimeout);

    // ✅ Сигнал для api.js: BX24 инициализирован, можно вызывать loadAllData()
    b24Ready = true;

    // ✅ Сохраняем домен портала СРАЗУ, до любых отправок уведомлений
    try {
      const d = BX24.getDomain();
      if (d && d.indexOf('cdn-') === -1) window.__portalDomain = 'https://' + d;
    } catch (e) {}

    // ✅ АВТОМАТИЧЕСКОЕ СОХРАНЕНИЕ client_id (решает проблему ссылок без пересоздания приложения)
    try {
      if (!settings.clientId) {
        const auth = BX24.getAuth();
        if (auth && auth.client_id) {
          settings.clientId = auth.client_id;
          logAction('client_id автоматически подтянут из авторизации: ' + auth.client_id, 'info');
          // Сохраняем в настройки портала, чтобы не терялся
          BX24.callMethod('app.option.set', { options: { settings: JSON.stringify(settings) } }, () => {
            logAction('client_id сохранен в настройки приложения', 'success');
          });
        }
      }
    } catch (e) {
      logAction('Ошибка авто-определения client_id: ' + e.message, 'error');
    }

    setLoadingStep(1, 5);
    const initBatch = {
      user: ['user.current', {}],
      options: ['app.option.get', {}],
      isAdmin: ['user.admin', {}]
    };

    BX24.callBatch(initBatch, (res) => {
      if (res.user && !res.user.error()) {
        currentUser = res.user.data();
        userNames[currentUser.ID] = `${currentUser.NAME} ${currentUser.LAST_NAME}`;
      } else {
        logAction('Ошибка получения текущего пользователя', 'error');
        return;
      }

      if (res.isAdmin && !res.isAdmin.error()) {
        actualRoles.isAdmin = res.isAdmin.data() === true;
        if (actualRoles.isAdmin) {
          document.getElementById('btn-settings').style.display = 'flex';
          document.getElementById('role-viewer-container').style.display = 'flex';
          document.getElementById('test-mode-container').style.display = 'flex';
          const scenarioContainer = document.getElementById('scenario-container');
          if (scenarioContainer) {
            scenarioContainer.style.display = 'flex';
            const scenarioSelect = document.getElementById('scenario-select');
            if (scenarioSelect) scenarioSelect.value = currentScenario;
          }
        }
      }

      if (res.options && !res.options.error() && res.options.data() && res.options.data().settings) {
        try {
          const parsed = JSON.parse(res.options.data().settings);
          settings = { ...settings, ...parsed };
          if (!Array.isArray(settings.visibleDepts)) settings.visibleDepts = [];
          if (!settings.listDependencies) settings.listDependencies = {};
          if (!settings.mapping) settings.mapping = { ...DEFAULT_MAPPING };
        } catch (e) {
          logAction('Ошибка парсинга настроек: ' + e.message, 'error');
        }
      }

      let mappingMigrated = false;
      if (!settings.mapping) {
        settings.mapping = { ...DEFAULT_MAPPING };
        mappingMigrated = true;
      } else {
        if (settings.mapping.shortDesc === 'ufCrm17_1792761268') {
          settings.mapping.shortDesc = DEFAULT_MAPPING.shortDesc;
          mappingMigrated = true;
        }
        if (settings.mapping.postponeDate === 'ufCrm17_1793859756') {
          settings.mapping.postponeDate = DEFAULT_MAPPING.postponeDate;
          mappingMigrated = true;
        }
        if (settings.mapping.detailPrice === 'ufCrm17_price_ed') {
          settings.mapping.detailPrice = DEFAULT_MAPPING.detailPrice;
          mappingMigrated = true;
        }
        ['manager', 'deptHead', 'approver', 'taskVyborSotr', 'taskSbor', 'taskZagruz', 'delegateHistory'].forEach(k => {
          if (!settings.mapping[k]) {
            settings.mapping[k] = DEFAULT_MAPPING[k];
            mappingMigrated = true;
          }
        });
      }
      if (mappingMigrated) {
        logAction('Миграция маппинга полей выполнена, сохраняем...', 'info');
        BX24.callMethod('app.option.set', { options: { settings: JSON.stringify(settings) } }, () => {});
      }

      isTestMode = localStorage.getItem('purchase_test_mode') === 'true';
      document.getElementById('test-mode-toggle').checked = isTestMode;
      currentScenario = localStorage.getItem('purchase_scenario') || 'none';

      ENTITY_TYPE_ID = settings.entityTypeId || 1072;
      INVOICE_ENTITY_ID = settings.invoiceEntityTypeId || 15;
      currentCategoryId = settings.categoryId || 65;
      systemUserId = settings.systemUserId || 175;

      setLoadingStep(2, 5);

      // ✅ Если есть client_id и мы админ — регистрируем виджет REST_APP_URI
      try {
        if (settings.clientId && actualRoles.isAdmin) ensureAppPlacement();
      } catch (e) {}

      const CACHE_TTL = 5 * 60 * 1000; // 5 минут
      const cachedMeta = localStorage.getItem(CACHE_KEY);
      let useCache = false;
      if (cachedMeta) {
        try {
          const parsed = JSON.parse(cachedMeta);
          if (parsed.timestamp && (Date.now() - parsed.timestamp) < CACHE_TTL) {
            useCache = true;
            fieldDefs = parsed.fieldDefs || {};
            spStages = parsed.spStages || {};
            spStagesSorted = parsed.spStagesSorted || [];
            departments = parsed.departments || [];
            allUsers = parsed.allUsers || [];
            userNames = { ...userNames, ...(parsed.userNames || {}) };
            userDepts = { ...userDepts, ...(parsed.userDepts || {}) };
            logAction(`Использован свежий кэш метаданных (${Math.round((Date.now() - parsed.timestamp) / 1000)} сек назад)`, 'info');
          }
        } catch (e) {
          console.warn('Ошибка чтения кэша', e);
        }
      }

      if (useCache) {
        applyActualFieldsFromMapping();
        checkUserRoles();
        setLoadingStep(5, 5);
        loadAllData();
        return;
      }

      logAction('Загрузка свежих полей и справочников...', 'info');
      setLoadingStep(3, 5);

      const metaBatch = {
        uCurrent: ['user.get', { ID: currentUser.ID }],
        fields: ['crm.item.fields', { entityTypeId: ENTITY_TYPE_ID }],
        statuses: ['crm.status.list', {}],
        depts: ['department.get', {}]
      };

      const userFilter = { active: true };
      if (settings.visibleDepts && settings.visibleDepts.length > 0) {
        userFilter.UF_DEPARTMENT = settings.visibleDepts;
        logAction(`Фильтр пользователей по отделам: ${settings.visibleDepts.join(', ')}`, 'info');
      }
      userFilter.SELECT = ['ID', 'NAME', 'LAST_NAME', 'UF_DEPARTMENT'];
      userFilter.ORDER = { LAST_NAME: 'ASC' };

      metaBatch.users = ['user.get', userFilter];

      BX24.callBatch(metaBatch, (metaRes) => {
        setLoadingStep(4, 5);

        if (metaRes.uCurrent && !metaRes.uCurrent.error() && metaRes.uCurrent.data().length > 0) {
          currentUser.UF_DEPARTMENT = metaRes.uCurrent.data()[0].UF_DEPARTMENT;
        }

        if (metaRes.fields && !metaRes.fields.error()) {
          fieldDefs = metaRes.fields.data().fields;
          applyActualFieldsFromMapping();
          logAction('Поля успешно обновлены', 'success');
        }

        if (metaRes.statuses && !metaRes.statuses.error()) {
          spStages = {};
          spStagesSorted = [];
          const prefix = `DT${ENTITY_TYPE_ID}_${currentCategoryId}:`;
          metaRes.statuses.data().forEach(s => {
            if (s.STATUS_ID && s.STATUS_ID.startsWith(prefix)) {
              spStages[s.STATUS_ID] = { name: s.NAME, color: s.COLOR };
              spStagesSorted.push({ id: s.STATUS_ID, name: s.NAME, sort: parseInt(s.SORT) || 0 });
            }
          });
          spStagesSorted.sort((a, b) => a.sort - b.sort);
        }

        if (metaRes.depts && !metaRes.depts.error()) {
          departments = metaRes.depts.data() || [];
          departments.sort((a, b) => a.NAME.localeCompare(b.NAME));
        }

        if (metaRes.users && !metaRes.users.error()) {
          allUsers = metaRes.users.data() || [];
          allUsers.forEach(u => {
            userNames[u.ID] = `${u.NAME} ${u.LAST_NAME}`;
            if (u.UF_DEPARTMENT && Array.isArray(u.UF_DEPARTMENT) && u.UF_DEPARTMENT.length > 0) {
              let deptNames = u.UF_DEPARTMENT.map(dId => {
                let dept = departments.find(d => String(d.ID) === String(dId));
                return dept ? dept.NAME : '';
              }).filter(n => n);
              if (deptNames.length > 0) userDepts[u.ID] = deptNames.join(', ');
            }
          });
          if (!userDepts[currentUser.ID] && currentUser.UF_DEPARTMENT) {
            let dIds = Array.isArray(currentUser.UF_DEPARTMENT) ? currentUser.UF_DEPARTMENT : [currentUser.UF_DEPARTMENT];
            let deptNames = dIds.map(dId => {
              let dept = departments.find(d => String(d.ID) === String(dId));
              return dept ? dept.NAME : '';
            }).filter(n => n);
            if (deptNames.length > 0) userDepts[currentUser.ID] = deptNames.join(', ');
          }
          logAction(`Загружено пользователей: ${allUsers.length}`, 'info');
        }

        saveToCacheWithTimestamp();
        checkUserRoles();
        setLoadingStep(5, 5);
        loadAllData();
      });
    });
  });
}

function applyActualFieldsFromMapping() {
  actualFields = {};
  for (let key in settings.mapping) {
    const fieldCode = settings.mapping[key];
    let foundKey = Object.keys(fieldDefs).find(k => k.toLowerCase() === fieldCode.toLowerCase());
    if (foundKey) actualFields[key] = foundKey;
    else actualFields[key] = fieldCode;
  }
  for (let key in fieldDefs) {
    const title = (fieldDefs[key].title || '').toLowerCase();
    if (title.includes('ответственный отдел') || title.includes('отдел')) {
      actualFields.dept = key;
      break;
    }
  }
  if (!actualFields.combinedDir) {
    for (let key in fieldDefs) {
      const title = (fieldDefs[key].title || '').toLowerCase();
      if (title.includes('раздел+направление') || title.includes('раздел + направление')) {
        actualFields.combinedDir = key;
        break;
      }
    }
  }
}

function saveToCacheWithTimestamp() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      fieldDefs, spStages, spStagesSorted, departments, allUsers, userNames, userDepts
    }));
  } catch (e) {
    console.warn('Ошибка сохранения кэша', e);
  }
}

// Запуск после загрузки страницы
window.onload = init;