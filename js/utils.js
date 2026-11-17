// ============================================================
// МОДУЛЬ: utils.js — Утилиты и хелперы
// ============================================================

// Надёжное получение текста ошибки из ответа BX24
function getApiErrorMessage(res) {
  if (!res || !res.error) return 'Неизвестная ошибка';
  const err = res.error();
  if (!err) return 'Неизвестная ошибка';
  
  // Битрикс может вернуть ошибку в разных форматах
  const desc = err.error_description || err.errorDescription || err.description || '';
  const code = err.error || err.code || 'UNKNOWN';
  const exception = err.errorException || err.exception || '';
  
  if (desc || exception) {
    return `${code}: ${desc} ${exception}`.trim();
  }
  return `Код ошибки: ${code}`;
}

// Логирование действий в консоль и UI (если есть элемент логов)
function logAction(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = type === 'error' ? '❌' : (type === 'success' ? '✅' : 'ℹ️');
  console.log(`[${timestamp}] ${prefix} ${message}`);
  
  // Если на странице есть блок логов, добавляем туда
  const logContainer = document.getElementById('app-logs');
  if (logContainer) {
    const div = document.createElement('div');
    div.className = `log-entry log-${type}`;
    div.textContent = `[${timestamp}] ${message}`;
    logContainer.prepend(div);
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