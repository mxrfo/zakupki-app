// js/logic/settings/deps.js — Вкладка "Связи списков"

function renderListDependencies() {
	const container = document.getElementById('list-dependencies-container');
	if (!container) return;
	container.innerHTML = '';
	const secDef = fieldDefs[actualFields.section];
	const dirDef = fieldDefs[actualFields.direction];
	if (!secDef || !secDef.items || !dirDef || !dirDef.items) {
		container.innerHTML = '<p class="empty-note">Не найдены поля "Раздел" или "Направление"</p>';
		return;
	}
	// ✅ FIX: DocumentFragment + createElement/textContent вместо innerHTML (XSS)
	const fragment = document.createDocumentFragment();
	secDef.items.forEach(sec => {
		const secId = String(sec.ID);
		const checkedDirs = settings.listDependencies[secId] || [];

		const block = document.createElement('div');
		block.className = 'dep-block';

		const title = document.createElement('div');
		title.className = 'dep-title';
		title.textContent = 'Раздел: ' + String(sec.VALUE || '');
		block.appendChild(title);

		const list = document.createElement('div');
		list.className = 'dep-list';

		dirDef.items.forEach(dir => {
			const isChecked = checkedDirs.includes(String(dir.ID));
			const label = document.createElement('label');
			label.className = 'dep-chip' + (isChecked ? ' selected' : '');

			const input = document.createElement('input');
			input.type = 'checkbox';
			input.className = 'dir-dep-check';
			input.setAttribute('data-sec', secId);
			input.value = String(dir.ID);
			input.checked = isChecked;

			const text = document.createTextNode(String(dir.VALUE || ''));

			label.appendChild(input);
			label.appendChild(text);
			list.appendChild(label);
		});

		block.appendChild(list);
		fragment.appendChild(block);
	});
	container.appendChild(fragment);
}

window.renderListDependencies = renderListDependencies;