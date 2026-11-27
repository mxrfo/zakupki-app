// js/cache.js — Работа с localStorage кэшем

const CACHE_TTL_MS = 5 * 60 * 1000;

// Применение кэша для мгновенной отрисовки
function applyCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return;

    const data = JSON.parse(cached);
    if (!data || (data.timestamp && (Date.now() - data.timestamp) > CACHE_TTL_MS)) {
      return;
    }

    if (data.fieldDefs) fieldDefs = data.fieldDefs;
    if (data.spStages) spStages = data.spStages;
    if (data.spStagesSorted) spStagesSorted = data.spStagesSorted;
    if (data.departments) departments = data.departments;
    if (data.allUsers) allUsers = data.allUsers;
    if (data.userNames) userNames = data.userNames;
    if (data.userDepts) userDepts = data.userDepts;

    // Восстанавливаем actualFields
    actualFields = {};
    for (let key in settings.mapping) {
      const fieldCode = settings.mapping[key];
      const foundKey = Object.keys(fieldDefs).find(k => k.toLowerCase() === String(fieldCode).toLowerCase());
      actualFields[key] = foundKey || fieldCode;
    }
    for (let key in fieldDefs) {
      const title = String((fieldDefs[key] && fieldDefs[key].title) || '').toLowerCase();
      if (title.includes('ответственный отдел') || title.includes('отдел')) {
        actualFields.dept = key;
        break;
      }
    }
    if (!actualFields.combinedDir) {
      for (let key in fieldDefs) {
        const title = String((fieldDefs[key] && fieldDefs[key].title) || '').toLowerCase();
        if (title.includes('раздел+направление') || title.includes('раздел + направление')) {
          actualFields.combinedDir = key;
          break;
        }
      }
    }

    checkUserRoles();
    render();
  } catch (e) {
    console.warn('Ошибка чтения кэша', e);
  }
}

// Сохранение метаданных в кэш
function saveToCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      fieldDefs,
      spStages,
      spStagesSorted,
      departments,
      allUsers,
      userNames,
      userDepts
    }));
  } catch (e) {
    console.warn('Ошибка сохранения кэша', e);
  }
}

// js/cache.js конец