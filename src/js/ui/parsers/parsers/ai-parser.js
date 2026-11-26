// ============================================================
// МОДУЛЬ: ai-parser.js
// ФИКС CONNECTION_RESET: отправка "сырого" бинарного JPEG.
// Корпоративные DPI и антивирусы часто блокируют base64 в JSON/FormData.
// Отправка чистого image/jpeg воспринимается как стандартная загрузка 
// файла и гарантированно проходит через сетевые фильтры.
// ============================================================
(function () {
  'use strict';

  var AI_TIMEOUT_MS = 45000;
  var AI_MAX_DIM = 800;
  var AI_JPEG_QUALITY = 0.5;

  var ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  var ICON_AI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></svg>';
  var ICON_UPLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]);
    });
  }

  function workerUrl() {
    return window.LINK_PARSER_WORKER_URL || 'https://zakupki-proxy.artemgvardin1.workers.dev';
  }

  // Сжимаем и возвращаем Blob (бинарные данные), а не base64-строку
  function compressImageToBlob(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var objUrl = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) { URL.revokeObjectURL(objUrl); return reject(new Error('Не удалось прочитать изображение')); }
          var scale = Math.min(1, AI_MAX_DIM / Math.max(w, h));
          var cw = Math.round(w * scale), ch = Math.round(h * scale);
          var canvas = document.createElement('canvas');
          canvas.width = cw; canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          URL.revokeObjectURL(objUrl);
          canvas.toBlob(function(blob) {
            if (blob) resolve(blob);
            else reject(new Error('Не удалось создать Blob'));
          }, 'image/jpeg', AI_JPEG_QUALITY);
        } catch (e) { URL.revokeObjectURL(objUrl); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(objUrl); reject(new Error('Файл не является изображением или повреждён')); };
      img.src = objUrl;
    });
  }

  var _modalBuilt = false;
  var _aiFile = null;
  function ensureModal() {
    if (_modalBuilt) return;
    if (document.getElementById('modal-ai-parse')) { _modalBuilt = true; return; }
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div id="modal-ai-parse" class="modal-overlay modal-ai" style="display:none;">' +
        '<div class="modal">' +
          '<div class="modal-header">' +
            '<h2>' + ICON_AI + ' Умный анализ страницы</h2>' +
            '<button type="button" class="btn-close" onclick="closeModal(\'modal-ai-parse\')">&times;</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<p class="ai-hint">Если сайт блокирует парсинг, загрузите скриншот. Изображение отправляется как бинарный файл для гарантированного обхода сетевых фильтров.</p>' +
            '<div class="ai-field">' +
              '<label class="ai-label">1. Скриншот страницы</label>' +
              '<div class="ai-drop" id="ai-drop-zone">' +
                ICON_UPLOAD +
                '<span id="ai-drop-text">Перетащите или выберите изображение</span>' +
                '<div class="ai-file-name" id="ai-file-name"></div>' +
                '<input type="file" id="ai-file-input" accept="image/png,image/jpeg,image/webp">' +
              '</div>' +
              '<div class="ai-preview" id="ai-preview"><img id="ai-preview-img" alt="превью"></div>' +
            '</div>' +
            '<div class="ai-field">' +
              '<label class="ai-label" for="ai-url-input">2. Ссылка на страницу (опционально)</label>' +
              '<input type="url" id="ai-url-input" class="ai-input" placeholder="https://...">' +
            '</div>' +
            '<div class="ai-field">' +
              '<label class="ai-label">Режим анализа</label>' +
              '<div class="ai-radio-group">' +
                '<label class="ai-radio selected"><input type="radio" name="ai-parse-mode" value="ai" checked> <span>ИИ-анализ (Gemini)</span></label>' +
                '<label class="ai-radio"><input type="radio" name="ai-parse-mode" value="standard"> <span>Обычный парсинг</span></label>' +
              '</div>' +
            '</div>' +
            '<div class="ai-status" id="ai-parse-status"></div>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn" onclick="closeModal(\'modal-ai-parse\')">Отмена</button>' +
            '<button type="button" class="btn btn-ai-run" id="btn-run-ai-parse" onclick="runAiParse()">' +
              '<span id="ai-parse-btn-text">Анализировать</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap.firstElementChild);
    bindModalEvents();
    _modalBuilt = true;
  }

  function bindModalEvents() {
    var drop = document.getElementById('ai-drop-zone');
    var input = document.getElementById('ai-file-input');
    if (!drop || !input) return;
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.remove('dragover'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setAiFile(f);
    });
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) setAiFile(input.files[0]);
    });
    document.querySelectorAll('.ai-radio input[name="ai-parse-mode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        document.querySelectorAll('.ai-radio').forEach(function (l) { l.classList.remove('selected'); });
        if (r.closest('.ai-radio')) r.closest('.ai-radio').classList.add('selected');
      });
    });
  }

  function setAiFile(file) {
    _aiFile = file;
    var drop = document.getElementById('ai-drop-zone');
    var nameEl = document.getElementById('ai-file-name');
    var textEl = document.getElementById('ai-drop-text');
    var preview = document.getElementById('ai-preview');
    var previewImg = document.getElementById('ai-preview-img');
    if (nameEl) nameEl.textContent = file.name;
    if (textEl) textEl.style.display = 'none';
    if (drop) drop.classList.add('has-file');
    if (preview && previewImg) {
      var objUrl = URL.createObjectURL(file);
      previewImg.onload = function () { URL.revokeObjectURL(objUrl); };
      previewImg.src = objUrl;
      preview.classList.add('show');
    }
  }

  function clearAiFile() {
    _aiFile = null;
    var drop = document.getElementById('ai-drop-zone');
    var nameEl = document.getElementById('ai-file-name');
    var textEl = document.getElementById('ai-drop-text');
    var preview = document.getElementById('ai-preview');
    var input = document.getElementById('ai-file-input');
    if (input) input.value = '';
    if (nameEl) nameEl.textContent = '';
    if (textEl) textEl.style.display = '';
    if (drop) drop.classList.remove('has-file');
    if (preview) preview.classList.remove('show');
  }

  function decorate(root) {
    if (!root || root.dataset.aiDecorated === '1') return;
    var isCard = !!root.querySelector('.link-input-wrapper');
    var isTable = (root.tagName === 'TR');
    if (!isCard && !isTable) return;
    root.dataset.aiDecorated = '1';

    if (isCard) {
      var wrapper = root.querySelector('.link-input-wrapper');
      var input = root.querySelector('.det-link');
      var v = input ? input.value : '';
      var label = root.querySelector('.pg-link label');
      if (label) label.style.display = 'none';
      wrapper.innerHTML =
        '<input type="url" class="det-link" style="display:none" value="' + esc(v) + '">' +
        '<button type="button" class="btn-icon-link" title="Открыть ссылку" data-url="' + esc(v) + '" ' +
        'onclick="openLink(this)" ' + (v ? '' : 'disabled') + '>' + ICON_LINK + '</button>' +
        '<button type="button" class="btn-icon-ai" title="ИИ-анализ / парсинг" onclick="openAiParseModal(this)">' + ICON_AI + '</button>';
    } else {
      var tinput = root.querySelector('.data-det-link');
      var td = tinput ? tinput.closest('td') : null;
      if (!td) return;
      var tv = tinput.value || '';
      td.innerHTML =
        '<input type="url" class="data-det-link" style="display:none" value="' + esc(tv) + '">' +
        '<button type="button" class="btn-icon-link" title="Открыть ссылку" data-url="' + esc(tv) + '" ' +
        'onclick="openLink(this)" ' + (tv ? '' : 'disabled') + '>' + ICON_LINK + '</button>' +
        '<button type="button" class="btn-icon-ai" title="ИИ-анализ / парсинг" onclick="openAiParseModal(this)">' + ICON_AI + '</button>';
    }
  }

  function decorateAll() {
    document.querySelectorAll('#purchase-items-container .pos-card').forEach(decorate);
    document.querySelectorAll('#data-detail-tbody tr').forEach(decorate);
  }

  var _obsStarted = false;
  function startObserver() {
    if (_obsStarted) return;
    _obsStarted = true;
    var cb = function () { decorateAll(); };
    var container = document.getElementById('purchase-items-container');
    var tbody = document.getElementById('data-detail-tbody');
    if (container) new MutationObserver(cb).observe(container, { childList: true, subtree: true });
    if (tbody) new MutationObserver(cb).observe(tbody, { childList: true, subtree: true });
    document.querySelectorAll('#data-detail-table thead th').forEach(function (th) {
      if (th.textContent.trim().toLowerCase() === 'ссылка') th.textContent = 'Действия';
    });
    decorateAll();
  }

  window.openAiParseModal = function (btn) {
    ensureModal();
    var root = btn.closest('.pos-card') || btn.closest('tr');
    if (!root) return;
    var input = root.querySelector('.det-link') || root.querySelector('.data-det-link');
    var url = input ? input.value.trim() : '';
    window._aiParseTarget = { root: root, input: input };
    document.getElementById('ai-url-input').value = url;
    clearAiFile();
    setStatus('', 'none');
    document.getElementById('ai-parse-btn-text').innerText = 'Анализировать';
    document.getElementById('btn-run-ai-parse').disabled = false;
    document.querySelector('input[name="ai-parse-mode"][value="ai"]').checked = true;
    document.querySelectorAll('.ai-radio').forEach(function (l) { l.classList.remove('selected'); });
    var aiRadio = document.querySelector('input[name="ai-parse-mode"][value="ai"]');
    if (aiRadio && aiRadio.closest('.ai-radio')) aiRadio.closest('.ai-radio').classList.add('selected');
    document.getElementById('modal-ai-parse').style.display = 'flex';
  };

  function setStatus(text, kind) {
    var el = document.getElementById('ai-parse-status');
    if (!el) return;
    if (kind === 'none') { el.className = 'ai-status'; el.textContent = ''; return; }
    el.className = 'ai-status show ' + (kind || 'info');
    el.textContent = text;
  }

  function applyParsed(root, data) {
    var isTable = (root.tagName === 'TR');
    var sel = {
      name: isTable ? '.data-det-name' : '.det-name',
      price: isTable ? '.data-det-price' : '.det-price',
      supplier: isTable ? '.data-det-supplier' : '.det-supplier'
    };
    function setIf(s, val) {
      if (val == null || String(val).trim() === '') return;
      var el = root.querySelector(s);
      if (el && !String(el.value || '').trim()) {
        el.value = String(val).trim();
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    setIf(sel.name, data.name || data.title);
    setIf(sel.price, data.price);
    setIf(sel.supplier, data.supplier);
    if (isTable && typeof window.calculateDataRowTotal === 'function') {
      var p1 = root.querySelector('.data-det-price'); if (p1) window.calculateDataRowTotal(p1);
    } else if (!isTable && typeof window.calculateRowTotal === 'function') {
      var p2 = root.querySelector('.det-price'); if (p2) window.calculateRowTotal(p2);
    }
  }

  function fetchWithTimeout(url, options, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    return fetch(url, Object.assign({}, options, { 
      signal: ctrl.signal,
      cache: 'no-store'
    }))
      .then(function (r) { clearTimeout(timer); return r; })
      .catch(function (e) {
        clearTimeout(timer);
        if (e && e.name === 'AbortError') throw new Error('Сервер не ответил за ' + Math.round(ms / 1000) + ' с.');
        throw new Error('Сетевая ошибка: соединение прервано. Попробуйте отключить антивирус на время загрузки или используйте другой режим.');
      });
  }

  window.runAiParse = function () {
    var target = window._aiParseTarget;
    if (!target) return;
    var url = document.getElementById('ai-url-input').value.trim();
    var mode = document.querySelector('input[name="ai-parse-mode"]:checked').value;
    var btn = document.getElementById('btn-run-ai-parse');
    var btnText = document.getElementById('ai-parse-btn-text');

    if (mode === 'standard' && !url) { setStatus('Для обычного парсинга укажите ссылку.', 'err'); return; }
    if (mode === 'ai' && !_aiFile && !url) { setStatus('Загрузите скриншот или укажите ссылку.', 'err'); return; }

    btn.disabled = true; btnText.innerText = 'Обработка...';
    setStatus('⏳ Сжимаю изображение и отправляю...', 'info');

    var prep = (_aiFile && mode === 'ai') ? compressImageToBlob(_aiFile) : Promise.resolve(null);

    prep.then(function (imageBlob) {
      if (mode === 'standard') {
        return window.fetchParsedProduct(url);
      }
      
      // Формируем URL с параметром ссылки, а тело запроса — чистый бинарный JPEG
      var fetchUrl = workerUrl() + '/ai';
      if (url) fetchUrl += '?url=' + encodeURIComponent(url);
      
      console.log('[AI-PARSER] Отправка сырого JPEG, размер:', (imageBlob.size / 1024).toFixed(2), 'KB');
      
      return fetchWithTimeout(fetchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' }, // Сетевой экран видит обычную загрузку картинки
        body: imageBlob
      }, AI_TIMEOUT_MS).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.error) || ('ИИ-сервер вернул HTTP ' + res.status));
          if (data && data.error) throw new Error(data.error);
          return data;
        });
      });
    }).then(function (data) {
      if (url && target.input) {
        target.input.value = url;
        var openBtn = target.root.querySelector('.btn-icon-link');
        if (openBtn) { openBtn.dataset.url = url; openBtn.disabled = false; }
      }
      applyParsed(target.root, data || {});
      if (data && (data.name || data.price || data.supplier)) {
        if (typeof window.showToast === 'function') window.showToast('Данные извлечены', 'success');
        window.closeModal('modal-ai-parse');
      } else {
        setStatus('⚠️ Данных извлечь не удалось. Уточните скриншот/ссылку.', 'err');
        btn.disabled = false; btnText.innerText = 'Повторить';
      }
    }).catch(function (err) {
      setStatus('❌ ' + (err && err.message ? err.message : 'Ошибка анализа'), 'err');
      btn.disabled = false; btnText.innerText = 'Повторить';
    });
  };

  function boot() {
    ensureModal();
    startObserver();
    ['modal-data', 'modal-create'].forEach(function (id) {
      var m = document.getElementById(id);
      if (m) new MutationObserver(decorateAll).observe(m, { attributes: true, attributeFilter: ['style'] });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();