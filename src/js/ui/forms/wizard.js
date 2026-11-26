// js/ui/forms/wizard.js — Мастер создания закупки (шаги, валидация, сводка)

let createStep = 1;

function populateCreateSection() {
  const secSelect = document.getElementById('create-section');
  const dirSelect = document.getElementById('create-direction');
  secSelect.innerHTML = '<option value="">-- Выберите раздел --</option>';
  dirSelect.innerHTML = '<option value="">-- Сначала выберите раздел --</option>';
  const secDef = fieldDefs[actualFields.section];
  if (secDef && secDef.items) secDef.items.forEach(i => { secSelect.innerHTML += `<option value="${i.ID}">${i.VALUE}</option>`; });
}

function updateDirectionsCreate(selectedDirId = null) {
  const secSelect = document.getElementById('create-section');
  const secId = secSelect.value;
  const dirSelect = document.getElementById('create-direction');
  dirSelect.innerHTML = '<option value="">-- Выберите направление --</option>';
  if (!secId) { dirSelect.innerHTML += '<option value="">-- Сначала выберите раздел --</option>'; return; }
  const dirDef = fieldDefs[actualFields.direction];
  if (!dirDef || !dirDef.items) return;
  const allowedDirs = settings.listDependencies[secId] || [];
  dirDef.items.forEach(item => {
    const isSel = String(selectedDirId) === String(item.ID) ? 'selected' : '';
    if (allowedDirs.length > 0 && allowedDirs.includes(String(item.ID))) {
      dirSelect.innerHTML += `<option value="${item.ID}" ${isSel}>${item.VALUE}</option>`;
    } else if (allowedDirs.length === 0) {
      dirSelect.innerHTML += `<option value="${item.ID}" ${isSel}>${item.VALUE}</option>`;
    }
  });
}

function goCreateStep(n, dir) {
  dir = dir || (n >= createStep ? 'forward' : 'back');
  createStep = n;
  document.querySelectorAll('#modal-create .step-panel').forEach(function (p) {
    const on = +p.dataset.step === n;
    p.classList.toggle('active', on);
    if (on) {
      p.classList.remove('from-right', 'from-left');
      void p.offsetWidth;
      p.classList.add(dir === 'forward' ? 'from-right' : 'from-left');
    }
  });
  document.querySelectorAll('.cs-step').forEach(function (s) {
    const sn = +s.dataset.step;
    s.classList.toggle('active', sn === n);
    s.classList.toggle('done', sn < n);
  });
  const fill = document.getElementById('cs-fill');
  if (fill) fill.style.width = ((n - 1) / 2 * 66.66) + '%';
  const back = document.getElementById('btn-create-back');
  const next = document.getElementById('btn-create-next');
  const save = document.getElementById('btn-save-create');
  if (back) back.style.display = n > 1 ? '' : 'none';
  if (next) next.style.display = n < 3 ? '' : 'none';
  if (save) save.style.display = n === 3 ? '' : 'none';
  updateHeaderSum();
  if (n === 3) renderCreateSummary();
  const mb = document.querySelector('#modal-create .modal-body');
  if (mb) mb.scrollTop = 0;
}

function validateCreateStep(n) {
  if (n === 1) {
    let ok = true;
    ['create-dept', 'create-deadline', 'create-section', 'create-direction'].forEach(function (id) {
      const el = document.getElementById(id);
      const bad = !el.value;
      el.classList.toggle('field-error', bad);
      if (bad) ok = false;
    });
    if (!ok) showToast('Заполните обязательные поля: отдел, срок, раздел и направление', 'error');
    return ok;
  }
  if (n === 2) {
    const sd = document.getElementById('create-short-desc');
    const badDesc = !sd.value.trim();
    sd.classList.toggle('field-error', badDesc);
    if (badDesc) { showToast('Укажите краткое описание', 'error'); return false; }
    return true;
  }
  return true;
}

function nextCreateStep() {
  if (!validateCreateStep(createStep)) return;
  if (createStep < 3) goCreateStep(createStep + 1, 'forward');
}

function prevCreateStep() {
  if (createStep > 1) goCreateStep(createStep - 1, 'back');
}

function tryGoCreateStep(n) {
  if (n === createStep) return;
  if (n < createStep) { goCreateStep(n, 'back'); return; }
  for (let s = createStep; s < n; s++) {
    if (!validateCreateStep(s)) { goCreateStep(s, 'back'); return; }
  }
  goCreateStep(n, 'forward');
}

function renderCreateSummary() {
  const c = document.getElementById('create-review-container');
  if (!c) return;
  const deptEl = document.getElementById('create-dept');
  const deptText = deptEl.value ? deptEl.options[deptEl.selectedIndex].text : '—';
  const dl = document.getElementById('create-deadline').value;
  const dlText = dl ? new Date(dl).toLocaleDateString('ru-RU') : '—';
  const secEl = document.getElementById('create-section');
  const dirEl = document.getElementById('create-direction');
  const secText = secEl.value ? secEl.options[secEl.selectedIndex].text : '—';
  const dirText = dirEl.value ? dirEl.options[dirEl.selectedIndex].text : '—';
  const shortDesc = document.getElementById('create-short-desc').value.trim() || '—';
  const posCount = document.querySelectorAll('.pos-card').length;
  const sum = parseFloat(document.getElementById('create-amount-product').value) || 0;
  const sumText = sum.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  c.innerHTML = `
    <div class="review-grid">
      <div class="review-item"><div class="review-label">Ответственный отдел</div><div class="review-value">${escapeHtml(deptText)}</div></div>
      <div class="review-item"><div class="review-label">Крайний срок закупки</div><div class="review-value">${dlText}</div></div>
      <div class="review-item"><div class="review-label">Раздел / Направление д/с</div><div class="review-value">${escapeHtml(secText)} / ${escapeHtml(dirText)}</div></div>
      <div class="review-item"><div class="review-label">Позиций закупки</div><div class="review-value">${posCount === 0 ? 'детализация не заполнена' : posCount}</div></div>
      <div class="review-item full"><div class="review-label">Краткое описание</div><div class="review-value">${escapeHtml(shortDesc)}</div></div>
      <div class="review-item full"><div class="review-label">Сумма позиций (без доставки)</div><div class="review-value amount">${sumText}</div></div>
    </div>
    <div class="review-note">Проверьте данные перед сохранением. После сохранения запрос уйдёт в работу.</div>`;
}

function openCreateModal() {
  const deptSelect = document.getElementById('create-dept');
  deptSelect.innerHTML = '<option value="">-- Выберите отдел --</option>';
  let availableDepts = 0;
  departments.forEach(d => {
    if (settings.visibleDepts.includes(String(d.ID)) && settings.deptShortNames[d.ID]) {
      deptSelect.innerHTML += `<option value="${d.ID}">${d.NAME} (${settings.deptShortNames[d.ID]})</option>`;
      availableDepts++;
    }
  });
  if (availableDepts === 0) return showToast('Нет доступных отделов', 'error');

  document.getElementById('create-modal-title').innerText = 'Создать запрос на закупку';
  document.getElementById('form-create').reset();
  document.getElementById('edit-item-id').value = '';
  document.getElementById('purchase-items-container').innerHTML = '';

  document.getElementById('create-amount-product').value = '';
  updateHeaderSum();

  document.getElementById('btn-save-create').disabled = false;
  document.getElementById('btn-save-create').innerText = 'Сохранить';
  document.getElementById('create-modal-content').style.borderTop = '';
  document.querySelectorAll('#modal-create .field-error').forEach(el => el.classList.remove('field-error'));

  const sd = document.getElementById('create-short-desc');
  if (sd) delete sd.dataset.autofilled;

  populateCreateSection();
  buildItemSuggestions();
  renderEmptyState();
  goCreateStep(1, 'forward');
  document.getElementById('modal-create').style.display = 'flex';
}

function openEditModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  document.getElementById('create-modal-title').innerText = 'Редактировать закупку';
  document.getElementById('edit-item-id').value = item.id;

  const deptSelect = document.getElementById('create-dept');
  deptSelect.innerHTML = '';
  departments.forEach(d => {
    const sn = settings.deptShortNames[d.ID];
    if ((settings.visibleDepts.includes(String(d.ID)) && sn) || item[actualFields.dept] == d.ID) {
      deptSelect.innerHTML += `<option value="${d.ID}" ${item[actualFields.dept] == d.ID ? 'selected' : ''}>${d.NAME} (${sn || '—'})</option>`;
    }
  });

  document.getElementById('create-deadline').value = item[actualFields.deadlineZakup] ? item[actualFields.deadlineZakup].split('T')[0] : '';
  document.getElementById('create-short-desc').value = getShortDesc(item);
  document.getElementById('create-amount-product').value = parseAmount(item[actualFields.amountProduct]) || '';
  document.querySelectorAll('#modal-create .field-error').forEach(el => el.classList.remove('field-error'));

  populateCreateSection();
  const curSec = String(Array.isArray(item[actualFields.section]) ? item[actualFields.section][0] : (item[actualFields.section] || ''));
  const curDir = String(Array.isArray(item[actualFields.direction]) ? item[actualFields.direction][0] : (item[actualFields.direction] || ''));
  if (curSec) {
    document.getElementById('create-section').value = curSec;
    updateDirectionsCreate(curDir);
  }

  const container = document.getElementById('purchase-items-container');
  container.innerHTML = '';

  const names = item[actualFields.detailName] || [];
  const purposes = item[actualFields.detailPurpose] || [];
  const prices = item[actualFields.detailPrice] || [];
  const qtys = item[actualFields.detailQty] || [];
  const links = item[actualFields.detailLink] || [];
  const suppliers = item[actualFields.detailSupplier] || [];
  const arrArt = actualFields.detailArticle ? (Array.isArray(item[actualFields.detailArticle]) ? item[actualFields.detailArticle] : (item[actualFields.detailArticle] ? [item[actualFields.detailArticle]] : [])) : [];
  const arrNote = actualFields.detailNote ? (Array.isArray(item[actualFields.detailNote]) ? item[actualFields.detailNote] : (item[actualFields.detailNote] ? [item[actualFields.detailNote]] : [])) : [];

  for (let i = 0; i < names.length; i++) {
    addDetailRow({
      name: names[i] || '',
      link: links[i] || '',
      qty: parseAmount(qtys[i]),
      price: parseAmount(prices[i]),
      supplier: suppliers[i] || '',
      article: arrArt[i] || '',
      purpose: purposes[i] || '',
      note: arrNote[i] || ''
    });
  }

  renderEmptyState();
  calculateAllTotals();

  const stage = spStages[item.stageId];
  document.getElementById('create-modal-content').style.borderTop = `6px solid ${stage ? stage.color : '#64748b'}`;
  goCreateStep(1, 'forward');
  document.getElementById('modal-create').style.display = 'flex';
}

window.populateCreateSection = populateCreateSection;
window.updateDirectionsCreate = updateDirectionsCreate;
window.goCreateStep = goCreateStep;
window.validateCreateStep = validateCreateStep;
window.nextCreateStep = nextCreateStep;
window.prevCreateStep = prevCreateStep;
window.tryGoCreateStep = tryGoCreateStep;
window.renderCreateSummary = renderCreateSummary;
window.openCreateModal = openCreateModal;
window.openEditModal = openEditModal;