// js/ui/forms/smart-parse.js — Умный парсинг строки и вставка из Excel/Word

// ✅ Флаг массовой вставки — отключает подсказки во время обработки
let _batchPaste = false;

function smartParseItemLine(input) {
	const raw = input.value.trim();
	if (!raw) return;
	// ✅ FIX: проверка на null — input может быть вне .pos-card (например, в таблице детализации)
	const card = input.closest('.pos-card');
	if (!card) return;

	let name = raw;
	const qtyMatch = raw.match(/(\d+)\s*(шт\.?|ед\.?|упак\.?|коробк|компл\.?)/i);
	const priceMatch = raw.match(/(?:по\s*)?(\d[\d\s]*[.,]?\d*)\s*(?:р\.?|руб\.?|₽)/i);
	if (qtyMatch) {
		const cur = card.querySelector('.det-qty');
		if (cur && !cur.value) cur.value = qtyMatch[1];
		name = name.replace(qtyMatch[0], '').trim();
	}
	if (priceMatch) {
		const cur = card.querySelector('.det-price');
		if (cur && !cur.value) cur.value = priceMatch[1].replace(/\s/g, '').replace(',', '.');
		name = name.replace(priceMatch[0], '').trim();
	}
	name = name.replace(/\s{2,}/g, ' ').replace(/[,\s]+$/g, '').trim();
	if (name) input.value = name;
	calculateRowTotal(input);
	maybeAutoFillShortDesc();
}

function maybeAutoFillShortDesc() {
	const sd = document.getElementById('create-short-desc');
	if (!sd) return;
	const names = Array.from(document.querySelectorAll('.pos-card .det-name')).map(function (i) { return i.value.trim(); }).filter(Boolean);
	if (!names.length) return;
	const auto = names[0] + (names.length > 1 ? ' и ещё ' + (names.length - 1) + ' поз.' : '');
	if (!sd.value.trim() || sd.dataset.autofilled === '1') {
		sd.value = auto;
		sd.dataset.autofilled = '1';
	}
}

// ✅ Вспомогательная функция: корректно ставит/снимает класс .filled
function updateFilledState(card) {
	if (!card) return;
	const hasData = ['.det-name', '.det-price', '.det-qty', '.det-supplier'].some(function (sel) {
		const el = card.querySelector(sel);
		return el && String(el.value || '').trim();
	});
	card.classList.toggle('filled', hasData);
}

function handleItemsPaste(e) {
	const input = e.target.closest('.det-name');
	if (!input) return;
	const text = (e.clipboardData || window.clipboardData).getData('text');
	if (!text) return;
	const lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
	const hasTabs = /\t/.test(text);
	const multiLine = lines.length > 1;
	if (!hasTabs && !multiLine) return;
	e.preventDefault();
	const container = document.getElementById('purchase-items-container');
	const emptyCard = container.querySelector('.pos-card:not(.filled)');

	// ✅ FIX: флаг массовой вставки — отключает showSuggestions
	_batchPaste = true;
	try {
		lines.forEach(function (line, idx) {
			const cols = line.split(/\t/).map(function (c) { return c.trim(); });
			let target;
			if (idx === 0 && emptyCard) { target = emptyCard; }
			else { addDetailRow(); target = container.querySelector('.pos-card:last-child'); }
			// ✅ FIX: корректно ставим .filled
			updateFilledState(target);
			if (cols.length >= 3) {
				const nameEl = target.querySelector('.det-name');
				const priceEl = target.querySelector('.det-price');
				const qtyEl = target.querySelector('.det-qty');
				if (nameEl) nameEl.value = cols[0];
				if (priceEl) priceEl.value = (cols[1] || '').replace(/[^\d.,]/g, '').replace(',', '.');
				if (qtyEl) qtyEl.value = (cols[2] || '').replace(/[^\d]/g, '');
			} else if (cols.length === 2) {
				const nameEl = target.querySelector('.det-name');
				const qtyEl = target.querySelector('.det-qty');
				if (nameEl) nameEl.value = cols[0];
				if (qtyEl) qtyEl.value = (cols[1] || '').replace(/[^\d]/g, '');
			} else {
				const nameEl = target.querySelector('.det-name');
				if (nameEl) nameEl.value = cols[0];
			}
			onDetNameInput(target.querySelector('.det-name'));
		});
	} finally {
		_batchPaste = false;
	}
	showToast('Добавлено позиций: ' + lines.length, 'success');
}

window.smartParseItemLine = smartParseItemLine;
window.maybeAutoFillShortDesc = maybeAutoFillShortDesc;
window.handleItemsPaste = handleItemsPaste;