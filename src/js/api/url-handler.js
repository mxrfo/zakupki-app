// js/api/url-handler.js — Обработка URL-параметров при открытии приложения

function handleUrlParams() {
  var params = getIncomingParams();
  var itemId = params.itemId;
  var action = params.action;
  var tab = params.tab;
  if (!itemId) return;
  if (String(itemId) === String(lastHandledItemId) && urlParamsProcessed) return;
  lastHandledItemId = itemId;
  urlParamsProcessed = true;
  var attempts = 0;
  var checkItemsInterval = setInterval(function () {
    attempts++;
    if (items.length > 0 || attempts >= 20) {
      clearInterval(checkItemsInterval);
      if (items.length > 0) {
        var id = parseInt(itemId);
        if (tab) { try { if (typeof switchTab === 'function') switchTab(tab); } catch (e) {} }
        if (action === 'fill') openDataModal(id);
        else if (action === 'upload') openUploadModal(id);
        else if (action === 'approve') openActionModal(id, 'approve_terms');
        else if (action === 'reject') openActionModal(id, 'reject_terms');
        else if (action === 'rework') openActionModal(id, 'send_to_rework');
        else if (action === 'select_executor') openExecutorModal(id);
        else if (action === 'approve_invoice') openActionModal(id, 'approve_invoice');
        else if (action === 'reject_invoice') openActionModal(id, 'reject_invoice');
        else if (action === 'confirm_payment') openActionModal(id, 'confirm_payment');
        else if (action === 'confirm_receipt') openActionModal(id, 'confirm_receipt');
        else openViewModal(id);
        try { window.history.replaceState({}, '', window.location.protocol + "//" + window.location.host + window.location.pathname); } catch (e) {}
      } else showToast('Не удалось загрузить данные', 'error');
    }
  }, 500);
}

function getIncomingParams() {
  try { if (typeof BX24 !== 'undefined' && BX24.placement && typeof BX24.placement.info === 'function') { const info = BX24.placement.info(); const o = (info && info.options) || {}; if (o.id) return { action: o.action || 'view', itemId: o.id, tab: o.tab || '' }; } } catch (e) {}
  try { const up = new URLSearchParams(window.location.search); if (up.get('id')) return { action: up.get('action') || 'view', itemId: up.get('id'), tab: up.get('tab') || '' }; } catch (e) {}
  try { const h = (window.location.hash || '').replace(/^#/, ''); if (h) { const hp = new URLSearchParams(h); if (hp.get('id')) return { action: hp.get('action') || 'view', itemId: hp.get('id'), tab: hp.get('tab') || '' }; } } catch (e) {}
  return { action: '', itemId: '', tab: '' };
}

window.handleUrlParams = handleUrlParams;
window.getIncomingParams = getIncomingParams;