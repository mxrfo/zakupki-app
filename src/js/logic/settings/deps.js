// js/logic/settings/deps.js — Вкладка "Связи списков"

function renderListDependencies() {
  const container = document.getElementById('list-dependencies-container');
  if (!container) return;
  container.innerHTML = '';
  const secDef = fieldDefs[actualFields.section];
  const dirDef = fieldDefs[actualFields.direction];
  if (!secDef || !secDef.items || !dirDef || !dirDef.items) { container.innerHTML = '<p class="empty-note">Не найдены поля "Раздел" или "Направление"</p>'; return; }
  secDef.items.forEach(sec => {
    const secId = String(sec.ID);
    const checkedDirs = settings.listDependencies[secId] || [];
    let optionsHtml = '';
    dirDef.items.forEach(dir => { const isChecked = checkedDirs.includes(String(dir.ID)) ? 'checked' : ''; optionsHtml += `<label class="dep-chip"><input type="checkbox" class="dir-dep-check" data-sec="${secId}" value="${dir.ID}" ${isChecked}> ${dir.VALUE}</label>`; });
    container.innerHTML += `<div class="dep-block"><div class="dep-title">Раздел: ${sec.VALUE}</div><div class="dep-list">${optionsHtml}</div></div>`;
  });
}

window.renderListDependencies = renderListDependencies;