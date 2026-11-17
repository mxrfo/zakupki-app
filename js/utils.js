// js/utils.js — Утилиты: форматирование, логирование, преобразования

// Конвертация HEX в RGBA
function hexToRgba(hex, alpha = 0.15) {
    if (!hex) return `rgba(100, 116, 139, ${alpha})`;
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100, 116, 139, ${alpha})`;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  // Форматирование денег
  function formatMoney(val) {
    if (val === undefined || val === null || val === '') return '—';
    if (typeof val === 'object' && val.VALUE !== undefined) val = val.VALUE;
    let str = String(val).replace(/\|RUB/i, '').replace(/,/g, '.');
    let num = parseFloat(str);
    if (isNaN(num)) return str;
    return num.toLocaleString('ru-RU') + ' ₽';
  }
  
  // Очистка значения денег (для вычислений)
  function cleanMoney(val) {
    if (val === undefined || val === null || val === '') return '';
    if (typeof val === 'object' && val.VALUE !== undefined) val = val.VALUE;
    let str = String(val).replace(/\|RUB/i, '').replace(/,/g, '.').replace(/[^\d.-]/g, '');
    let num = parseFloat(str);
    return isNaN(num) ? '' : num;
  }
  
  // Расчёт общей суммы закупки
  function calculateTotalAmount(item) {
    const p = parseFloat(cleanMoney(item[actualFields.amountProduct])) || 0;
    const d = parseFloat(cleanMoney(item[actualFields.amountDelivery])) || 0;
    return p + d;
  }
  
  // Получение информации о файле
  function getFileInfo(item, fieldCode) {
    const val = item[fieldCode];
    if (!val) return null;
    if (Array.isArray(val) && val.length > 0) {
      const fileObj = val[0];
      if (typeof fileObj === 'object') {
        return {
          url: fileObj.downloadUrl || fileObj.url || fileObj.src || null,
          name: fileObj.name || 'Скачать файл'
        };
      }
    }
    return null;
  }
  
  // Логирование действий в консоль приложения
  function logAction(msg, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${msg}`);
    const logContent = document.getElementById('log-content');
    if (!logContent) return;
    const time = new Date().toLocaleTimeString('ru-RU');
    const div = document.createElement('div');
    div.className = `log-line log-${type}`;
    div.innerHTML = `<span class="log-time">[${time}]</span> ${msg}`;
    logContent.appendChild(div);
    logContent.scrollTop = logContent.scrollHeight;
  }
  
  // Переключение панели логов
  function toggleLogPanel() {
    document.getElementById('log-panel').classList.toggle('open');
  }
  
  // Извлечение сообщения об ошибке из ответа API
  function getApiErrorMessage(res) {
    if (!res || !res.error) return 'Неизвестная ошибка API';
    const err = res.error();
    let msg = err.error || 'ERROR_CORE';
    if (err.error_description) msg += ' | ' + err.error_description;
    logAction('ОШИБКА БИТРИКС: ' + msg, 'error');
    return msg;
  }
  
  // Очистка текста от BB-кодов и HTML
  function cleanText(str) {
    if (!str) return '';
    return String(str).replace(/\[.*?\]/g, '').replace(/<[^>]*>/g, '').trim();
  }
  
  // Обновление отображения имени файла
  function updateFileName(input) {
    const display = document.getElementById('file-name-display');
    if (input.files && input.files.length > 0) {
      display.innerText = input.files[0].name;
      display.style.color = 'var(--brand-blue)';
    } else {
      display.innerText = 'Нажмите, чтобы выбрать файл';
      display.style.color = '#0f172a';
    }
  }
  
  // Получение отображаемого значения поля
  function getDisplayValue(item, fieldCode, type) {
    if (!fieldCode || !item[fieldCode]) return '—';
    let val = item[fieldCode];
  
    if (type === 'dept') {
      if (Array.isArray(val)) val = val[0];
      if (fieldDefs[fieldCode] && fieldDefs[fieldCode].type === 'enumeration') {
        const enumItem = fieldDefs[fieldCode].items?.find(i => String(i.ID) === String(val));
        if (enumItem) return enumItem.VALUE;
      }
      const deptObj = departments.find(d => String(d.ID) === String(val));
      return deptObj ? deptObj.NAME : val;
    }
  
    if (type === 'date') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? val : d.toLocaleDateString('ru-RU');
    }
  
    if (type === 'money') return formatMoney(val);
    if (type === 'user') return userNames[val] || `Сотрудник`;
  
    if (type === 'enum') {
      if (Array.isArray(val)) val = val[0];
      if (fieldDefs[fieldCode] && fieldDefs[fieldCode].items) {
        const enumItem = fieldDefs[fieldCode].items.find(i => String(i.ID) === String(val));
        return enumItem ? enumItem.VALUE : val;
      }
    }
  
    return val;
  }
  
  // Отображение дедлайна с цветовой индикацией
  function getDeadlineDisplay(deadlineStr) {
    if (!deadlineStr) return '—';
    const d = new Date(deadlineStr);
    if (isNaN(d.getTime())) return deadlineStr;
    const formattedDate = d.toLocaleDateString('ru-RU');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
    let extraText = '';
    if (diffDays < 0) {
      extraText = `<span style="color: #ef4444; font-weight: 700; font-size: 11px; margin-left: 6px;">Просрочено</span>`;
    } else if (diffDays === 0) {
      extraText = `<span style="color: #ef4444; font-weight: 700; font-size: 11px; margin-left: 6px;">Сегодня</span>`;
    } else if (diffDays <= settings.deadlineRedDays) {
      extraText = `<span style="color: #ef4444; font-weight: 700; font-size: 11px; margin-left: 6px;">${diffDays} дн.</span>`;
    } else if (diffDays <= settings.deadlineYellowDays) {
      extraText = `<span style="color: #f59e0b; font-weight: 700; font-size: 11px; margin-left: 6px;">${diffDays} дн.</span>`;
    }
  
    return `<span style="font-weight:600; white-space:nowrap;">${formattedDate}</span>${extraText}`;
  }
  
  // Показ тоста
  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.className = `toast show ${type}`;
    setTimeout(() => t.className = 'toast', 5000);
  }