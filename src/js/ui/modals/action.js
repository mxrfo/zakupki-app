// js/ui/modals/action.js — Модалка действий (согласование, отклонение и т.д.)

function openActionModal(id, type) {
  document.getElementById('form-action').reset();
  document.getElementById('action-id').value = id;
  document.getElementById('action-type').value = type;

  const title = document.getElementById('action-title');
  const label = document.getElementById('action-comment-label');
  const footer = document.getElementById('action-footer-buttons');
  const postponeGroup = document.getElementById('action-postpone-group');
  postponeGroup.style.display = 'none';

  let btnHtml = `<button type="button" class="btn" onclick="closeModal('modal-action')">Отмена</button>`;

  if (type === 'send_to_work') {
    const item = items.find(i => i.id == id);
    const existingTaskId = item ? item[actualFields.taskVyborSotr] : null;
    if (existingTaskId && String(existingTaskId).match(/^\d+$/)) {
      title.innerText = 'Задача уже создана';
      label.innerText = 'Задача на утверждение исполнителя уже существует';
      btnHtml += `<button type="button" class="btn btn-primary" disabled>Задача ID ${existingTaskId}</button>`;
      footer.innerHTML = btnHtml;
      document.getElementById('modal-action').style.display = 'flex';
      return;
    }
    title.innerText = 'Отправить в работу';
    label.innerText = 'Комментарий (покажется в чате руководителю)';
    btnHtml += `<button type="submit" class="btn btn-primary">Отправить</button>`;
  } else if (type === 'approve_terms') {
    title.innerText = 'Согласовать условия';
    label.innerText = 'Комментарий (увидят менеджеры)';
    postponeGroup.style.display = 'block';
    btnHtml += `<button type="submit" class="btn btn-success">Согласовать</button>`;
  } else if (type === 'send_to_rework') {
    title.innerText = 'Отправить на доработку';
    label.innerText = 'Комментарий — что исправить (обязательно)';
    btnHtml += `<button type="submit" class="btn btn-warning">Отправить на доработку</button>`;
  } else if (type === 'reject_terms') {
    title.innerText = 'Отклонить условия';
    label.innerText = 'Причина отказа';
    btnHtml += `<button type="submit" class="btn btn-danger">Отклонить</button>`;
  } else if (type === 'approve_invoice') {
    title.innerText = 'Утвердить счет';
    label.innerText = 'Комментарий';
    btnHtml += `<button type="submit" class="btn btn-success">Утвердить</button>`;
  } else if (type === 'reject_invoice') {
    title.innerText = 'Отклонить счет';
    label.innerText = 'Причина отказа';
    btnHtml += `<button type="submit" class="btn btn-danger">Отклонить</button>`;
  } else if (type === 'confirm_payment') {
    title.innerText = 'Подтвердить оплату';
    label.innerText = 'Комментарий';
    btnHtml += `<button type="submit" class="btn btn-success">Оплачено</button>`;
  } else if (type === 'confirm_receipt') {
    title.innerText = 'Подтвердить получение';
    label.innerText = 'Комментарий';
    btnHtml += `<button type="submit" class="btn btn-primary">Подтвердить</button>`;
  } else if (type === 'remove_postpone') {
    title.innerText = 'Снять отложенную дату';
    label.innerText = 'Комментарий (необязательно)';
    btnHtml += `<button type="submit" class="btn btn-primary">Снять</button>`;
  }

  footer.innerHTML = btnHtml;
  document.getElementById('modal-action').style.display = 'flex';
}

window.openActionModal = openActionModal;