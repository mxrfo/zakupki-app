// js/init.js — Инициализация приложения
window.addEventListener('error', function (ev) {
	try {
		if (typeof logAction === 'function') {
			logAction('JS ERROR: ' + (ev.message || 'unknown') + ' @ ' + (ev.filename || '') + ':' + (ev.lineno || ''), 'error');
		}
	} catch (e) {}
});
window.addEventListener('unhandledrejection', function (ev) {
	try {
		if (typeof logAction === 'function') {
			const reasonMsg = ev.reason && ev.reason.message ? ev.reason.message : ev.reason;
			logAction('UNHANDLED REJECTION: ' + reasonMsg, 'error');
		}
	} catch (e) {}
});
function setLoadingStep(step, total) {
	const container = document.getElementById('app-container');
	if (!container) return;
	const safeTotal = total > 0 ? total : 1;
	const pct = Math.max(0, Math.min(100, Math.round((step / safeTotal) * 100)));
	container.innerHTML = `<div class="loading loading-full"><div style="margin-bottom:12px;">Загрузка данных... ${pct}%</div><div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%;"></div></div></div>`;
}
// ✅ FIX: добавлена понятная пошаговая инструкция для пользователя
function showNoAuthError() {
	const container = document.getElementById('app-container');
	if (!container) return;
	container.innerHTML = `
		<div class="error-box error-center">
			<h3 class="mt-0">Приложение открыто вне контекста Битрикс24</h3>
			<p style="line-height:1.6; margin-bottom: 16px;">
				Вы перешли по прямой ссылке на файл приложения (домен <code>cdn-*.bitrix24.ru</code>).
				В этом режиме нет авторизации портала и доступа к CRM.
			</p>
			<ol style="text-align:left; line-height:1.6; margin: 0 auto 20px; max-width: 400px; padding-left: 20px;">
				<li>Откройте ваш портал Битрикс24.</li>
				<li>Перейдите в раздел <b>CRM</b> или <b>Приложения</b>.</li>
				<li>Запустите приложение <b>«Закупки»</b> из списка установленных.</li>
			</ol>
			<button class="btn btn-primary mt-8" onclick="tryRedirectToPortal()">Перейти в Битрикс24</button>
		</div>`;
	logAction('BX24.init не выполнился — приложение открыто без авторизации портала', 'error');
}
function tryRedirectToPortal() {
	const domain = (typeof getPortalDomain === 'function') ? getPortalDomain() : '';
	if (domain && /^https?:\/\//i.test(domain)) {
		window.location.href = domain + '/crm/smartprocess/' + parseInt(ENTITY_TYPE_ID, 10) + '/';
	} else {
		showToast('Не удалось определить адрес портала.', 'error');
	}
}
// ✅ FIX: убран fallback на settings.clientId — защита от подмены/устаревшего ID
function getClientId() {
	try {
		const auth = BX24.getAuth();
		if (auth && (auth.client_id || auth.CLIENT_ID)) {
			return String(auth.client_id || auth.CLIENT_ID).trim();
		}
	} catch (e) {}
	try {
		const params = new URLSearchParams(window.location.search);
		const urlClientId = params.get('client_id') || params.get('CLIENT_ID');
		if (urlClientId) return decodeURIComponent(urlClientId).trim();
	} catch (e) {}
	try {
		if (typeof BX24 !== 'undefined' && BX24.placement && typeof BX24.placement.info === 'function') {
			const info = BX24.placement.info();
			const options = (info && info.options) || {};
			if (options.client_id || options.CLIENT_ID) {
				return String(options.client_id || options.CLIENT_ID).trim();
			}
		}
	} catch (e) {}
	return '';
}
function getCurrentHandlerUrl() {
	return window.location.href.split('?')[0].split('#')[0];
}
function ensureAppPlacement() {
	const current = getCurrentHandlerUrl();
	BX24.callMethod('placement.get', {}, function (res) {
		if (res.error()) {
			logAction('placement.get: ' + getApiErrorMessage(res), 'error');
			return;
		}
		const list = res.data() || [];
		const mine = list.filter(p => String(p.placement || '').toUpperCase() === 'REST_APP_URI');
		const already = mine.some(p => p.handler === current);
		if (already) {
			logAction('placement: handler уже актуален (' + current + ')', 'info');
			settings.lastHandlerUrl = current;
			saveSettingsToBoth();
			return;
		}
		BX24.callMethod('placement.unbind', { PLACEMENT: 'REST_APP_URI' }, function (u) {
			if (u.error()) logAction('placement.unbind: ' + getApiErrorMessage(u), 'info');
			bindNewPlacement(current);
		});
	});
}
function bindNewPlacement(current) {
	logAction('placement.bind: привязываю handler ' + current, 'info');
	BX24.callMethod('placement.bind', { PLACEMENT: 'REST_APP_URI', HANDLER: current, TITLE: 'Закупки' }, function (bindRes) {
		if (bindRes.error()) {
			logAction('placement.bind FAILED: ' + getApiErrorMessage(bindRes), 'error');
			return;
		}
		logAction('placement.bind: успешно зарегистрирован', 'success');
		settings.lastHandlerUrl = current;
		saveSettingsToBoth();
	});
}
// ✅ FIX: не перезаписывать settings.mapping, если пользователь уже задал значение вручную
function autoMapInitFields() {
	const fd = window.fieldDefs || {};
	const mapping = settings.mapping || {};
	let changed = false;
	const searchTerms = {
		comment: ['комментарий', 'comment'],
		detailPrice: ['цена за 1', 'цена за единицу', 'price'],
		detailSupplier: ['поставщик', 'supplier'],
		manager: ['менеджер отдела', 'исполнитель', 'manager'],
		deptHead: ['руководитель отдела', 'dept head', 'head'],
		taskVyborSotr: ['задача по выбору', 'vybor', 'выбор сотрудника'],
		taskSbor: ['задача по сбору', 'sbor', 'сбор данных'],
		taskZagruz: ['задача по загрузке', 'zagruz', 'загрузка счёта'],
		delegateHistory: ['делегирован', 'delegate', 'история делегирований'],
		postponeDate: ['дата отложения', 'отложен'],
		creator: ['кто создал', 'создал запрос', 'автор запроса']
	};
	const codeExists = (code) => code && Object.keys(fd).some(k => k.toLowerCase() === String(code).toLowerCase());
	for (const key in searchTerms) {
		const cur = mapping[key];
		// ✅ FIX: пропускаем авто-маппинг, если пользователь уже вручную указал значение
		if (cur && cur !== '') continue;
		for (const fieldCode in fd) {
			const title = String((fd[fieldCode] && fd[fieldCode].title) || '').toLowerCase();
			let hit = false;
			for (const term of searchTerms[key]) {
				if (title.includes(term.toLowerCase())) {
					hit = true;
					break;
				}
			}
			if (hit) {
				mapping[key] = fieldCode;
				changed = true;
				logAction(`Авто-маппинг: ${key} → ${fieldCode} (${fd[fieldCode].title})`, 'info');
				break;
			}
		}
	}
	if (changed) {
		settings.mapping = mapping;
		saveSettingsToBoth();
	}
	return changed;
}
function loadSettingsWithFallback() {
	return new Promise(function (resolve) {
		BX24.callMethod('app.option.get', {}, function (res) {
			let loaded = false;
			if (res && !res.error() && res.data() && res.data().settings) {
				try {
					settings = { ...settings, ...JSON.parse(res.data().settings) };
					loaded = true;
					logAction('Настройки загружены из app.option', 'success');
				} catch (e) {
					logAction('Ошибка парсинга app.option: ' + e.message, 'error');
				}
			}
			if (!loaded) {
				try {
					const backup = localStorage.getItem('purchase_settings_backup');
					if (backup) {
						settings = { ...settings, ...JSON.parse(backup) };
						logAction('Настройки восстановлены из localStorage', 'info');
						BX24.callMethod('app.option.set', { options: { settings: JSON.stringify(settings) } }, function () {});
					} else {
						logAction('Настройки не найдены — используются значения по умолчанию', 'info');
					}
				} catch (e) {
					logAction('Ошибка чтения backup: ' + e.message, 'error');
				}
			}
			resolve();
		});
	});
}
function saveSettingsToBoth() {
	const json = JSON.stringify(settings);
	try {
		localStorage.setItem('purchase_settings_backup', json);
	} catch (e) {}
	BX24.callMethod('app.option.set', { options: { settings: json } }, function (res) {
		if (res && res.error()) logAction('Ошибка сохранения в app.option: ' + getApiErrorMessage(res), 'error');
		else logAction('Настройки сохранены в app.option + localStorage', 'success');
	});
}
function syncClientIdAndBuild() {
	const liveId = getClientId();
	const savedId = (settings.clientId || '').trim();
	if (liveId && liveId !== savedId) {
		logAction('client_id обновлён: ' + (savedId || '—') + ' → ' + liveId, 'info');
		settings.clientId = liveId;
	} else if (!liveId) {
		logAction('⚠ client_id недоступен. Впишите его вручную: ⚙ Настройки → "Client ID приложения".', 'error');
	}
	const savedBuild = (settings.lastBuildId || '').trim();
	if ((savedBuild && savedBuild !== APP_BUILD_ID) || !savedBuild) {
		logAction('Обнаружено обновление архива (' + (savedBuild || 'первый запуск') + ' → ' + APP_BUILD_ID + '). Сбрасываю кэш бота.', 'info');
		try {
			if (typeof clearBotCache === 'function') clearBotCache();
		} catch (e) {}
		settings.lastBuildId = APP_BUILD_ID;
		saveSettingsToBoth();
	} else if (liveId && liveId !== savedId) {
		saveSettingsToBoth();
	}
}
function readLocalStorageSafe(key) {
	try {
		return localStorage.getItem(key);
	} catch (e) {
		return null;
	}
}
function init() {
	logAction('Инициализация приложения... build=' + APP_BUILD_ID, 'info');
	setLoadingStep(0, 5);
	if (typeof BX24 === 'undefined') {
		logAction('ОШИБКА: BX24 API не загружен.', 'error');
		const container = document.getElementById('app-container');
		if (container) {
			container.innerHTML = '<div class="error-box">Ошибка подключения к Битрикс24. Обновите страницу.</div>';
		}
		return;
	}
	let inited = false;
	const initTimeout = setTimeout(function () {
		if (inited) return;
		showNoAuthError();
	}, 8000);
	BX24.init(() => {
		inited = true;
		clearTimeout(initTimeout);
		b24Ready = true;
		try {
			const d = BX24.getDomain();
			if (d && d.indexOf('cdn-') === -1) window.__portalDomain = 'https://' + d;
		} catch (e) {}
		setLoadingStep(1, 5);
		BX24.callBatch({ user: ['user.current', {}], isAdmin: ['user.admin', {}] }, (res) => {
			if (res.user && !res.user.error()) {
				currentUser = res.user.data();
				userNames[currentUser.ID] = `${currentUser.NAME} ${currentUser.LAST_NAME}`;
			} else {
				logAction('Ошибка получения пользователя', 'error');
				return;
			}
			if (res.isAdmin && !res.isAdmin.error()) {
				actualRoles.isAdmin = res.isAdmin.data() === true;
				if (actualRoles.isAdmin) {
					const btnSettings = document.getElementById('btn-settings');
					const roleViewerContainer = document.getElementById('role-viewer-container');
					const testModeContainer = document.getElementById('test-mode-container');
					const scenarioContainer = document.getElementById('scenario-container');
					const scenarioSelect = document.getElementById('scenario-select');
					if (btnSettings) btnSettings.style.display = 'flex';
					if (roleViewerContainer) roleViewerContainer.style.display = 'flex';
					if (testModeContainer) testModeContainer.style.display = 'flex';
					if (scenarioContainer) {
						scenarioContainer.style.display = 'flex';
						if (scenarioSelect) scenarioSelect.value = currentScenario;
					}
				}
			}
			loadSettingsWithFallback().then(function () {
				let mappingMigrated = false;
				if (!settings.mapping) {
					settings.mapping = { ...DEFAULT_MAPPING };
					mappingMigrated = true;
				} else {
					if (settings.mapping.shortDesc === 'ufCrm17_1792761268') {
						settings.mapping.shortDesc = DEFAULT_MAPPING.shortDesc;
						mappingMigrated = true;
					}
					if (settings.mapping.detailPrice === 'ufCrm17_price_ed') {
						settings.mapping.detailPrice = DEFAULT_MAPPING.detailPrice;
						mappingMigrated = true;
					}
					['manager', 'deptHead', 'approver', 'taskVyborSotr', 'taskSbor', 'taskZagruz', 'delegateHistory'].forEach(k => {
						if (!settings.mapping[k]) {
							settings.mapping[k] = DEFAULT_MAPPING[k];
							mappingMigrated = true;
						}
					});
				}
				if (mappingMigrated) {
					logAction('Миграция маппинга выполнена', 'info');
					saveSettingsToBoth();
				}
				isTestMode = readLocalStorageSafe('purchase_test_mode') === 'true';
				const testToggle = document.getElementById('test-mode-toggle');
				if (testToggle) testToggle.checked = isTestMode;
				currentScenario = readLocalStorageSafe('purchase_scenario') || 'none';
				ENTITY_TYPE_ID = settings.entityTypeId || 1072;
				currentCategoryId = settings.categoryId || 65;
				systemUserId = settings.systemUserId || 175;
				setLoadingStep(2, 5);
				syncClientIdAndBuild();
				try {
					if (actualRoles.isAdmin) ensureAppPlacement();
				} catch (e) {}
				const CACHE_TTL = 5 * 60 * 1000;
				const cachedMeta = readLocalStorageSafe(CACHE_KEY);
				let useCache = false;
				if (cachedMeta) {
					try {
						const parsed = JSON.parse(cachedMeta);
						if (parsed.timestamp && (Date.now() - parsed.timestamp) < CACHE_TTL) {
							useCache = true;
							fieldDefs = parsed.fieldDefs || {};
							spStages = parsed.spStages || {};
							spStagesSorted = parsed.spStagesSorted || [];
							departments = parsed.departments || [];
							allUsers = parsed.allUsers || [];
							userNames = { ...userNames, ...(parsed.userNames || {}) };
							userDepts = { ...userDepts, ...(parsed.userDepts || {}) };
							logAction(`Использован свежий кэш метаданных (${Math.round((Date.now() - parsed.timestamp) / 1000)} сек назад)`, 'info');
						}
					} catch (e) {
						console.warn('Ошибка чтения кэша', e);
					}
				}
				if (useCache) {
					applyActualFieldsFromMapping();
					if (autoMapInitFields()) {
						applyActualFieldsFromMapping();
						saveToCacheWithTimestamp();
					}
					checkUserRoles();
					refreshUnavailableUsers(function () {
						setLoadingStep(5, 5);
						loadAllData();
					});
					return;
				}
				logAction('Загрузка свежих полей и справочников...', 'info');
				setLoadingStep(3, 5);
				BX24.callBatch({
					uCurrent: ['user.get', { ID: currentUser.ID }],
					fields: ['crm.item.fields', { entityTypeId: ENTITY_TYPE_ID }],
					statuses: ['crm.status.list', {}],
					depts: ['department.get', {}],
					users: ['user.get', { active: true, SELECT: ['ID', 'NAME', 'LAST_NAME', 'UF_DEPARTMENT', 'ACTIVE'], ORDER: { LAST_NAME: 'ASC' } }]
				}, (metaRes) => {
					setLoadingStep(4, 5);
					if (metaRes.uCurrent && !metaRes.uCurrent.error() && metaRes.uCurrent.data().length > 0) {
						currentUser.UF_DEPARTMENT = metaRes.uCurrent.data()[0].UF_DEPARTMENT;
					}
					if (metaRes.fields && !metaRes.fields.error()) {
						fieldDefs = metaRes.fields.data().fields;
						applyActualFieldsFromMapping();
						autoMapInitFields();
						applyActualFieldsFromMapping();
						logAction('Поля успешно обновлены', 'success');
					}
					if (metaRes.statuses && !metaRes.statuses.error()) {
						spStages = {};
						spStagesSorted = [];
						const prefix = `DT${ENTITY_TYPE_ID}_${currentCategoryId}:`;
						metaRes.statuses.data().forEach(s => {
							if (s.STATUS_ID && s.STATUS_ID.startsWith(prefix)) {
								spStages[s.STATUS_ID] = { name: s.NAME, color: s.COLOR };
								spStagesSorted.push({ id: s.STATUS_ID, name: s.NAME, sort: parseInt(s.SORT, 10) || 0 });
							}
						});
						spStagesSorted.sort((a, b) => a.sort - b.sort);
					}
					if (metaRes.depts && !metaRes.depts.error()) {
						departments = metaRes.depts.data() || [];
						departments.sort((a, b) => a.NAME.localeCompare(b.NAME));
					}
					if (metaRes.users && !metaRes.users.error()) {
						allUsers = metaRes.users.data() || [];
						allUsers.forEach(u => {
							userNames[u.ID] = `${u.NAME} ${u.LAST_NAME}`;
							if (u.UF_DEPARTMENT && Array.isArray(u.UF_DEPARTMENT) && u.UF_DEPARTMENT.length > 0) {
								const deptNames = u.UF_DEPARTMENT.map(dId => {
									const dept = departments.find(d => String(d.ID) === String(dId));
									return dept ? dept.NAME : '';
								}).filter(n => n);
								if (deptNames.length > 0) userDepts[u.ID] = deptNames.join(', ');
							}
						});
						if (!userDepts[currentUser.ID] && currentUser.UF_DEPARTMENT) {
							const dIds = Array.isArray(currentUser.UF_DEPARTMENT) ? currentUser.UF_DEPARTMENT : [currentUser.UF_DEPARTMENT];
							const deptNames = dIds.map(dId => {
								const dept = departments.find(d => String(d.ID) === String(dId));
								return dept ? dept.NAME : '';
							}).filter(n => n);
							if (deptNames.length > 0) userDepts[currentUser.ID] = deptNames.join(', ');
						}
						logAction(`Загружено пользователей: ${allUsers.length} (все активные)`, 'info');
					}
					saveToCacheWithTimestamp();
					checkUserRoles();
					refreshUnavailableUsers(function () {
						setLoadingStep(5, 5);
						loadAllData();
					});
				});
			});
		});
	});
}
function applyActualFieldsFromMapping() {
	actualFields = {};
	for (const key in settings.mapping) {
		const fieldCode = settings.mapping[key];
		const foundKey = Object.keys(fieldDefs).find(k => k.toLowerCase() === String(fieldCode).toLowerCase());
		actualFields[key] = foundKey || fieldCode;
	}
	function findByTitle(needles) {
		return Object.keys(fieldDefs).find(code => {
			const t = String((fieldDefs[code] && fieldDefs[code].title) || '').toLowerCase().replace(/ё/g, 'е');
			return needles.some(n => t.includes(n));
		});
	}
	const codeExists = (code) => code && Object.keys(fieldDefs).some(k => k.toLowerCase() === String(code).toLowerCase());
	if (!codeExists(actualFields.dept)) {
		const f = findByTitle(['ответственный отдел']);
		if (f) actualFields.dept = f;
	}
	if (!codeExists(actualFields.combinedDir)) {
		const f = findByTitle(['раздел+направление', 'раздел + направление']);
		if (f) actualFields.combinedDir = f;
	}
	if (!codeExists(actualFields.postponeDate)) {
		const f = findByTitle(['дата отложения', 'отложен']);
		if (f) actualFields.postponeDate = f;
	}
	if (!codeExists(actualFields.creator)) {
		const f = findByTitle(['кто создал', 'создал запрос', 'автор запроса']);
		if (f) actualFields.creator = f;
	}
	if (!codeExists(actualFields.detailSupplier)) {
		const f = findByTitle(['поставщик', 'supplier']);
		if (f) actualFields.detailSupplier = f;
	}
}
function saveToCacheWithTimestamp() {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify({
			timestamp: Date.now(),
			fieldDefs,
			spStages,
			spStagesSorted,
			departments,
			allUsers,
			userNames,
			userDepts
		}));
	} catch (e) {
		console.warn('Ошибка сохранения кэша', e);
	}
}
window.onload = init;