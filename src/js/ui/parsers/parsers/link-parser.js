(function(){
    'use strict';

    const WORKER_URL = 'https://zakupki-proxy.artemgvardin1.workers.dev';

    // ============================================================
    // 1. НОРМАЛИЗАЦИЯ НАЗВАНИЯ
    // ============================================================
    async function normalizeName(value) {
        if (!value) return '';
        if (window.ProductNameNormalizer && typeof window.ProductNameNormalizer.normalize === 'function') {
            return await window.ProductNameNormalizer.normalize(value);
        }
        return String(value).trim();
    }

    // ============================================================
    // 2. ИЗВЛЕЧЕНИЕ НАЗВАНИЯ ИЗ URL
    // ============================================================
    function getSlugFromUrl(url) {
        try {
            const parsed = new URL(url);
            // Исправленное регулярное выражение: добавлены обратные слеши для экранирования
            const productMatch = parsed.pathname.match(/product\/([^/]+)/i);
            let slug;
            if (productMatch && productMatch[1]) {
                slug = productMatch[1];
            } else {
                const segments = parsed.pathname.split('/').filter(Boolean);
                slug = segments.length ? segments[segments.length - 1] : '';
            }
            if (!slug) return '';
            try {
                slug = decodeURIComponent(slug);
            } catch (error) {}
            return slug;
        } catch (error) {
            return '';
        }
    }

    async function slugToRussianTitle(url) {
        const slug = getSlugFromUrl(url);
        if (!slug) return '';
        return await normalizeName(slug);
    }

    // ============================================================
    // 3. ЗАПОЛНЕНИЕ ПОЛЕЙ
    // ============================================================
    function fillIfEmpty(card, selector, value) {
        if (!card || value === undefined || value === null) {
            return false;
        }
        const normalizedValue = String(value).trim();
        if (!normalizedValue) {
            return false;
        }
        const field = card.querySelector(selector);
        if (!field) {
            return false;
        }
        // Никогда не перезаписываем ручной ввод.
        if (String(field.value || '').trim()) {
            return false;
        }
        field.value = normalizedValue;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function getFirstValue(object, keys) {
        if (!object || typeof object !== 'object') {
            return '';
        }
        for (const key of keys) {
            const value = object[key];
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                return value;
            }
        }
        return '';
    }

    // ============================================================
    // 4. УВЕДОМЛЕНИЯ И ПЕРЕСЧЁТ
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
            try {
                window.calculateRowTotal(card);
            } catch (error) {
                console.warn('[LinkParser] Ошибка пересчёта:', error);
            }
        }
    }

    // ============================================================
    // 5. ЗАПРОС К CLOUDFLARE WORKER
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
    // 6. ПОЛУЧЕНИЕ ДАННЫХ ТОВАРА
    // ============================================================
    async function fillProductFields(product, card) {
        const name = getFirstValue(product, ['name', 'title', 'productName', 'product_name']);
        const price = getFirstValue(product, ['price', 'currentPrice', 'current_price', 'amount']);
        const article = getFirstValue(product, ['article', 'sku', 'mpn', 'vendorCode', 'vendor_code', 'partNumber', 'part_number']);
        const supplier = getFirstValue(product, ['supplier', 'brand', 'manufacturer', 'vendor', 'seller']);

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
    // 7. РЕЗЕРВНОЕ ЗАПОЛНЕНИЕ ИЗ URL
    // ============================================================
    async function fillFallbackName(card, fallbackName, url, error) {
        if (!fallbackName) {
            return false;
        }
        const normalizedName = await normalizeName(fallbackName);
        const filled = fillIfEmpty(card, '.det-name', normalizedName);
        card._parsedProductData = null;
        card._parsedProductFallback = {
            source: 'url',
            url: url,
            error: error ? error.message || String(error) : null
        };
        recalculateCard(card);
        return filled;
    }

    // ============================================================
    // 8. ОСНОВНАЯ ФУНКЦИЯ
    // ============================================================
    async function parseLinkData(url, card) {
        if (!url || !card) {
            notify('Не указана ссылка или не найдена карточка товара.', 'error');
            return false;
        }

        // Исключаем повторную обработку одной и той же ссылки для одной карточки
        if (card._parsedProductUrl === url && (card._parsedProductData || card._parsedProductFallback)) {
            notify('Данные по этой ссылке уже были обработаны.', 'info');
            return true;
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch (error) {
            notify('Некорректная ссылка на товар.', 'error');
            return false;
        }

        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            notify('Поддерживаются только HTTP и HTTPS ссылки.', 'error');
            return false;
        }

        const fallbackName = await slugToRussianTitle(parsedUrl.href);

        try {
            const response = await requestJson(WORKER_URL + '/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: parsedUrl.href })
            });

            const product = response && response.product && typeof response.product === 'object' ? response.product : null;

            if (response.success && product) {
                card._parsedProductData = product;
                card._parsedProductUrl = url; // Запоминаем обработанную ссылку
                
                const fields = await fillProductFields(product, card);
                const productName = getFirstValue(product, ['name', 'title', 'productName', 'product_name']);

                if (!productName) {
                    await fillFallbackName(card, fallbackName, parsedUrl.href);
                }

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

            card._parsedProductUrl = url;
            const filled = await fillFallbackName(card, fallbackName, parsedUrl.href);
            notify(filled ? 'Не удалось получить цену и артикул. Наименование заполнено из ссылки.' : 'Не удалось получить данные. Ранее введённые значения сохранены.', 'info');
            return Boolean(filled || fallbackName);

        } catch (error) {
            console.error('[LinkParser] Ошибка парсинга:', error);
            card._parsedProductUrl = url;
            
            const filled = await fillFallbackName(card, fallbackName, parsedUrl.href, error);
            if (filled) {
                notify('Страница магазина недоступна для парсинга. Наименование заполнено из ссылки.', 'info');
                return true;
            }

            const nameField = card.querySelector('.det-name');
            if (nameField && String(nameField.value || '').trim()) {
                notify('Страница магазина недоступна. Ранее введённое наименование сохранено.', 'info');
                return true;
            }

            notify('Не удалось получить данные товара. Заполните поля вручную.', 'error');
            return false;
        }
    }

    // ============================================================
    // 9. ПУБЛИЧНЫЙ ИНТЕРФЕЙС
    // ============================================================
    window.parseLinkData = parseLinkData;
    window.LinkParser = {
        parseLinkData,
        slugToRussianTitle,
        getSlugFromUrl,
        normalizeName
    };
})();