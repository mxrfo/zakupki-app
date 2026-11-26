// js/api/group-status.js — Групповые статусные уведомления

function buildGroupBody(item, opts) {
  opts = opts || {};
  const lines = [];
  if (opts.deadline) lines.push('[B]Срок:[/B] ' + formatDeadline(item[actualFields.deadlineZakup]));
  if (opts.dir) { const dir = resolveCombinedDir(item); if (dir) lines.push('[B]Раздел/Направление:[/B] ' + dir); }
  if (opts.shortDesc) lines.push('[B]Что нужно закупить (Кратко):[/B] ' + getShortDesc(item));
  if (opts.manager) { const m = getMgrInfo(item); if (m.id) lines.push('[B]Менеджер:[/B] ' + m.name + (m.dept && m.dept !== '—' ? ' (' + m.dept + ')' : '')); }
  if (opts.creator) { const c = getCreatorInfo(item); lines.push('[B]Кто создал запрос:[/B] ' + c.name + (c.dept && c.dept !== '—' ? ' (' + c.dept + ')' : '')); }
  const product = parseAmount(item[actualFields.amountProduct]) || 0;
  const delivery = parseAmount(item[actualFields.amountDelivery]) || 0;
  const total = product + delivery;
  if (opts.sumTotal) lines.push('[B]Сумма (с доставкой):[/B] ' + total.toLocaleString('ru-RU') + ' ₽');
  if (opts.sumBreakdown) {
    lines.push('[B]Сумма (без доставки):[/B] ' + product.toLocaleString('ru-RU') + ' ₽');
    lines.push('[B]Сумма за доставку:[/B] ' + delivery.toLocaleString('ru-RU') + ' ₽');
    lines.push('[B]ИТОГО:[/B] ' + total.toLocaleString('ru-RU') + ' ₽');
  }
  return lines.join('\n');
}

const GROUP_STATUS_KINDS = {
  assigned: { title: 'Передано в обработку', body: { deadline: true, dir: true, shortDesc: true, manager: true } },
  sent_to_approval: { title: 'Отправлено на согласование', body: { deadline: true, dir: true, shortDesc: true, manager: true, creator: true, sumTotal: true } },
  approved: { title: 'Согласовано', body: { shortDesc: true, manager: true, creator: true } },
  rejected: { title: 'Отклонено', body: { shortDesc: true, manager: true, creator: true } },
  rework: { title: 'Отправлено на корректировки', body: { shortDesc: true, manager: true, creator: true } },
  invoice_received: { title: 'Счёт на оплату получен, отправлен на утверждение и оплату', body: { deadline: true, dir: true, shortDesc: true, sumBreakdown: true } },
  invoice_paid: { title: 'Счёт оплачен', body: { deadline: true, dir: true, shortDesc: true, sumTotal: true } }
};

function groupStatusNotify(item, kind, dedupeBase) {
  if (!item || !kind) return;
  const conf = GROUP_STATUS_KINDS[kind];
  if (!conf) return;
  try {
    const title = buildTitle(conf.title, item);
    const c = getCreatorInfo(item);
    const message = (c.id ? greetUser(c.id) + '\n\n' : '') + buildGroupBody(item, conf.body);
    const userIds = [];
    if (c.id) userIds.push(parseInt(c.id));
    const m = getMgrInfo(item); if (m.id) userIds.push(parseInt(m.id));
    const h = resolveDeptHeadId(item, true); if (h) userIds.push(parseInt(h));
    const dd = dedupeBase || ('group_' + kind + '_' + item.id + '_' + (item.stageId || '') + '_' + (kind === 'assigned' ? (m.id || '') : ''));
    notifyGroupStatus(title, message, userIds, null, dd);
  } catch (e) {
    logAction('Ошибка группового статуса "' + kind + '": ' + e.message, 'error');
  }
}

window.buildGroupBody = buildGroupBody;
window.GROUP_STATUS_KINDS = GROUP_STATUS_KINDS;
window.groupStatusNotify = groupStatusNotify;