// ============================================================
// МОДУЛЬ: utils.js — Утилиты и хелперы
// ============================================================

// Надёжное получение текста ошибки из ответа BX24
function getApiErrorMessage(res) {
  if (!res || !res.error) return 'Неизвестная ошибка';
  const err = res.error();
  if (!err) return 'Неизвестная ошибка';

  const desc = err.error_description || err.errorDescription || err.description || '';
  const code = err.error || err.code || 'UNKNOWN';
  const exception = err.errorException || err.exception || '';

  if (desc || exception) {
    return `${code}: ${desc} ${exception}`.trim();
  }
  return `Код ошибки: ${code}`;
}

// Логирование действий в консоль и UI
function logAction(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = type === 'error' ? '❌' : (type === 'success' ? '✅' : 'ℹ️');
  console.log(`[${timestamp}] ${prefix} ${message}`);

  // Добавляем в панель логов, если она открыта
  const logContainer = document.getElementById('app-logs');
  if (logContainer && logContainer.style.display !== 'none') {
    const div = document.createElement('div');
    div.className = `log-entry log-${type}`;
    div.style.cssText = `padding:3px 0; border-bottom:1px solid #1e293b; ${
      type === 'error' ? 'color:#f87171;' : type === 'success' ? 'color:#34d399;' : 'color:#cbd5e1;'
    }`;
    div.textContent = `[${timestamp}] ${message}`;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
  }
}

// Показ всплывающего уведомления (toast)
function showToast(message, type = 'info') {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:8px;color:#fff;font-weight:500;z-index:9999;opacity:0;transition:opacity 0.3s;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.backgroundColor = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#3b82f6');
  toast.style.opacity = '1';

  setTimeout(() => {
    toast.style.opacity = '0';
  }, 3000);
}

// Очистка текста от HTML-тегов и лишних пробелов
function cleanText(text) {
  if (!text) return '';
  return String(text).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ============================================================
// 🔥 ВОССТАНОВЛЕННЫЕ ФУНКЦИИ (были потеряны)
// ============================================================

// Расчёт итоговой суммы закупки (товары + доставка)
function calculateTotalAmount(item) {
  if (!item) return 0;
  const productField = actualFields.amountProduct;
  const deliveryField = actualFields.amountDelivery;
  const product = productField ? (parseFloat(item[productField]) || 0) : 0;
  const delivery = deliveryField ? (parseFloat(item[deliveryField]) || 0) : 0;
  return product + delivery;
}

// Форматирование суммы в деньги
function formatMoney(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 ₽';
  return Number(amount).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }) + ' ₽';
}

// Получение отображаемого значения поля (enum/список или отдел)
function getDisplayValue(item, fieldCode, type) {
  if (!fieldCode || !item || item[fieldCode] === undefined || item[fieldCode] === null) return '—';
  const raw = item[fieldCode];
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (!val) return '—';

  if (type === 'dept') {
    const short = settings.deptShortNames[String(val)];
    if (short) return short;
    const dept = departments.find(d => String(d.ID) === String(val));
    return dept ? dept.NAME : String(val);
  }

  const def = fieldDefs[fieldCode];
  if (def && def.items && def.items.length) {
    const found = def.items.find(i => String(i.ID) === String(val));
    if (found) return found.VALUE;
  }
  return String(val);
}

// Форматирование дедлайна с цветовой подсветкой
function getDeadlineDisplay(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const dateText = d.toLocaleDateString('ru-RU');
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  let color = '';
  if (diffDays < 0) color = '#ef4444';
  else if (diffDays <= (settings.deadlineRedDays || 3)) color = '#ef4444';
  else if (diffDays <= (settings.deadlineYellowDays || 7)) color = '#f59e0b';

  if (color) {
    return `<span style="color:${color}; font-weight:600;">${dateText}</span>`;
  }
  return dateText;
}

// Извлечение имени файла и URL из файлового UF-поля
function getFileInfo(item, fileFieldCode) {
  if (!fileFieldCode || !item || !item[fileFieldCode]) return null;
  const raw = item[fileFieldCode];
  const arr = Array.isArray(raw) ? raw : [raw];
  const file = arr.find(f => f && (f.url || f.downloadUrl || f.id));
  if (!file) return null;
  const url = file.url || file.downloadUrl || '';
  const name = file.name || file.originalName || 'Файл';
  return { url, name };
}

// ============================================================
// 🔥 ПАНЕЛЬ ЛОГОВ (создаётся программно + функция toggleLogPanel)
// ============================================================

// Функция переключения панели логов (вызывается кнопкой)
function toggleLogPanel() {
  const panel = document.getElementById('app-logs');
  const btn = document.getElementById('log-toggle-btn');
  if (!panel) return;

  const isVisible = panel.style.display === 'block';
  panel.style.display = isVisible ? 'none' : 'block';
  if (btn) btn.style.background = isVisible ? '#1e293b' : '#334155';
  if (!isVisible) panel.scrollTop = panel.scrollHeight;
}

// Автоинициализация панели логов при загрузке
(function initLogPanel() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildLogPanel);
  } else {
    buildLogPanel();
  }

  function buildLogPanel() {
    if (document.getElementById('log-toggle-btn')) return;

    // Кнопка-триггер
    const btn = document.createElement('button');
    btn.id = 'log-toggle-btn';
    btn.innerHTML = '≡';
    btn.title = 'Открыть/закрыть панель логов';
    btn.onclick = toggleLogPanel;
    btn.style.cssText = `
      position: fixed;
      left: 20px;
      bottom: 20px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #1e293b;
      color: #fff;
      border: none;
      font-size: 22px;
      cursor: pointer;
      z-index: 9998;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Панель логов
    const panel = document.createElement('div');
    panel.id = 'app-logs';
    panel.style.cssText = `
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 220px;
      background: #0f172a;
      color: #e2e8f0;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 12px;
      padding: 12px 16px;
      overflow-y: auto;
      z-index: 9997;
      display: none;
      border-top: 2px solid #334155;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #334155;';
    header.innerHTML = `
      <span style="font-weight:700; color:#60a5fa;">📋 КОНСОЛЬ ЛОГОВ</span>
      <button id="log-clear-btn" style="background:#ef4444;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Очистить</button>
    `;
    panel.appendChild(header);

    document.body.appendChild(panel);
    document.body.appendChild(btn);

    document.getElementById('log-clear-btn').addEventListener('click', () => {
      const entries = panel.querySelectorAll('.log-entry');
      entries.forEach(e => e.remove());
    });
  }
})();