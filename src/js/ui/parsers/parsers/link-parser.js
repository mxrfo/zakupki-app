(function(){
    'use strict';

    const WORKER_URL = 'https://zakupki-proxy.artemgvardin1.workers.dev';

    // ============================================================
    // ЭВРИСТИКА УДАЛЕНА (по требованию).
    // Больше нет SUPPLIER_DOMAIN_MAP / getSupplierFromHostname /
    // cleanSlug / getSlugFromUrl / slugToRussianTitle / fillFallbackName.
    // Если Worker вернул блокировку/недоступность — поля НЕ заполняются
    // из ссылки, а возвращается ошибка. Обычный парсинг (/parse) оставлен.
    // ============================================================

    // ============================================================
    // 1. НОРМАЛИЗАЦИЯ НАЗВАНИЯ (не эвристика блокировки — оставляем)
    // ============================================================
    async function normalizeName(value) {
        if (!value) return '';
        if (window.ProductNameNormalizer && typeof window.ProductNameNormalizer.normalize === 'function') {
            return await window.ProductNameNormalizer.normalize(value);
        }
        return String(value).trim();
    }

    // ============================================================
    // 2. ЗАПОЛНЕНИЕ ПОЛЕЙ (только из реальных данных Worker'а)
    // ============================================================
    function fillIfEmpty(card, selector, value) {
        if (!card || value === undefined || value === null) return false;
        const normalizedValue = String(value).trim();
        if (!normalizedValue) return false;
        const field = card.querySelector(selector);
        if (!field) return false;
        if (String(field.value || '').trim()) return false;
        field.value = normalizedValue;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function getFirstValue(object, keys) {
        if (!object || typeof object !== 'object') return '';
        for (const key of keys) {
            const value = object[key];
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                return value;
            }
        }
        return '';
    }

    // ============================================================
    // 3. УВЕДОМЛЕНИЯ И ПЕРЕСЧЁТ
    // ============================================================
    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            try {
                window.showToast(message, type || 'info');
                return;
            } catch (error) {
                console.warn('[LinkParser] Ошибка уведомления:', error);
            }
        }
        console.info('[LinkParser]', message);
    }

    function recalculateCard(card) {
        if (typeof window.calculateRowTotal === 'function') {
            try { window.calculateRowTotal(card); } catch (error) {
                console.warn('[LinkParser] Ошибка пересчёта:', error);
            }
        }
    }

    // ============================================================
    // 4. ЗАПРОС К CLOUDFLARE WORKER
    // ============================================================
    async function requestJson(url, options) {
        const response = await fetch(url, options);
        let data;
        try {
            data = await response.json();
        } catch (error) {
            const parseError = new Error(`Сервер вернул некорректный JSON. HTTP ${response.status}`);
            parseError.status = response.status;
            throw parseError;
        }
        if (!response.ok) {
            const requestError = new Error(data && data.error ? data.error : `Ошибка HTTP ${response.status}`);
            requestError.status = response.status;
            requestError.data = data;
            throw requestError;
        }
        return data;
    }

    // ============================================================
    // 5. ЧИСТЫЙ ЗАПРОС ТОВАРА БЕЗ ЭВРИСТИКИ
    // Возвращает объект product либо бросает ошибку (блокировка/недоступен).
    // Никаких догадок из URL — это и есть «обычный парсинг без эвристики».
    // ============================================================
    async function fetchParsedProduct(url) {
        if (!url) throw new Error('Ссылка не указана');
        let parsedUrl;
        try { parsedUrl = new URL(url); }
        catch (e) { throw new Error('Некорректная ссылка на товар'); }
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error('Поддерживаются только HTTP и HTTPS ссылки');
        }

        const response = await requestJson(WORKER_URL + '/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: parsedUrl.href })
        });

        const product = response && response.product && typeof response.product === 'object' ? response.product : null;
        if (!response.success || !product) {
            // Блокировка / недоступен / не распознано — НЕ угадываем из ссылки.
            const reason = response && response.error ? response.error : 'Страница недоступна для парсинга';
            const err = new Error(reason);
            err.blocked = true;
            throw err;
        }
        return product;
    }

    // ============================================================
    // 6. ЗАПОЛНЕНИЕ КАРТОЧКИ ПОЗИЦИИ ИЗ ДАННЫХ
    // ============================================================
    async function applyProductToCard(product, card) {
        const name = getFirstValue(product, ['name', 'title', 'productName', 'product_name']);
        const price = getFirstValue(product, ['price', 'currentPrice', 'current_price', 'amount']);
        const article = getFirstValue(product, ['article', 'sku', 'mpn', 'vendorCode', 'vendor_code', 'partNumber', 'part_number']);
        const supplier = getFirstValue(product, ['supplier', 'brand', 'manufacturer', 'vendor', 'seller', 'company']);

        const normalizedName = name ? await normalizeName(name) : '';

        const result = {
            nameFilled: fillIfEmpty(card, '.det-name', normalizedName),
            priceFilled: fillIfEmpty(card, '.det-price', price),
            articleFilled: fillIfEmpty(card, '.det-article', article),
            supplierFilled: fillIfEmpty(card, '.det-supplier', supplier)
        };

        recalculateCard(card);
        return result;
    }

    // ============================================================
    // 7. ОСНОВНАЯ ФУНКЦИЯ (обёртка для карточки позиции)
    // ============================================================
    async function parseLinkData(url, card) {
        if (!url || !card) {
            notify('Не указана ссылка или не найдена карточка товара.', 'error');
            return false;
        }

        if (card._parsedProductUrl === url && card._parsedProductData) {
            notify('Данные по этой ссылке уже были обработаны.', 'info');
            return true;
        }

        let product;
        try {
            product = await fetchParsedProduct(url);
        } catch (error) {
            // Эвристики больше нет: при блокировке/недоступности ничего из URL не заполняем.
            card._parsedProductUrl = url;
            card._parsedProductError = error.message || String(error);
            notify('Не удалось получить данные: ' + (error.message || 'страница недоступна') + '. Заполните поля вручную или используйте ИИ‑анализ.', 'error');
            return false;
        }

        card._parsedProductData = product;
        card._parsedProductUrl = url;

        const fields = await applyProductToCard(product, card);
        const anyFieldFilled = fields.nameFilled || fields.priceFilled || fields.articleFilled || fields.supplierFilled;

        if (anyFieldFilled) {
            notify('Данные товара успешно получены.', 'success');
            return true;
        }

        const hasExistingData = ['.det-name', '.det-price', '.det-article', '.det-supplier'].some(selector => {
            const field = card.querySelector(selector);
            return field && String(field.value || '').trim();
        });

        if (hasExistingData) {
            notify('Данные получены. Заполненные вручную поля сохранены.', 'info');
            return true;
        }

        notify('Не удалось получить данные товара. Заполните поля вручную.', 'error');
        return false;
    }

    // ============================================================
    // 8. ПУБЛИЧНЫЙ ИНТЕРФЕЙС
    // ============================================================
    window.LINK_PARSER_WORKER_URL = WORKER_URL;
    window.fetchParsedProduct = fetchParsedProduct;
    window.parseLinkData = parseLinkData;
    window.LinkParser = {
        parseLinkData,
        fetchParsedProduct,
        normalizeName
    };
})();