// js/ui/dragdrop.js — Drag & Drop для карточек
let dragSrcEl = null;

function handleDragStart(e) {
	if (currentSort !== 'default') {
		showToast('Сбросьте сортировку в "По умолчанию", чтобы менять порядок вручную', 'info');
		return;
	}
	dragSrcEl = this;
	e.dataTransfer.effectAllowed = 'move';
	e.dataTransfer.setData('text/plain', this.getAttribute('data-id'));
	this.classList.add('dragging');
}

// ✅ FIX: добавлен класс .drag-over при dragover для визуальной обратной связи
function handleDragOver(e) {
	e.preventDefault();
	e.dataTransfer.dropEffect = 'move';
	document.querySelectorAll('.note-card').forEach(c => c.classList.remove('drag-over'));
	if (this !== dragSrcEl) {
		this.classList.add('drag-over');
	}
	return false;
}

// ✅ FIX: сдвиг targetIdx при srcIdx < targetIdx, чтобы карточка вставала в правильную позицию
function handleDrop(e) {
	e.stopPropagation();
	if (dragSrcEl !== this) {
		const srcId = parseInt(dragSrcEl.getAttribute('data-id'));
		const targetId = parseInt(this.getAttribute('data-id'));
		const container = document.getElementById('app-container');
		const cards = Array.from(container.querySelectorAll('.note-card'));
		if (customOrder.length === 0) {
			cards.forEach(c => customOrder.push(parseInt(c.getAttribute('data-id'))));
		}
		const srcIdx = customOrder.indexOf(srcId);
		let targetIdx = customOrder.indexOf(targetId);
		if (srcIdx !== -1 && targetIdx !== -1) {
			customOrder.splice(srcIdx, 1);
			// ✅ FIX: если перемещаем элемент вниз по списку, индекс цели сдвигается на 1
			if (srcIdx < targetIdx) {
				targetIdx--;
			}
			customOrder.splice(targetIdx, 0, srcId);
		}
		localStorage.setItem('purchase_custom_order_1088', JSON.stringify(customOrder));
		render();
	}
	return false;
}

// ✅ FIX: очистка всех drag-классов при dragend
function handleDragEnd(e) {
	this.classList.remove('dragging');
	document.querySelectorAll('.note-card').forEach(c => c.classList.remove('drag-over'));
}