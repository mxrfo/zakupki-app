// ============================================================
// МОДУЛЬ: ai-parser.js — модалка анализа + кнопки-иконки вместо поля ссылки
// Логика: обычный парсинг (без эвристики) через Worker /parse
//          ИИ-анализ (скриншот/ссылка) через Worker /ai
// Поле ссылки скрывается декоратором; 2 кнопки: 🔗 (переход) и 🪄 (модалка).
// Значение ссылки сохраняется в скрытом input, поэтому submitCreateRequest /
// submitData в forms.js читают .det-link / .data-det-link как раньше — не трогаем.
// ============================================================
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function workerUrl() {
    return window.LINK_PARSER_WORKER_URL || 'https://zakupki-proxy.artemgvardin1.workers.dev';
  }

  // ---------- 1. Создание модалки один раз ----------
  let _modalBuilt = false;
  function ensureModal() {
    if (_modalBuilt) return;
    if (document.getElementById('modal-ai-parse')) { _modalBuilt = true; return; }
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="modal-ai-parse" class="modal-overlay" style="display:none;">
        <div class="modal" style="max-width:520px;">
          <div class="modal-header" style="border-top:6px solid #8b5cf6;">
            <h2>🪄 Умный анализ страницы</h2>
            <button type="button" class="btn-close" onclick="closeModal('modal-ai-parse')">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size:13px;color:#64748b;margin-bottom:14px;">
              Если сайт блокирует обычный парсинг — загрузите скриншот страницы. ИИ извлечёт данные автоматически.
            </p>
            <div style="margin-bottom:14px;">
              <label style="display:block;font-weight:600;margin-bottom:6px;font-size:13px;">1. Скриншот страницы</label>
              <input type="file" id="ai-file-input" accept="image/png,image/jpeg,image/webp"
                     style="width:100%;padding:8px;border:1px dashed #cbd5e1;border-radius:6px;">
            </div>
            <div style="margin-bottom:14px;">
              <label style="display:block;font-weight:600;margin-bottom:6px;font-size:13px;">2. Ссылка на страницу</label>
              <input type="url" id="ai-url-input" placeholder="https://..."
                     style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            </div>
            <div style="margin-bottom:14px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
                <input type="radio" name="ai-parse-mode" value="ai" checked>
                <span>ИИ-анализ (BitrixGPT / Vision)</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;margin-top:6px;">
                <input type="radio" name="ai-parse-mode" value="standard">
                <span>Обычный парсинг (без эвристики)</span>
              </label>
            </div>
            <div id="ai-parse-status" style="display:none;padding:10px;background:#f1f5f9;border-radius:6px;font-size:13px;margin-bottom:14px;"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" onclick="closeModal('modal-ai-parse')">Отмена</button>
            <button type="button" class="btn btn-primary" id="btn-run-ai-parse" onclick="runAiParse()">
              <span id="ai-parse-btn-text">Анализировать</span>
            </button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap.firstElementChild);
    _modalBuilt = true;
  }

  // ---------- 2. Декоратор: скрыть поле ссылки, добавить 2 кнопки ----------
  function decorate(root) {
    if (!root || root.dataset.aiDecorated === '1') return;
    const isCard = !!root.querySelector('.link-input-wrapper');
    const isTable = (root.tagName === 'TR');
    if (!isCard && !isTable) return;
    root.dataset.aiDecorated = '1';

    if (isCard) {
      const wrapper = root.querySelector('.link-input-wrapper');
      const input = root.querySelector('.det-link');
      const v = input ? input.value : '';
      const label = root.querySelector('.pg-link label');
      if (label) label.style.display = 'none';
      wrapper.innerHTML =
        `<input type="url" class="det-link" style="display:none" value="${esc(v)}">` +
        `<button type="button" class="btn-icon-link" title="Открыть ссылку" data-url="${esc(v)}" ` +
        `onclick="openLink(this)" ${v ? '' : 'disabled style="opacity:.4"'}>🔗</button>` +
        `<button type="button" class="btn-icon-ai" title="ИИ-анализ / парсинг" onclick="openAiParseModal(this)">🪄</button>`;
    } else {
      // таблица данных: td с input.data-det-link
      const input = root.querySelector('.data-det-link');
      const td = input ? input.closest('td') : null;
      if (!td) return;
      const v = input.value || '';
      td.innerHTML =
        `<input type="url" class="data-det-link" style="display:none" value="${esc(v)}">` +
        `<button type="button" class="btn-icon-link" title="Открыть ссылку" data-url="${esc(v)}" ` +
        `onclick="openLink(this)" ${v ? '' : 'disabled style="opacity:.4"'}>🔗</button>` +
        `<button type="button" class="btn-icon-ai" title="ИИ-анализ / парсинг" onclick="openAiParseModal(this)">🪄</button>`;
    }
  }

  function decorateAll() {
    document.querySelectorAll('#purchase-items-container .pos-card').forEach(decorate);
    document.querySelectorAll('#data-detail-tbody tr').forEach(decorate);
  }

  let _obsStarted = false;
  function startObserver() {
    if (_obsStarted) return;
    _obsStarted = true;
    const cb = () => decorateAll();
    const container = document.getElementById('purchase-items-container');
    const tbody = document.getElementById('data-detail-tbody');
    if (container) new MutationObserver(cb).observe(container, { childList: true, subtree: true });
    if (tbody) new MutationObserver(cb).observe(tbody, { childList: true, subtree: true });
    // переименовать заголовок колонки "Ссылка" в таблице данных → "Действия"
    document.querySelectorAll('#data-detail-table thead th').forEach(th => {
      if (th.textContent.trim().toLowerCase() === 'ссылка') th.textContent = 'Действия';
    });
    decorateAll();
  }

  // ---------- 3. Открытие модалки ----------
  window.openAiParseModal = function (btn) {
    ensureModal();
    const root = btn.closest('.pos-card') || btn.closest('tr');
    if (!root) return;
    const input = root.querySelector('.det-link') || root.querySelector('.data-det-link');
    const url = input ? input.value.trim() : '';
    window._aiParseTarget = { root, input };
    document.getElementById('ai-url-input').value = url;
    document.getElementById('ai-file-input').value = '';
    document.getElementById('ai-parse-status').style.display = 'none';
    document.getElementById('ai-parse-btn-text').innerText = 'Анализировать';
    document.getElementById('btn-run-ai-parse').disabled = false;
    document.querySelector('input[name="ai-parse-mode"][value="ai"]').checked = true;
    document.getElementById('modal-ai-parse').style.display = 'flex';
  };

  // ---------- 4. Применение результата к строке/карточке ----------
  async function applyParsed(root, data) {
    const isTable = (root.tagName === 'TR');
    const sel = {
      name: isTable ? '.data-det-name' : '.det-name',
      price: isTable ? '.data-det-price' : '.det-price',
      supplier: isTable ? '.data-det-supplier' : '.det-supplier'
    };
    const setIf = (s, val) => {
      if (val == null || String(val).trim() === '') return;
      const el = root.querySelector(s);
      if (el && !String(el.value || '').trim()) {
        el.value = String(val).trim();
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    setIf(sel.name, data.name || data.title);
    setIf(sel.price, data.price);
    setIf(sel.supplier, data.supplier);
    if (isTable && typeof window.calculateDataRowTotal === 'function') {
      const p = root.querySelector('.data-det-price');
      if (p) window.calculateDataRowTotal(p);
    } else if (!isTable && typeof window.calculateRowTotal === 'function') {
      const p = root.querySelector('.det-price');
      if (p) window.calculateRowTotal(p);
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ---------- 5. Запуск анализа ----------
  window.runAiParse = async function () {
    const target = window._aiParseTarget;
    if (!target) return;
    const url = document.getElementById('ai-url-input').value.trim();
    const fileInput = document.getElementById('ai-file-input');
    const mode = document.querySelector('input[name="ai-parse-mode"]:checked').value;
    const status = document.getElementById('ai-parse-status');
    const btn = document.getElementById('btn-run-ai-parse');
    const btnText = document.getElementById('ai-parse-btn-text');

    if (mode === 'standard' && !url) {
      status.style.display = 'block'; status.style.color = '#b91c1c';
      status.innerText = 'Для обычного парсинга укажите ссылку.'; return;
    }
    if (mode === 'ai' && !fileInput.files.length && !url) {
      status.style.display = 'block'; status.style.color = '#b91c1c';
      status.innerText = 'Загрузите скриншот или укажите ссылку для ИИ-анализа.'; return;
    }

    btn.disabled = true; btnText.innerText = 'Обработка...';
    status.style.display = 'block'; status.style.color = '#0f172a'; status.innerText = '⏳ Анализ...';

    try {
      let data;
      if (mode === 'standard') {
        // Обычный парсинг БЕЗ эвристики: при блокировке — ошибка, без догадок из URL.
        data = await window.fetchParsedProduct(url);
      } else {
        // ИИ-анализ через Worker /ai (BitrixGPT/Vision на стороне Worker'а).
        const imageBase64 = fileInput.files.length ? await fileToBase64(fileInput.files[0]) : '';
        const res = await fetch(workerUrl() + '/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url || null, imageBase64: imageBase64 || null })
        });
        if (!res.ok) throw new Error('ИИ‑сервер вернул HTTP ' + res.status);
        data = await res.json();
        if (data && data.error) throw new Error(data.error);
      }

      // сохранить ссылку в скрытый input (на случай, если ввели только в модалке)
      if (url && target.input) {
        target.input.value = url;
        const openBtn = target.root.querySelector('.btn-icon-link');
        if (openBtn) { openBtn.dataset.url = url; openBtn.disabled = false; openBtn.style.opacity = ''; }
      }

      await applyParsed(target.root, data || {});
      if (data && (data.name || data.price || data.supplier)) {
        if (typeof window.showToast === 'function') window.showToast('Данные извлечены', 'success');
        window.closeModal('modal-ai-parse');
      } else {
        status.style.color = '#b91c1c';
        status.innerText = '⚠️ Данных извлечь не удалось. Уточните скриншот/ссылку.';
        btn.disabled = false; btnText.innerText = 'Повторить';
      }
    } catch (err) {
      status.style.color = '#b91c1c';
      status.innerText = '❌ ' + (err && err.message ? err.message : 'Ошибка анализа');
      btn.disabled = false; btnText.innerText = 'Повторить';
    }
  };

  // ---------- 6. Инициализация ----------
  function boot() {
    ensureModal();
    startObserver();
    // повторить декорацию при открытии модалок данных/создания
    ['modal-data', 'modal-create'].forEach(id => {
      const m = document.getElementById(id);
      if (m) new MutationObserver(decorateAll).observe(m, { attributes: true, attributeFilter: ['style'] });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();