// js/ui/modals/upload.js — Модалка загрузки входящего счёта

function openUploadModal(id) {
	const item = items.find(i => i.id === id);
	if (!item) return;
	const stage = spStages[item.stageId];
	const stName = stage ? stage.name.toLowerCase().replace(/ё/g, 'е') : '';
	if (!stName.includes('загрузка')) {
		showToast('Счёт уже передан экономисту — загрузка/замена недоступна', 'info');
		return;
	}
	document.getElementById('form-upload').reset();
	document.getElementById('upload-id').value = id;
	const nameDisplay = document.getElementById('file-name-display');
	const fileInput = document.getElementById('upload-file');
	const fileInfo = getFileInfo(item, actualFields.fileInvoice);
	if (fileInfo && fileInfo.url) {
		nameDisplay.innerText = 'Уже загружен: ' + fileInfo.name + ' (можно заменить)';
		nameDisplay.style.color = '#10b981';
		fileInput.required = false;
	} else {
		nameDisplay.innerText = 'Нажмите, чтобы выбрать файл';
		nameDisplay.style.color = '#0f172a';
		fileInput.required = true;
	}
	const modal = document.querySelector('#modal-upload .modal');
	if (modal) modal.style.borderTop = `6px solid ${stage ? stage.color : '#64748b'}`;
	if (item[actualFields.deadlinePay]) document.getElementById('upload-deadline').value = String(item[actualFields.deadlinePay]).split('T')[0];
	document.getElementById('modal-upload').style.display = 'flex';
}

function submitUpload(e) {
	e.preventDefault();
	const id = document.getElementById('upload-id').value;
	const fileInput = document.getElementById('upload-file');
	const deadline = document.getElementById('upload-deadline').value;
	const item = items.find(i => i.id == id);
	const existingFile = item ? getFileInfo(item, actualFields.fileInvoice) : null;
	const hasNewFile = fileInput.files.length > 0;

	if (!hasNewFile && !existingFile) return showToast('Выберите файл счёта', 'error');

	const doUpdate = (filePayload) => {
		const targetStageId = getStageIdByName('обработка');
		const fields = { [actualFields.deadlinePay]: deadline };
		if (filePayload) fields[actualFields.fileInvoice] = filePayload;
		if (targetStageId) fields.stageId = targetStageId;

		logAction('Сохранение счёта...', 'info');
		BX24.callMethod('crm.item.update', { entityTypeId: ENTITY_TYPE_ID, id: id, fields: fields }, (res) => {
			if (res.error()) {
				logAction('Ошибка загрузки счёта: ' + getApiErrorMessage(res), 'error');
				showToast('Ошибка: ' + getApiErrorMessage(res), 'error');
				return;
			}
			logAction('Счёт загружен', 'success');
			if (item) {
				if (filePayload) item[actualFields.fileInvoice] = filePayload;
				item[actualFields.deadlinePay] = deadline;
				if (targetStageId) item.stageId = targetStageId;
			}
			// ✅ FIX: Убран лишний crm.item.get — используем локальный item
			try {
				// ✅ FIX: Уведомление уходит экономисту (руководителю econ-отдела), а не просто руководителю отдела закупки
				const deptVal = item[actualFields.dept];
				const deptId = String(Array.isArray(deptVal) ? deptVal[0] : (deptVal || ''));
				let econId = null;
				if (settings.econDepts && settings.econDepts.includes(deptId)) {
					econId = settings.deptHeads[deptId] ? parseInt(settings.deptHeads[deptId], 10) : null;
					if (!econId) {
						const d = departments.find(x => String(x.ID) === deptId);
						if (d && d.UF_HEAD) econId = parseInt(d.UF_HEAD, 10);
					}
				}
				if (!econId) econId = resolveDeptHeadId(item, true); // fallback

				if (econId) notifyInvoiceUploaded(econId, item);
			} catch (e) { logAction('Ошибка уведомления по счёту: ' + e.message, 'error'); }
			try { groupStatusNotify(item, 'invoice_received'); } catch (e) { logAction('Ошибка группового статуса по счёту: ' + e.message, 'error'); }
			closeModal('modal-upload');
			invalidateSuggestions();
			loadAllData();
		});
	};

	if (hasNewFile) {
		const file = fileInput.files[0];
		// ✅ FIX: Лимит размера файла (10 МБ)
		if (file.size > 10 * 1024 * 1024) {
			return showToast('Файл слишком большой (макс. 10 МБ)', 'error');
		}
		logAction('Чтение файла...', 'info');
		const reader = new FileReader();
		// ✅ FIX: Обработка ошибки чтения файла
		reader.onerror = function () {
			showToast('Ошибка чтения файла', 'error');
			logAction('FileReader error', 'error');
		};
		reader.onload = function (evt) {
			const base64 = evt.target.result.split(',')[1];
			doUpdate([[file.name, base64]]);
		};
		reader.readAsDataURL(file);
	} else {
		doUpdate(null);
	}
}

window.openUploadModal = openUploadModal;
window.submitUpload = submitUpload;