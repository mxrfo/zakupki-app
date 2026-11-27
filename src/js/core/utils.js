// ============================================================
// МОДУЛЬ: utils.js
// ============================================================
// js/core/utils.js — Утилиты и хелперы

// Надёжное получение текста ошибки из ответа BX24.
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

// Экранирование HTML для безопасного вывода
function escapeHtml(str) {
	if (str === null || str === undefined) return '';
	return String(str).replace(/[&<>"']/g, c =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
	);
}

// Проверка безопасности URL (защита от javascript: и data:)
function isSafeHttpUrl(url) {
	if (!url) return false;
	try {
		const parsed = new URL(String(url).trim());
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch (e) {
		return false;
	}
}

// Логирование действий в консоль и UI (исправлен ID контейнера)
function logAction(message, type = 'info') {
	const timestamp = new Date().toLocaleTimeString('ru-RU');
	console.log(`[${timestamp}] ${type === 'error' ? '❌' : (type === 'success' ? '✅' : 'ℹ️')} ${message}`);
	const logContainer = document.getElementById('logs-container');
	if (logContainer) {
		const div = document.createElement('div');
		div.className = `log-line log-${type}`;
		div.innerHTML = `<span class="log-time">[${timestamp}]</span> ${escapeHtml(message)}`;
		logContainer.appendChild(div);
		logContainer.scrollTop = logContainer.scrollHeight;
		while (logContainer.children.length > 500) {
			logContainer.removeChild(logContainer.firstChild);
		}
	}
}

// Показ всплывающего уведомления (toast)
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

// Подсчёт общей суммы (товары + доставка)
function calculateTotalAmount(item) {
	if (!item) return 0;
	const productField = actualFields.amountProduct;
	const deliveryField = actualFields.amountDelivery;
	const product = productField ? (parseAmount(item[productField]) || 0) : 0;
	const delivery = deliveryField ? (parseAmount(item[deliveryField]) || 0) : 0;
	return product + delivery;
}

// Форматирование денег
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

// Получение отображаемого значения поля (списки, отделы)
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

// Отображение дедлайна с цветовой индикацией (возвращает безопасный HTML)
function getDeadlineDisplay(dateStr) {
	if (!dateStr) return '—';
	const d = new Date(dateStr);
	if (isNaN(d.getTime())) return '—';
	const dateText = d.toLocaleDateString('ru-RU');
	const now = new Date();
	const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
	let color = '';
	if (diffDays < 0) color = 'var(--st-danger-text)';
	else if (diffDays <= (settings.deadlineRedDays || 3)) color = 'var(--st-danger-text)';
	else if (diffDays <= (settings.deadlineYellowDays || 7)) color = 'var(--st-warning-text)';
	if (color) {
		return `<span class="date-colored" style="color:${color};">${escapeHtml(dateText)}</span>`;
	}
	return escapeHtml(dateText);
}

// Извлечение информации о файле
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

// Парсинг числовых значений (поддержка форматов 12.345,67 и 12,345.67)
function parseAmount(v) {
	if (v === undefined || v === null) return '';
	if (Array.isArray(v)) v = v[0];
	if (typeof v === 'number') return isFinite(v) ? v : '';
	let s = String(v).replace(/\s/g, '');
	const lastComma = s.lastIndexOf(',');
	const lastDot = s.lastIndexOf('.');
	if (lastComma !== -1 && lastDot !== -1) {
		if (lastComma > lastDot) {
			s = s.replace(/\./g, '').replace(',', '.');
		} else {
			s = s.replace(/,/g, '');
		}
	} else if (lastComma !== -1) {
		s = s.replace(',', '.');
	}
	s = s.replace(/[^\d.-]/g, '');
	const num = parseFloat(s);
	return isFinite(num) ? num : '';
}

// Формирование тела уведомления для бота
function buildBody(item, opts) {
	opts = opts || {};
	const lines = [];
	lines.push('[B]Срок:[/B] ' + formatDeadline(item[actualFields.deadlineZakup]));
	const dir = resolveCombinedDir(item);
	if (dir) lines.push('[B]Раздел/Направление:[/B] ' + dir);
	lines.push('[B]Что нужно закупить (Кратко):[/B] ' + getShortDesc(item));
	if (opts.manager) { const m = getMgrInfo(item); if (m.id) lines.push('[B]Менеджер:[/B] ' + m.name + ' (' + m.dept + ')'); }
	if (opts.creator) { const c = getCreatorInfo(item); lines.push('[B]Кто создал запрос:[/B] ' + c.name + ' (' + c.dept + ')'); }
	if (opts.sum) {
		const product = parseAmount(item[actualFields.amountProduct]) || 0;
		const delivery = parseAmount(item[actualFields.amountDelivery]) || 0;
		const total = product + delivery;
		if (opts.sumSplit) {
			lines.push('[B]Сумма (без доставки):[/B] ' + product.toLocaleString('ru-RU') + ' ₽');
			lines.push('[B]Сумма за доставку:[/B] ' + delivery.toLocaleString('ru-RU') + ' ₽');
			lines.push('[B]ИТОГО:[/B] ' + total.toLocaleString('ru-RU') + ' ₽');
		} else if (total) {
			lines.push('[B]Сумма:[/B] ' + total.toLocaleString('ru-RU') + ' ₽');
		}
	}
	if (opts.comment) { const c = item[actualFields.comment] ? cleanText(item[actualFields.comment]) : ''; if (c) lines.push('[B]Комментарий:[/B] ' + c); }
	if (opts.file) {
		const f = getFileInfo(item, actualFields.fileInvoice);
		if (f && f.url && isSafeHttpUrl(f.url)) {
			lines.push('[B]Файл для скачки:[/B] [URL=' + f.url + ']' + escapeHtml(f.name) + '[/URL]');
		}
	}
	return lines.join('\n');
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

// Экспорт в глобальную область
window.getApiErrorMessage = getApiErrorMessage;
window.escapeHtml = escapeHtml;
window.isSafeHttpUrl = isSafeHttpUrl;
window.logAction = logAction;
window.showToast = showToast;
window.cleanText = cleanText;
window.calculateTotalAmount = calculateTotalAmount;
window.formatMoney = formatMoney;
window.cleanMoney = cleanMoney;
window.getDisplayValue = getDisplayValue;
window.getDeadlineDisplay = getDeadlineDisplay;
window.getFileInfo = getFileInfo;
window.parseAmount = parseAmount;
window.buildBody = buildBody;
window.toggleTheme = toggleTheme;