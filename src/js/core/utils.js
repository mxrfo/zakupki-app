// ============================================================
// МОДУЛЬ: utils.js — Утилиты и хелперы
// ============================================================

// Надёжное получение текста ошибки из ответа BX24.
// ФИКС: раньше при пустом err.error подставлялся 'UNKNOWN' и реальная
// error_description терялась (документация placement: код может прийти пустым).
// Теперь ВСЕГДА показываем error_description целиком, а 'UNKNOWN' не используем.
function getApiErrorMessage(res) {
  if (!res || typeof res.error !== 'function') return 'Неизвестная ошибка';
  const err = res.error();
  if (!err) return 'Неизвестная ошибка';

  const rawCode = (err.error != null ? String(err.error) : '') ||
                  (err.code != null ? String(err.code) : '');
  const desc = err.error_description || err.errorDescription || err.description || '';
  const exception = err.errorException || err.exception || '';

  let msg = rawCode ? (rawCode + ': ' + desc) : (desc || 'Без кода и описания');
  if (exception) msg += ' | ' + exception;
  return msg.trim();
}

// ✅ Экранирование HTML для безопасного вывода в логи
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

// ✅ Логирование действий в консоль и UI (исправлен ID на log-content и добавлен escapeHtml)
function logAction(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('ru-RU');
  console.log(`[${timestamp}] ${type === 'error' ? '❌' : (type === 'success' ? '✅' : 'ℹ️')} ${message}`);

  const logContainer = document.getElementById('log-content');
  if (logContainer) {
    const div = document.createElement('div');
    div.className = `log-line log-${type}`;
    div.innerHTML = `<span class="log-time">[${timestamp}]</span> ${escapeHtml(message)}`;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;

    // Ограничиваем количество строк логов, чтобы не перегружать DOM
    while (logContainer.children.length > 500) {
      logContainer.removeChild(logContainer.firstChild);
    }
  }
}

// ✅ Показ всплывающего уведомления (toast) с исправленным z-index и классами
function showToast(message, type = 'info') {
  let toast = document.getElementById('app-toast') || document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:8px;color:#fff;font-weight:500;z-index:10001;opacity:0;transition:opacity 0.3s;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Очистка текста от HTML-тегов и лишних пробелов
function cleanText(text) {
  if (!text) return '';
  return String(text).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ✅ Открытие/закрытие консоли логов
function toggleLogPanel(force) {
  const panel = document.getElementById('log-panel');
  if (!panel) return;

  const willOpen = (typeof force === 'boolean') ? force : !panel.classList.contains('open');
  panel.classList.toggle('open', willOpen);
  localStorage.setItem('purchase_log_open', willOpen ? '1' : '0');

  const btn = document.querySelector('.btn-logs');
  if (btn) {
    btn.style.display = willOpen ? 'none' : 'flex';
  }
}

// ✅ Очистка консоли логов
function clearLogPanel() {
  const container = document.getElementById('log-content');
  if (container) container.innerHTML = '';
}

// ✅ Горячая клавиша Esc для закрытия и восстановление состояния при загрузке
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    toggleLogPanel(false);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('purchase_log_open') === '1') {
    toggleLogPanel(true);
  }
});

// ============================================================
// 🔥 ВОССТАНОВЛЕННЫЕ ОРИГИНАЛЬНЫЕ ФУНКЦИИ (НИ ОДНА НЕ УДАЛЕНА)
// ============================================================

function calculateTotalAmount(item) {
  if (!item) return 0;
  const productField = actualFields.amountProduct;
  const deliveryField = actualFields.amountDelivery;
  const product = productField ? (parseFloat(item[productField]) || 0) : 0;
  const delivery = deliveryField ? (parseFloat(item[deliveryField]) || 0) : 0;
  return product + delivery;
}

function formatMoney(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 ₽';
  return Number(amount).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }) + ' ₽';
}

function cleanMoney(amount) {
  return formatMoney(amount);
}

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
    return `<span class="date-colored" style="color:${color};">${dateText}</span>`;
  }
  return dateText;
}

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

// Переключение темы
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('purchase_theme', next);
  updateThemeIcons();
}

function updateThemeIcons() {
  const theme = document.documentElement.getAttribute('data-theme');
  const sun = document.querySelector('.icon-sun');
  const moon = document.querySelector('.icon-moon');
  if (sun && moon) {
    sun.classList.toggle('hidden', theme === 'dark');
    moon.classList.toggle('hidden', theme === 'light');
  }
}

// Восстановление темы при загрузке
(function() {
  const savedTheme = localStorage.getItem('purchase_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateThemeIcons);
  } else {
    updateThemeIcons();
  }
})();