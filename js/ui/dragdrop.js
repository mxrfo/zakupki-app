// js/dragdrop.js — Drag & Drop для карточек

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

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

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
    const targetIdx = customOrder.indexOf(targetId);

    if (srcIdx !== -1 && targetIdx !== -1) {
      customOrder.splice(srcIdx, 1);
      customOrder.splice(targetIdx, 0, srcId);
    }

    localStorage.setItem('purchase_custom_order_1088', JSON.stringify(customOrder));
    render();
  }
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.note-card').forEach(c => c.classList.remove('drag-over'));
}