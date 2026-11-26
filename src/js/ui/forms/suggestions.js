// js/ui/forms/suggestions.js — Автоподсказки из кэша закупок

let _itemSuggestions = null;
let _topPurposes = [];
let _topSuppliers = [];

function buildItemSuggestions() {
  if (_itemSuggestions) return _itemSuggestions;
  const map = new Map();
  (items || []).forEach(function (it) {
    const names = Array.isArray(it[actualFields.detailName]) ? it[actualFields.detailName] : (it[actualFields.detailName] ? [it[actualFields.detailName]] : []);
    const purposes = Array.isArray(it[actualFields.detailPurpose]) ? it[actualFields.detailPurpose] : (it[actualFields.detailPurpose] ? [it[actualFields.detailPurpose]] : []);
    const prices = Array.isArray(it[actualFields.detailPrice]) ? it[actualFields.detailPrice] : (it[actualFields.detailPrice] ? [it[actualFields.detailPrice]] : []);
    const qtys = Array.isArray(it[actualFields.detailQty]) ? it[actualFields.detailQty] : (it[actualFields.detailQty] ? [it[actualFields.detailQty]] : []);
    const links = Array.isArray(it[actualFields.detailLink]) ? it[actualFields.detailLink] : (it[actualFields.detailLink] ? [it[actualFields.detailLink]] : []);
    const sups = actualFields.detailSupplier ? (Array.isArray(it[actualFields.detailSupplier]) ? it[actualFields.detailSupplier] : (it[actualFields.detailSupplier] ? [it[actualFields.detailSupplier]] : [])) : [];
    names.forEach(function (nm, i) {
      const key = (nm || '').trim().toLowerCase();
      if (!key) return;
      const price = parseAmount(prices[i]) || 0;
      const qty = parseAmount(qtys[i]) || 0;
      const sup = (sups[i] || '').trim();
      const pur = (purposes[i] || '').trim();
      const lnk = (links[i] || '').trim();
      if (!map.has(key)) {
        map.set(key, { name: nm.trim(), price: price, qty: qty, supplier: sup, purpose: pur, link: lnk, count: 1 });
      } else {
        const rec = map.get(key);
        rec.count++;
        if (price > 0) rec.price = price;
        if (qty > 0) rec.qty = qty;
        if (sup) rec.supplier = sup;
        if (pur) rec.purpose = pur;
        if (lnk) rec.link = lnk;
      }
    });
  });
  _itemSuggestions = Array.from(map.values()).sort((a, b) => b.count - a.count);
  const pc = new Map(), sc = new Map();
  _itemSuggestions.forEach(function (r) {
    if (r.purpose) pc.set(r.purpose, (pc.get(r.purpose) || 0) + r.count);
    if (r.supplier) sc.set(r.supplier, (sc.get(r.supplier) || 0) + r.count);
  });
  _topPurposes = Array.from(pc.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  _topSuppliers = Array.from(sc.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  return _itemSuggestions;
}

function invalidateSuggestions() { _itemSuggestions = null; _topPurposes = []; _topSuppliers = []; }

let _suggestEl = null;
let _suggestHandlersBound = false;

function ensureSuggestEl() {
  if (_suggestEl) return _suggestEl;

  _suggestEl = document.createElement('div');
  _suggestEl.className = 'suggest-dropdown';
  document.body.appendChild(_suggestEl);

  if (!_suggestHandlersBound) {
    _suggestHandlersBound = true;

    document.addEventListener('mousedown', function (e) {
      const item = e.target.closest('.suggest-item');
      if (!item || !_suggestEl || !_suggestEl.classList.contains('open')) return;

      e.preventDefault();

      const idx = +item.dataset.idx;
      const rec = _suggestEl._list && _suggestEl._list[idx];
      const input = _suggestEl._input;
      const card = input && input.closest('.pos-card');

      if (rec && card) {
        fillCardFromSuggestion(card, rec);
      }
      _suggestEl.classList.remove('open');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _suggestEl) _suggestEl.classList.remove('open');
    });
  }

  return _suggestEl;
}

function onDetNameInput(input) {
  const card = input.closest('.pos-card');
  if (!card) return;
  const pv = card.querySelector('.pos-preview');
  const v = input.value.trim();
  if (pv) {
    pv.textContent = v || 'Без названия';
    pv.classList.toggle('empty', !v);
  }
  calculateRowTotal(input);
  maybeAutoFillShortDesc();
  showSuggestions(input);
}

function showSuggestions(input) {
  const dd = ensureSuggestEl();
  dd._input = input;

  const q = input.value.trim().toLowerCase();
  if (q.length < 2) { dd.classList.remove('open'); return; }

  const list = buildItemSuggestions().filter(function (r) {
    return r.name.toLowerCase().indexOf(q) !== -1;
  }).slice(0, 8);

  if (!list.length) { dd.classList.remove('open'); return; }

  const rect = input.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.top = (rect.bottom + 4) + 'px';
  dd.style.left = rect.left + 'px';
  dd.style.width = rect.width + 'px';
  dd.innerHTML = list.map(function (r, idx) {
    return '<div class="suggest-item" data-idx="' + idx + '">' +
      '<div class="suggest-name">' + escapeHtml(r.name) + '</div>' +
      '<div class="suggest-meta">' +
      (r.price > 0 ? '<span class="s-price">' + r.price.toFixed(2) + ' ₽</span>' : '') +
      (r.supplier ? ' · ' + escapeHtml(r.supplier) : '') +
      (r.count > 1 ? ' · брали ' + r.count + ' раз' : '') +
      '</div></div>';
  }).join('');

  dd.classList.add('open');
  dd._list = list;
}

function hideSuggestions() { if (_suggestEl) _suggestEl.classList.remove('open'); }

function fillCardFromSuggestion(card, rec) {
  if (!rec || !card) return;
  const set = (sel, val) => {
    const el = card.querySelector(sel);
    if (el && val !== undefined && val !== null && String(val).trim() !== '') {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  set('.det-name', rec.name);
  if (rec.price > 0) set('.det-price', rec.price);
  if (rec.qty > 0) set('.det-qty', rec.qty);
  if (rec.supplier) set('.det-supplier', rec.supplier);
  if (rec.purpose) set('.det-purpose', rec.purpose);
  if (rec.link) set('.det-link', rec.link);
}

function applyChip(chip) {
  if (window.event) {
    try { window.event.preventDefault(); window.event.stopPropagation(); } catch (_) { }
  }

  const val = chip.getAttribute('data-val');
  if (val === null) return;

  const group = chip.closest('.form-group');
  let input = null;
  if (group) {
    if (group.classList.contains('pg-supplier')) input = group.querySelector('.det-supplier');
    else if (group.classList.contains('pg-purpose')) input = group.querySelector('.det-purpose');
    else input = group.querySelector('input');
  }

  if (input) {
    input.value = val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  }
}

window.buildItemSuggestions = buildItemSuggestions;
window.invalidateSuggestions = invalidateSuggestions;
window.onDetNameInput = onDetNameInput;
window.hideSuggestions = hideSuggestions;
window.applyChip = applyChip;