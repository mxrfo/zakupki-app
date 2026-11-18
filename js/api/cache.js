// js/cache.js — Работа с localStorage кэшем

// Применение кэша для мгновенной отрисовки
function applyCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
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
  
        checkUserRoles();
        render();
      }
    } catch (e) {
      console.warn('Ошибка чтения кэша', e);
    }
  }
  
  // Сохранение метаданных в кэш
  function saveToCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        fieldDefs, spStages, spStagesSorted, departments, allUsers, userNames, userDepts
      }));
    } catch (e) {
      console.warn('Ошибка сохранения кэша', e);
    }
  }