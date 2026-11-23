/**
 * js/link-parser.js
 * Универсальный парсер товарных страниц через Cloudflare Worker.
 *
 * Поддерживает:
 * - JSON-LD: Product, ProductGroup, Offer, AggregateOffer;
 * - Open Graph и обычные meta-теги;
 * - Microdata;
 * - HTML-разметку товара;
 * - некоторые варианты встроенного INITIAL_STATE;
 * - обработку HTTP-ошибок, CAPTCHA и защитных страниц.
 *
 * Уже заполненные пользователем поля не перезаписываются.
 */

(function () {
  'use strict';

  const LINK_PARSER_PROXY =
    'https://zakupki-proxy.artemgvardin1.workers.dev/?url=';

  // ------------------------------------------------------------
  // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  // ------------------------------------------------------------

  function lpText(value) {
    if (value === null || value === undefined) return '';

    if (typeof value === 'object') {
      if (value.name) return lpText(value.name);
      if (value.value) return lpText(value.value);
      if (value['@value']) return lpText(value['@value']);
      return '';
    }

    return String(value)
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function lpParsePrice(value) {
    if (value === null || value === undefined || value === '') return 0;

    if (typeof value === 'object') {
      value =
        value.price ??
        value.lowPrice ??
        value.highPrice ??
        value.value ??
        '';
    }

    let str = String(value)
      .replace(/\u00a0/g, '')
      .replace(/\s/g, '')
      .replace(/[^\d.,-]/g, '');

    if (!str) return 0;

    // Формат 1.234,56
    if (str.includes('.') && str.includes(',')) {
      if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
        str = str.replace(/\./g, '').replace(',', '.');
      } else {
        str = str.replace(/,/g, '');
      }
    } else if (str.includes(',')) {
      str = str.replace(',', '.');
    }

    const result = Number(str);

    return Number.isFinite(result) && result > 0 ? result : 0;
  }

  function lpGetMeta(doc, selectors) {
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (!el) continue;

      const value =
        el.getAttribute('content') ||
        el.getAttribute('value') ||
        el.textContent;

      const text = lpText(value);
      if (text) return text;
    }

    return '';
  }

  function lpGetHostname(url) {
    try {
      const hostname = new URL(url).hostname
        .replace(/^www\./i, '');

      return hostname;
    } catch (_) {
      return '';
    }
  }

  function lpIsGenericTitle(value) {
    const normalized = lpText(value).toLowerCase();

    const generic = [
      'главная',
      'каталог',
      'товары',
      'интернет-магазин',
      'ошибка',
      'доступ запрещен',
      'страница не найдена',
      'page not found',
      'access denied',
      'home',
      'catalog'
    ];

    return !normalized ||
      generic.some(item => normalized === item);
  }

  // ------------------------------------------------------------
  // ИЗВЛЕЧЕНИЕ JSON-LD
  // ------------------------------------------------------------

  function lpGetJsonLdObjects(doc) {
    const result = [];

    doc.querySelectorAll('script[type="application/ld+json"]')
      .forEach(script => {
        const raw = script.textContent.trim();
        if (!raw) return;

        try {
          const parsed = JSON.parse(raw);

          function walk(value) {
            if (!value) return;

            if (Array.isArray(value)) {
              value.forEach(walk);
              return;
            }

            if (typeof value !== 'object') return;

            result.push(value);

            if (value['@graph']) walk(value['@graph']);
            if (value.itemListElement) walk(value.itemListElement);
            if (value.mainEntity) walk(value.mainEntity);
            if (value.mainEntityOfPage) walk(value.mainEntityOfPage);
            if (value.hasVariant) walk(value.hasVariant);
            if (value.offers) walk(value.offers);
          }

          walk(parsed);
        } catch (error) {
          console.warn('[LinkParser] Invalid JSON-LD:', error);
        }
      });

    return result;
  }

  function lpIsProductObject(obj) {
    if (!obj || typeof obj !== 'object') return false;

    const type = obj['@type'];

    if (Array.isArray(type)) {
      return type.some(t =>
        /^(Product|ProductGroup)$/i.test(String(t))
      );
    }

    return /^(Product|ProductGroup)$/i.test(String(type || ''));
  }

  function lpFindProduct(jsonObjects) {
    return jsonObjects.find(lpIsProductObject) || null;
  }

  function lpGetOfferPrice(offers) {
    if (!offers) return 0;

    if (Array.isArray(offers)) {
      for (const offer of offers) {
        const price = lpGetOfferPrice(offer);
        if (price > 0) return price;
      }

      return 0;
    }

    if (typeof offers !== 'object') {
      return lpParsePrice(offers);
    }

    const directPrice = lpParsePrice(
      offers.price ??
      offers.lowPrice ??
      offers.highPrice
    );

    if (directPrice > 0) return directPrice;

    if (offers.offers) {
      return lpGetOfferPrice(offers.offers);
    }

    return 0;
  }

  // ------------------------------------------------------------
  // ВСТРОЕННЫЕ JSON-ДАННЫЕ
  // ------------------------------------------------------------

  function lpExtractBalancedJson(text, startIndex) {
    const start = text.indexOf('{', startIndex);
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }

        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;

        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }

    return null;
  }

  function lpFindCartItem(state) {
    if (!state || typeof state !== 'object') return null;

    const possibleArrays = [
      state.cart?.items,
      state.cartItems,
      state.basket?.items,
      state.basket?.products,
      state.cart?.products
    ];

    for (const arr of possibleArrays) {
      if (Array.isArray(arr) && arr.length) {
        return arr[0];
      }
    }

    return null;
  }

  function lpGetInitialStateProduct(doc) {
    const scripts = Array.from(doc.querySelectorAll('script'));

    for (const script of scripts) {
      const text = script.textContent || '';

      if (!/INITIAL_STATE|__NEXT_DATA__|__NUXT__|initialState/i.test(text)) {
        continue;
      }

      try {
        const marker = text.search(
          /INITIAL_STATE|__NEXT_DATA__|__NUXT__|initialState/i
        );

        const jsonText = lpExtractBalancedJson(text, marker);
        if (!jsonText) continue;

        const state = JSON.parse(jsonText);
        const item = lpFindCartItem(state);

        if (item) {
          return {
            name: lpText(item.name || item.title || item.productName),
            price: lpParsePrice(
              item.price ??
              item.cost ??
              item.finalPrice ??
              item.salePrice
            ),
            article: lpText(
              item.article ||
              item.sku ||
              item.vendorCode ||
              item.code
            )
          };
        }
      } catch (error) {
        console.warn('[LinkParser] INITIAL_STATE parse error:', error);
      }
    }

    return null;
  }

  // ------------------------------------------------------------
  // ОСНОВНОЕ ИЗВЛЕЧЕНИЕ ДАННЫХ СО СТРАНИЦЫ
  // ------------------------------------------------------------

  function lpGetProductData(doc, url) {
    const data = {
      name: '',
      price: 0,
      article: '',
      supplier: ''
    };

    const jsonObjects = lpGetJsonLdObjects(doc);
    const product = lpFindProduct(jsonObjects);

    // 1. JSON-LD Product
    if (product) {
      data.name = lpText(
        product.name ||
        product.title ||
        product.alternateName
      );

      data.price = lpGetOfferPrice(product.offers);

      data.article = lpText(
        product.sku ||
        product.mpn ||
        product.productID ||
        product.gtin13 ||
        product.gtin ||
        product.identifier
      );

      if (product.brand) {
        data.supplier = lpText(product.brand);
      }

      if (!data.supplier && product.offers) {
        const offer = Array.isArray(product.offers)
          ? product.offers[0]
          : product.offers;

        if (offer && offer.seller) {
          data.supplier = lpText(offer.seller);
        }
      }
    }

    // 2. Open Graph и обычные meta-теги
    if (!data.name) {
      data.name = lpGetMeta(doc, [
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'meta[name="title"]',
        'meta[itemprop="name"]'
      ]);
    }

    if (!data.price) {
      data.price = lpParsePrice(lpGetMeta(doc, [
        'meta[property="product:price:amount"]',
        'meta[property="og:price:amount"]',
        'meta[itemprop="price"]',
        'meta[name="price"]'
      ]));
    }

    if (!data.article) {
      data.article = lpGetMeta(doc, [
        'meta[itemprop="sku"]',
        'meta[name="sku"]',
        'meta[property="product:retailer_item_id"]'
      ]);
    }

    // 3. Microdata
    if (!data.name) {
      const nameEl = doc.querySelector(
        '[itemprop="name"]'
      );

      if (nameEl) {
        data.name = lpText(
          nameEl.getAttribute('content') ||
          nameEl.textContent
        );
      }
    }

    if (!data.price) {
      const priceEl = doc.querySelector(
        '[itemprop="price"]'
      );

      if (priceEl) {
        data.price = lpParsePrice(
          priceEl.getAttribute('content') ||
          priceEl.textContent
        );
      }
    }

    if (!data.article) {
      const skuEl = doc.querySelector(
        '[itemprop="sku"], [itemprop="mpn"]'
      );

      if (skuEl) {
        data.article = lpText(
          skuEl.getAttribute('content') ||
          skuEl.textContent
        );
      }
    }

    // 4. Встроенное состояние корзины или товара
    const initialData = lpGetInitialStateProduct(doc);

    if (initialData) {
      if (!data.name) data.name = initialData.name;
      if (!data.price) data.price = initialData.price;
      if (!data.article) data.article = initialData.article;
    }

    // 5. Обычные HTML-элементы
    if (!data.name) {
      const selectors = [
        'h1',
        '[data-testid="product-title"]',
        '[data-product-name]',
        '.product-detail__title',
        '.product-title',
        '.product-card__title',
        '.catalog-element__title'
      ];

      for (const selector of selectors) {
        const el = doc.querySelector(selector);
        if (!el) continue;

        const value =
          el.getAttribute('data-product-name') ||
          el.getAttribute('content') ||
          el.textContent;

        const text = lpText(value);

        if (text && !lpIsGenericTitle(text)) {
          data.name = text;
          break;
        }
      }
    }

    if (!data.price) {
      const selectors = [
        '[data-testid="price"]',
        '[data-price]',
        '.product-price',
        '.price-current',
        '.price__current',
        '.product-card__price',
        '.price'
      ];

      for (const selector of selectors) {
        const el = doc.querySelector(selector);
        if (!el) continue;

        const value =
          el.getAttribute('data-price') ||
          el.getAttribute('content') ||
          el.textContent;

        const price = lpParsePrice(value);

        if (price > 0) {
          data.price = price;
          break;
        }
      }
    }

    if (!data.article) {
      const text = doc.body?.innerText || '';

      const match = text.match(
        /(?:артикул|код товара|sku|арт\.?)\s*[:№#]?\s*([a-zа-я0-9._/-]+)/i
      );

      if (match) {
        data.article = lpText(match[1]);
      }
    }

    // 6. Поставщик — только если удалось определить бренд или магазин.
    if (!data.supplier) {
      data.supplier = lpGetHostname(url);
    }

    if (lpIsGenericTitle(data.name)) {
      data.name = '';
    }

    return data;
  }

  // ------------------------------------------------------------
  // УВЕДОМЛЕНИЯ
  // ------------------------------------------------------------

  function lpNotify(message, type = 'error') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }

    if (typeof showToast === 'function') {
      showToast(message, type);
      return;
    }

    console.log('[LinkParser]', message);
  }

  // ------------------------------------------------------------
  // ЗАПОЛНЕНИЕ КАРТОЧКИ
  // ------------------------------------------------------------

  function lpFillEmptyField(input, value) {
    if (!input || !value || input.value.trim()) return false;

    input.value = String(value);

    input.dispatchEvent(
      new Event('input', { bubbles: true })
    );

    input.dispatchEvent(
      new Event('change', { bubbles: true })
    );

    return true;
  }

  // ------------------------------------------------------------
  // ОСНОВНАЯ ФУНКЦИЯ
  // ------------------------------------------------------------

  async function parseLinkData(url, card) {
    try {
      if (!url || !card) {
        lpNotify('Не удалось определить ссылку или карточку товара.');
        return false;
      }

      let parsedUrl;

      try {
        parsedUrl = new URL(url);
      } catch (_) {
        lpNotify('Некорректная ссылка на товар.');
        return false;
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        lpNotify('Поддерживаются только HTTP- и HTTPS-ссылки.');
        return false;
      }

      const proxyUrl =
        LINK_PARSER_PROXY + encodeURIComponent(parsedUrl.href);

      const response = await fetch(proxyUrl, {
        method: 'GET',
        cache: 'no-store'
      });

      const sourceStatus = Number(
        response.headers.get('X-Source-Status') || response.status
      );

      const finalUrl =
        response.headers.get('X-Final-URL') || parsedUrl.href;

      if (sourceStatus === 403 || response.status === 403) {
        lpNotify(
          'Поставщик заблокировал автоматический доступ (403). ' +
          'Заполните название, цену и артикул вручную.'
        );

        console.warn('[LinkParser] Source returned 403:', finalUrl);
        return false;
      }

      if (sourceStatus === 401 || response.status === 401) {
        lpNotify('Поставщик требует авторизацию. Заполните данные вручную.');
        return false;
      }

      if (sourceStatus === 404 || response.status === 404) {
        lpNotify('Страница товара не найдена (404).');
        return false;
      }

      if (sourceStatus === 429 || response.status === 429) {
        lpNotify('Поставщик ограничил частоту запросов. Попробуйте позже.');
        return false;
      }

      if (sourceStatus >= 500 || response.status >= 500) {
        lpNotify('Сайт поставщика временно недоступен. Попробуйте позже.');
        return false;
      }

      if (!response.ok) {
        lpNotify('Ошибка прокси: HTTP ' + response.status);
        console.warn('[LinkParser] HTTP error:', response.status);
        return false;
      }

      const contentType =
        (response.headers.get('Content-Type') || '').toLowerCase();

      const body = await response.text();

      if (!body || !body.trim()) {
        lpNotify('Поставщик вернул пустую страницу.');
        return false;
      }

      // Диагностический JSON Worker не является страницей товара.
      if (
        contentType.includes('application/json') ||
        body.trim().startsWith('{"proxy"')
      ) {
        let diagnostic = null;

        try {
          diagnostic = JSON.parse(body);
        } catch (_) {}

        if (diagnostic && diagnostic.proxy === 'OK') {
          const status = Number(diagnostic.sourceStatus || 0);

          if (status === 403) {
            lpNotify('Поставщик запретил автоматическое получение товара (403).');
          } else {
            lpNotify(
              'Получен диагностический ответ прокси вместо страницы товара. ' +
              'Отключите debug=1.'
            );
          }

          console.warn('[LinkParser] Diagnostic response:', diagnostic);
          return false;
        }

        if (diagnostic && diagnostic.error) {
          lpNotify(
            'Ошибка прокси: ' +
            (diagnostic.message || diagnostic.error)
          );

          console.warn('[LinkParser] Worker error:', diagnostic);
          return false;
        }
      }

      // Защита от CAPTCHA и антибот-страниц.
      const blockedPatterns = [
        /captcha/i,
        /доступ ограничен/i,
        /доступ запрещен/i,
        /access denied/i,
        /robot check/i,
        /verify you are human/i,
        /подтвердите, что вы не робот/i,
        /проверка безопасности/i,
        /unusual traffic/i,
        /cloudflare ray id/i
      ];

      if (blockedPatterns.some(pattern => pattern.test(body))) {
        lpNotify(
          'Сайт ограничил автоматический доступ или запросил CAPTCHA. ' +
          'Заполните данные вручную.'
        );

        return false;
      }

      if (
        !contentType.includes('text/html') &&
        !contentType.includes('application/xhtml+xml') &&
        !body.trim().startsWith('<')
      ) {
        lpNotify('Поставщик вернул неподдерживаемый формат данных.');
        return false;
      }

      const doc = new DOMParser().parseFromString(body, 'text/html');

      const pageText = (
        doc.body?.innerText ||
        doc.body?.textContent ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      const errorPatterns = [
        'страница не найдена',
        'товар не найден',
        'некорректная ссылка',
        'перейдите назад',
        'page not found',
        'product not found',
        'товар снят с продажи'
      ];

      if (errorPatterns.some(text => pageText.includes(text))) {
        lpNotify('Получена страница ошибки, а не карточка товара.');
        return false;
      }

      const data = lpGetProductData(doc, finalUrl);

      const nameInput = card.querySelector('.det-name');
      const priceInput = card.querySelector('.det-price');
      const articleInput = card.querySelector('.det-article');
      const supplierInput = card.querySelector('.det-supplier');

      let changed = false;

      if (
        data.name &&
        data.name.length > 2 &&
        nameInput &&
        !nameInput.value.trim()
      ) {
        nameInput.value = data.name;

        if (typeof window.onDetNameInput === 'function') {
          window.onDetNameInput(nameInput);
        }

        nameInput.dispatchEvent(
          new Event('input', { bubbles: true })
        );

        changed = true;
      }

      if (
        data.price > 0 &&
        priceInput &&
        !priceInput.value.trim()
      ) {
        priceInput.value = data.price;

        if (typeof window.calculateRowTotal === 'function') {
          window.calculateRowTotal(priceInput);
        }

        priceInput.dispatchEvent(
          new Event('input', { bubbles: true })
        );

        changed = true;
      }

      if (lpFillEmptyField(articleInput, data.article)) {
        changed = true;
      }

      if (lpFillEmptyField(supplierInput, data.supplier)) {
        changed = true;
      }

      card.dataset.parsedProduct = JSON.stringify(data);
      card._parsedProductData = data;

      if (!data.name && !data.price && !data.article) {
        lpNotify(
          'Страница открылась, но данные товара не удалось извлечь.'
        );

        console.warn('[LinkParser] No product data:', {
          url,
          finalUrl,
          title: doc.title
        });

        return false;
      }

      console.info('[LinkParser] Product parsed:', data);

      if (changed) {
        lpNotify('Данные товара успешно получены.', 'success');
      } else {
        lpNotify(
          'Товар распознан. Заполненные поля оставлены без изменений.',
          'success'
        );
      }

      return true;

    } catch (error) {
      console.error('[LinkParser] Parsing error:', error);

      lpNotify(
        'Не удалось получить данные товара. ' +
        'Проверьте ссылку или заполните поля вручную.'
      );

      return false;
    }
  }

  // ------------------------------------------------------------
  // ЭКСПОРТ
  // ------------------------------------------------------------

  window.parseLinkData = parseLinkData;

  window.LinkParser = {
    parseDocument: lpGetProductData,
    parsePrice: lpParsePrice,
    parseLinkData: parseLinkData
  };

})();