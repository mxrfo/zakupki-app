// ============================================================
// МОДУЛЬ: ai-parser.js
// Автоматическое заполнение полей позиции товара.
//
// ЛОГИКА:
// - Режим "Автоматическое определение по ссылке": быстрый запрос к Worker'у
//   за метаданными страницы (7 сек). Скидку НЕ определяет (только цена из мета-тега).
// - Режим "Анализ с помощью ИИ": сжатый скриншот (+ссылка) → Worker → Gemini.
//   Именно этот режим читает цену со скидкой со скриншота.
// - Выбранный режим запоминается между открытиями модалки.
// - Вставка из буфера (Ctrl+V) работает в любой момент, когда открыта модалка.
// - Кнопка "Сохранить ссылку" — сохраняет ссылку без сканирования.
// ============================================================
(function () {
  'use strict';

  var AI_TIMEOUT_MS = 45000;
  var PARSE_TIMEOUT_MS = 7000;
  var AI_MAX_DIM = 800;
  var AI_JPEG_QUALITY = 0.85;
  var AI_MAX_PAYLOAD_KB = 16;

  var ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  var ICON_AI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></svg>';
  var ICON_UPLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';

  var _lastMode = localStorage.getItem('ai_parse_mode_last') || 'standard';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]);
    });
  }

  function workerUrl() {
    return window.LINK_PARSER_WORKER_URL || 'https://zakupki-proxy.artemgvardin1.workers.dev';
  }

  function compressImageToBase64(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var objUrl = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) { URL.revokeObjectURL(objUrl); return reject(new Error('Не удалось прочитать изображение')); }
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          function encode(dim, quality) {
            var scale = Math.min(1, dim / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
            canvas.width = cw; canvas.height = ch;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, cw, ch);
            ctx.drawImage(img, 0, 0, cw, ch);
            return String(canvas.toDataURL('image/jpeg', quality)).split(',')[1] || '';
          }
          var qualities = [AI_JPEG_QUALITY, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];
          var dims = [AI_MAX_DIM, 640, 480, 400];
          var b64 = encode(dims[0], qualities[0]);
          var finalSize = b64.length / 1024;

          if (finalSize > AI_MAX_PAYLOAD_KB) {
            for (var q = 1; q < qualities.length && finalSize > AI_MAX_PAYLOAD_KB; q++) {
              b64 = encode(dims[0], qualities[q]);
              finalSize = b64.length / 1024;
            }
            for (var d = 1; d < dims.length && finalSize > AI_MAX_PAYLOAD_KB; d++) {
              for (var q2 = 0; q2 < qualities.length && finalSize > AI_MAX_PAYLOAD_KB; q2++) {
                b64 = encode(dims[d], qualities[q2]);
                finalSize = b64.length / 1024;
              }
            }
          }

          if (finalSize > AI_MAX_PAYLOAD_KB) {
            console.warn('[AI-PARSER] Не удалось сжать до ' + AI_MAX_PAYLOAD_KB + ' КБ, текущий размер: ' + finalSize.toFixed(2) + ' КБ');
          }

          URL.revokeObjectURL(objUrl);
          resolve(b64);
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
            '<h2>' + ICON_AI + ' Автоматическое заполнение</h2>' +
            '<button type="button" class="btn-close" onclick="closeModal(\'modal-ai-parse\')">&times;</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<p class="ai-hint">💡 <b>Совет:</b> Снимайте только область с товаром и ценой (не весь экран). <b>Цену со скидкой определяет только режим «Анализ с помощью ИИ»</b> по скриншоту; режим «по ссылке» читает цену из мета-тегов и скидку не видит.</p>' +
            '<div class="ai-field">' +
              '<label class="ai-label">1. Изображение товара (опционально)</label>' +
              '<div class="ai-drop" id="ai-drop-zone">' +
                ICON_UPLOAD +
                '<span id="ai-drop-text">Перетащите, выберите или вставьте из буфера (Ctrl+V)</span>' +
                '<div class="ai-file-name" id="ai-file-name"></div>' +
                '<input type="file" id="ai-file-input" accept="image/png,image/jpeg,image/webp">' +
              '</div>' +
              '<div class="ai-preview" id="ai-preview"><img id="ai-preview-img" alt="превью"></div>' +
            '</div>' +
            '<div class="ai-field">' +
              '<label class="ai-label" for="ai-url-input">2. Ссылка на товар (опционально)</label>' +
              '<input type="url" id="ai-url-input" class="ai-input" placeholder="https://...">' +
            '</div>' +
            '<div class="ai-field">' +
              '<label class="ai-label">Способ получения данных</label>' +
              '<div class="ai-radio-group">' +
                '<label class="ai-radio"><input type="radio" name="ai-parse-mode" value="ai"> <span>Анализ с помощью ИИ</span></label>' +
                '<label class="ai-radio selected"><input type="radio" name="ai-parse-mode" value="standard" checked> <span>Автоматическое определение по ссылке</span></label>' +
              '</div>' +
            '</div>' +
            '<div class="ai-status" id="ai-parse-status"></div>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn" onclick="closeModal(\'modal-ai-parse\')">Отмена</button>' +
            '<button type="button" class="btn btn-link-save" onclick="saveAiLinkOnly()">Сохранить ссылку</button>' +
            '<button type="button" class="btn btn-ai-run" id="btn-run-ai-parse" onclick="runAiParse()">' +
              '<span id="ai-parse-btn-text">Просканировать</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap.firstElementChild);
    bindModalEvents();
    bindPasteHandler();
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
      if (f && f.type.indexOf('image/') === 0) setAiFile(f);
    });
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) setAiFile(input.files[0]);
    });
    document.querySelectorAll('.ai-radio input[name="ai-parse-mode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        _lastMode = r.value;
        localStorage.setItem('ai_parse_mode_last', _lastMode);
        document.querySelectorAll('.ai-radio').forEach(function (l) { l.classList.remove('selected'); });
        if (r.closest('.ai-radio')) r.closest('.ai-radio').classList.add('selected');
      });
    });
  }

  function bindPasteHandler() {
    document.addEventListener('paste', function (e) {
      if (!document.getElementById('modal-ai-parse')) return;
      if (document.getElementById('modal-ai-parse').style.display === 'none') return;
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image/') === 0) {
          var file = items[i].getAsFile();
          if (file) {
            setAiFile(file);
            setStatus('✅ Изображение вставлено из буфера: ' + file.name, 'ok');
          }
          break;
        }
      }
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
        '<input type="url" class="det-link link-hidden" value="' + esc(v) + '">' +
        '<button type="button" class="btn-link-action ' + (v ? 'has-link' : '') + '" onclick="openAiParseModal(this)">' +
        '<span class="bl-txt">' + (v ? 'Изменить ссылку' : 'Добавить ссылку') + '</span></button>' +
        '<button type="button" class="btn-icon-link" title="Открыть ссылку" data-url="' + esc(v) + '" ' +
        'onclick="openLink(this)" ' + (v ? '' : 'disabled') + '>' + ICON_LINK + '</button>';
    } else {
      var tinput = root.querySelector('.data-det-link');
      var td = tinput ? tinput.closest('td') : null;
      if (!td) return;
      var tv = tinput.value || '';
      td.innerHTML =
        '<input type="url" class="data-det-link link-hidden" value="' + esc(tv) + '">' +
        '<button type="button" class="btn-link-action ' + (tv ? 'has-link' : '') + '" onclick="openAiParseModal(this)">' +
        '<span class="bl-txt">' + (tv ? 'Изменить ссылку' : 'Добавить ссылку') + '</span></button>' +
        '<button type="button" class="btn-icon-link" title="Открыть ссылку" data-url="' + esc(tv) + '" ' +
        'onclick="openLink(this)" ' + (tv ? '' : 'disabled') + '>' + ICON_LINK + '</button>';
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

  window.saveAiLinkOnly = function () {
    var target = window._aiParseTarget;
    if (!target) return;
    var url = document.getElementById('ai-url-input').value.trim();
    if (url) {
      try {
        var parsed = new URL(url);
        if (['http:', 'https:'].indexOf(parsed.protocol) === -1) { setStatus('Ссылка должна быть http/https', 'err'); return; }
      } catch (e) { setStatus('Введите корректную ссылку', 'err'); return; }
    }
    target.input.value = url;
    var openBtn = target.root.querySelector('.btn-icon-link');
    if (openBtn) { openBtn.dataset.url = url; openBtn.disabled = !url; }
    if (typeof window.updateLinkBtnState === 'function') window.updateLinkBtnState(target.root);
    window.closeModal('modal-ai-parse');
    if (typeof window.showToast === 'function') window.showToast(url ? 'Ссылка сохранена' : 'Ссылка очищена', 'success');
  };

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
    document.getElementById('ai-parse-btn-text').innerText = 'Просканировать';
    document.getElementById('btn-run-ai-parse').disabled = false;

    var radio = document.querySelector('input[name="ai-parse-mode"][value="' + _lastMode + '"]');
    if (!radio) radio = document.querySelector('input[name="ai-parse-mode"][value="standard"]');
    if (radio) radio.checked = true;
    document.querySelectorAll('.ai-radio').forEach(function (l) { l.classList.remove('selected'); });
    if (radio && radio.closest('.ai-radio')) radio.closest('.ai-radio').classList.add('selected');
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
      supplier: isTable ? '.data-det-supplier' : '.det-supplier',
      note: isTable ? null : '.det-note'
    };
    function setIf(s, val) {
      if (!s) return;
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

    // В примечание — выгода: сначала текстовое описание, иначе старая логика со второй ценой
    if (sel.note) {
      var noteEl = root.querySelector(sel.note);
      if (noteEl) {
        var existing = String(noteEl.value || '').trim();
        var noteText = '';
        if (data.discountNote && String(data.discountNote).trim()) {
          noteText = 'Выгода: ' + String(data.discountNote).trim();
        } else if (data.priceDiscounted != null) {
          var discPrice = parseFloat(data.priceDiscounted);
          var regularPrice = parseFloat(data.price);
          if (!isNaN(discPrice) && discPrice > 0 && (isNaN(regularPrice) || discPrice !== regularPrice)) {
            noteText = 'Цена со скидкой: ' + discPrice + ' ₽';
          }
        }
        if (noteText && existing.indexOf('Выгода:') === -1 && existing.indexOf('Цена со скидкой') === -1) {
          noteEl.value = existing ? (existing + '; ' + noteText) : noteText;
          noteEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }

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
        if (e && e.name === 'AbortError') throw new Error('timeout');
        throw new Error('network:' + (e.message || 'failed'));
      });
  }

  function sendToAi(params, timeoutMs) {
    return fetchWithTimeout(workerUrl() + '/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    }, timeoutMs).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || ('Сервер вернул HTTP ' + res.status));
        if (data && data.error) throw new Error(data.error);
        return data;
      });
    });
  }

  window.runAiParse = function () {
    var target = window._aiParseTarget;
    if (!target) return;
    var url = document.getElementById('ai-url-input').value.trim();
    var mode = document.querySelector('input[name="ai-parse-mode"]:checked').value;
    var btn = document.getElementById('btn-run-ai-parse');
    var btnText = document.getElementById('ai-parse-btn-text');

    if (mode === 'standard' && !url) { setStatus('Укажите ссылку на товар.', 'err'); return; }
    if (mode === 'ai' && !_aiFile && !url) { setStatus('Загрузите изображение или укажите ссылку.', 'err'); return; }

    btn.disabled = true; btnText.innerText = 'Обработка...';

    if (mode === 'standard') {
      setStatus('⏳ Пробую получить данные по ссылке (таймаут ' + (PARSE_TIMEOUT_MS / 1000) + ' с)...', 'info');

      var parsePromise = fetchWithTimeout(workerUrl() + '/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      }, PARSE_TIMEOUT_MS).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
          if (!data || !data.success || !data.product) throw new Error('Пустой ответ');
          return { source: 'parse', data: data.product };
        });
      });

      parsePromise.then(function (result) {
        setStatus('✅ Данные получены по ссылке (скидку этот режим не определяет)', 'ok');
        if (url && target.input) {
          target.input.value = url;
          var openBtn = target.root.querySelector('.btn-icon-link');
          if (openBtn) { openBtn.dataset.url = url; openBtn.disabled = false; }
          if (typeof window.updateLinkBtnState === 'function') window.updateLinkBtnState(target.root);
        }
        applyParsed(target.root, result.data);
        if (typeof window.showToast === 'function') window.showToast('Данные заполнены по ссылке', 'success');
        window.closeModal('modal-ai-parse');
      }).catch(function (err) {
        if (!url) {
          setStatus('❌ Не удалось получить данные: ' + err.message, 'err');
          btn.disabled = false; btnText.innerText = 'Повторить';
          return;
        }
        setStatus('⏳ Не удалось получить данные по ссылке. Пробую анализ через ИИ...', 'info');

        var params = new URLSearchParams();
        params.append('url', url);

        sendToAi(params, AI_TIMEOUT_MS).then(function (data) {
          if (url && target.input) {
            target.input.value = url;
            var openBtn = target.root.querySelector('.btn-icon-link');
            if (openBtn) { openBtn.dataset.url = url; openBtn.disabled = false; }
            if (typeof window.updateLinkBtnState === 'function') window.updateLinkBtnState(target.root);
          }
          applyParsed(target.root, data || {});

          if (data && (data.name || data.price || data.supplier)) {
            var missingFields = [];
            if (!data.price) missingFields.push('цена');
            if (!data.name) missingFields.push('название');

            if (missingFields.length > 0) {
              setStatus('⚠️ Не удалось определить: ' + missingFields.join(', ') + '. Загрузите скриншот для точного заполнения.', 'err');
              btn.disabled = false; btnText.innerText = 'Повторить';
            } else {
              if (typeof window.showToast === 'function') window.showToast('Данные заполнены через ИИ', 'success');
              window.closeModal('modal-ai-parse');
            }
          } else {
            setStatus('⚠️ Не удалось получить данные по ссылке. Загрузите скриншот товара.', 'err');
            btn.disabled = false; btnText.innerText = 'Повторить';
          }
        }).catch(function (aiErr) {
          var errMsg = aiErr.message || '';
          if (errMsg.indexOf('503') !== -1 || errMsg.indexOf('high demand') !== -1) {
            setStatus('❌ Сервис временно перегружен. Подождите 10 секунд и повторите, или загрузите изображение.', 'err');
          } else {
            setStatus('❌ Не удалось получить данные: ' + errMsg, 'err');
          }
          btn.disabled = false; btnText.innerText = 'Повторить';
        });
      });
      return;
    }

    if (!_aiFile && !url) {
      setStatus('Загрузите изображение или укажите ссылку.', 'err');
      btn.disabled = false; btnText.innerText = 'Просканировать';
      return;
    }

    var prep = _aiFile ? compressImageToBase64(_aiFile) : Promise.resolve('');
    setStatus(_aiFile ? '⏳ Сжимаю изображение...' : '⏳ Отправляю ссылку на анализ...', 'info');

    prep.then(function (imageBase64) {
      var params = new URLSearchParams();
      if (url) params.append('url', url);
      if (imageBase64) params.append('imageBase64', imageBase64);

      var payloadSizeKB = (params.toString().length / 1024).toFixed(2);
      console.log('[AI-PARSER] Отправка, размер payload:', payloadSizeKB, 'KB');
      setStatus('⏳ Отправляю на анализ (размер ' + payloadSizeKB + ' КБ)...', 'info');

      if (payloadSizeKB > AI_MAX_PAYLOAD_KB) {
        console.warn('[AI-PARSER] ВНИМАНИЕ: Размер превышает ' + AI_MAX_PAYLOAD_KB + ' КБ, возможен блок антивируса!');
      }

      return sendToAi(params, AI_TIMEOUT_MS);
    }).then(function (data) {
      if (url && target.input) {
        target.input.value = url;
        var openBtn = target.root.querySelector('.btn-icon-link');
        if (openBtn) { openBtn.dataset.url = url; openBtn.disabled = false; }
        if (typeof window.updateLinkBtnState === 'function') window.updateLinkBtnState(target.root);
      }
      applyParsed(target.root, data || {});

      if (data && (data.name || data.price || data.supplier)) {
        var missingFields = [];
        if (!data.price) missingFields.push('цена');
        if (!data.name) missingFields.push('название');

        if (missingFields.length > 0) {
          setStatus('⚠️ Не удалось определить: ' + missingFields.join(', ') + '. Снимите область с ценой крупнее и повторите.', 'err');
          btn.disabled = false; btnText.innerText = 'Повторить';
        } else {
          if (typeof window.showToast === 'function') window.showToast('Данные заполнены через ИИ', 'success');
          window.closeModal('modal-ai-parse');
        }
      } else {
        setStatus('⚠️ Не удалось получить данные. Уточните изображение или ссылку.', 'err');
        btn.disabled = false; btnText.innerText = 'Повторить';
      }
    }).catch(function (err) {
      var errMsg = err.message || '';
      if (errMsg.indexOf('503') !== -1 || errMsg.indexOf('high demand') !== -1) {
        setStatus('❌ Сервис временно перегружен. Подождите 10 секунд и повторите, или загрузите изображение.', 'err');
      } else {
        setStatus('❌ ' + errMsg, 'err');
      }
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