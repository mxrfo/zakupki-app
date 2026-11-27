// js/api/notifications.js — Индивидуальные уведомления через бота

function notifySelectExecutor(userId, item, taskId, comment) {
	userId = parseInt(userId);
	if (!userId || !item) return;
	const title = buildTitle('Необходимо выбрать исполнителя', item);
	let message = greetUser(userId) + '\n' + buildBody(item, { creator: true, sum: true, comment: true });
	if (comment && String(comment).trim() && message.indexOf('[B]Комментарий:[/B]') === -1) {
		message += '\n[B]Комментарий:[/B] ' + cleanText(comment);
	}
	const domain = getPortalDomain();
	const taskLink = taskId ? (domain ? domain + '/company/personal/user/' + userId + '/tasks/task/view/' + taskId + '/' : '') : '';
	const links = [
		{ text: '👤 Выбрать исполнителя', url: buildAppLink('select_executor', item.id, 'my_requests') },
		taskLink ? { text: '✅ Открыть задачу', url: taskLink } : null,
		{ text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'my_requests') }
	].filter(function (l) { return l && l.url; });
	sendBotNotification(userId, title, message, links, null, 'select_executor_' + item.id);
}

function notifyCollectData(userId, item) {
	userId = parseInt(userId);
	if (!userId || !item) return;
	const title = buildTitle('Необходимо собрать данные и рассчитать стоимость', item);
	const message = greetUser(userId) + '\n' + buildBody(item, { creator: true, sum: true, comment: true });
	const links = [{ text: '📝 Заполнить данные', url: buildAppLink('fill', item.id, 'inbox') }].filter(l => l.url);
	sendBotNotification(userId, title, message, links, null, 'collect_' + item.id);
}

function notifyApprovalNeeded(headId, item) {
	headId = parseInt(headId);
	if (!headId || !item) { logAction('notifyApprovalNeeded: headId не определён', 'error'); return; }
	const title = buildTitle('Согласование условий', item);
	const message = greetUser(headId) + '\n' + buildBody(item, { manager: true, creator: true, sum: true, sumSplit: true, comment: true });
	const links = [
		{ text: '✅ Согласовать', url: buildAppLink('approve', item.id, 'inbox') },
		{ text: '🔧 На доработку', url: buildAppLink('rework', item.id, 'inbox') },
		{ text: '❌ Отклонить', url: buildAppLink('reject', item.id, 'inbox') },
		{ text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }
	].filter(l => l.url);
	notifyUserViaBot(headId, title, message, links, null, 'approval_' + item.id);
}

function notifyReworkNeeded(managerId, item, reworkComment) {
	managerId = parseInt(managerId);
	if (!managerId || !item) return;
	const title = buildTitle('Необходимо корректировать данные', item);
	const body = buildBody(item, {});
	const message = greetUser(managerId) + '\n' + body + (reworkComment ? '\n[B]Комментарий:[/B] ' + reworkComment : '');
	const links = [{ text: '🔧 Исправить данные', url: buildAppLink('fill', item.id, 'inbox') }].filter(l => l.url);
	notifyUserViaBot(managerId, title, message, links, null, 'rework_' + item.id);
}

function notifyAfterDecision(managerId, item, approved) {
	managerId = parseInt(managerId);
	if (!managerId || !item) return;
	if (approved) {
		const title = buildTitle('Условия согласованы', item);
		const message = greetUser(managerId) + '\n' + buildBody(item, { sum: true, sumSplit: true });
		const links = [{ text: '📄 Загрузить счёт', url: buildAppLink('upload', item.id, 'inbox') }].filter(l => l.url);
		notifyUserViaBot(managerId, title, message, links, null, 'decision_' + item.id + '_ok');
	} else {
		const title = buildTitle('Закупка отклонена', item);
		const message = greetUser(managerId) + '\n' + buildBody(item, { comment: true });
		const links = [{ text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }].filter(l => l.url);
		notifyUserViaBot(managerId, title, message, links, null, 'decision_' + item.id + '_no');
	}
}

// ✅ FIX: dedupeBase теперь стабильный (item.id + stageId), а не Date.now() — дедуп снова работает
function notifyDataChangedOnApproval(econId, item) {
	econId = parseInt(econId);
	if (!econId || !item) return;
	const title = buildTitle('Изменены данные на этапе согласования', item);
	const message = greetUser(econId) + '\n' + buildBody(item, { manager: true, creator: true, sum: true, sumSplit: true, comment: true });
	const links = [
		{ text: '✅ Согласовать', url: buildAppLink('approve', item.id, 'inbox') },
		{ text: '🔧 На доработку', url: buildAppLink('rework', item.id, 'inbox') },
		{ text: '❌ Отклонить', url: buildAppLink('reject', item.id, 'inbox') },
		{ text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }
	].filter(l => l.url);
	notifyUserViaBot(econId, title, message, links, null, 'data_changed_' + item.id + '_' + (item.stageId || ''));
}

function notifyInvoiceUploaded(econId, item) {
	econId = parseInt(econId);
	if (!econId || !item) return;
	const title = buildTitle('Загружен счёт на оплату', item);
	const message = greetUser(econId) + '\n' + buildBody(item, { sum: true, sumSplit: true, file: true });
	const links = [
		{ text: '✅ Утвердить счёт', url: buildAppLink('approve_invoice', item.id, 'inbox') },
		{ text: '❌ Отклонить счёт', url: buildAppLink('reject_invoice', item.id, 'inbox') },
		{ text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }
	].filter(l => l.url);
	notifyUserViaBot(econId, title, message, links, null, 'inv_upload_' + item.id);
}

function notifyInvoiceEvent(item, kind) {
	if (!item) return;
	const mgrArr = Array.isArray(item[actualFields.manager]) ? item[actualFields.manager] : (item[actualFields.manager] ? [item[actualFields.manager]] : []);
	const mgrId = mgrArr.length ? parseInt(mgrArr[0]) : null;
	const headId = parseInt(item.createdBy) || null;
	const map = {
		approved: { kind: 'Счёт на оплату утверждён', to: [mgrId], links: [
			{ text: '💳 Подтвердить оплату', url: buildAppLink('confirm_payment', item.id, 'inbox') },
			{ text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }
		], body: { sum: true, sumSplit: true, file: true } },
		paid: { kind: 'Счёт на оплату оплачен', to: [mgrId, headId], links: [
			{ text: '📦 Подтвердить получение', url: buildAppLink('confirm_receipt', item.id, 'inbox') },
			{ text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }
		], body: { sum: true, sumSplit: true, file: true } },
		rejected: { kind: 'Счёт на оплату отклонён', to: [mgrId], links: [
			{ text: '🔧 Исправить данные', url: buildAppLink('fill', item.id, 'inbox') },
			{ text: '📋 Открыть закупку №' + item.id, url: buildAppLink('view', item.id, 'inbox') }
		], body: { comment: true } }
	};
	const info = map[kind];
	if (!info) return;
	const title = buildTitle(info.kind, item);
	const message = buildBody(item, info.body);
	const recipients = [...new Set((info.to || []).filter(Boolean))];
	recipients.forEach(function (uid) {
		notifyUserViaBot(uid, title, greetUser(uid) + '\n' + message, info.links, null, 'invoice_' + kind + '_' + item.id);
	});
}

window.notifySelectExecutor = notifySelectExecutor;
window.notifyCollectData = notifyCollectData;
window.notifyApprovalNeeded = notifyApprovalNeeded;
window.notifyReworkNeeded = notifyReworkNeeded;
window.notifyAfterDecision = notifyAfterDecision;
window.notifyDataChangedOnApproval = notifyDataChangedOnApproval;
window.notifyInvoiceUploaded = notifyInvoiceUploaded;
window.notifyInvoiceEvent = notifyInvoiceEvent;