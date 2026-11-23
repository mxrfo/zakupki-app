
(function () {
  'use strict';

  const WORKER_URL =
    'https://zakupki-proxy.artemgvardin1.workers.dev';

  function notify(message, type = 'error') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else {
      console.log('[LinkParser]', message);
    }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      ...options
    });

    let data;

    try {
      data = await response.json();
    } catch (_) {
      throw new Error('Сервис вернул некорректный ответ.');
    }

    if (!response.ok) {
      throw new Error(
        data.message || `Ошибка сервиса: HTTP ${response.status}`
      );
    }

    return data;
  }

  function fillIfEmpty(card, selector, value) {
    const input = card.querySelector(selector);

    if (
      !input ||
      input.value.trim() ||
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return false;
    }

    input.value = String(value);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  }

  // =========================================================
  // ВОССТАНОВЛЕНИЕ НАЗВАНИЯ ИЗ URL
  // =========================================================

  function transliterateToRussian(word) {
    const corrections = {
      grunt: 'грунт',
      emal: 'эмаль',
      novbythim: 'Новбытхим',
      zheltaya: 'жёлтая',
      zheltyy: 'жёлтый',
      zheltoe: 'жёлтое',
      chernyy: 'чёрный',
      chernaya: 'чёрная',
      chernoe: 'чёрное',
      belyy: 'белый',
      belaya: 'белая',
      krasnyy: 'красный',
      krasnaya: 'красная',
      siniy: 'синий',
      sinyaya: 'синяя',
      zelenyy: 'зелёный',
      zelenaya: 'зелёная'
    };

    if (corrections[word]) {
      return corrections[word];
    }

    const combinations = {
      shch: 'щ',
      yo: 'ё',
      zh: 'ж',
      kh: 'х',
      ts: 'ц',
      ch: 'ч',
      sh: 'ш',
      yu: 'ю',
      ya: 'я',
      je: 'е'
    };

    const letters = {
      a: 'а',
      b: 'б',
      c: 'к',
      d: 'д',
      e: 'е',
      f: 'ф',
      g: 'г',
      h: 'х',
      i: 'и',
      j: 'й',
      k: 'к',
      l: 'л',
      m: 'м',
      n: 'н',
      o: 'о',
      p: 'п',
      q: 'к',
      r: 'р',
      s: 'с',
      t: 'т',
      u: 'у',
      v: 'в',
      w: 'в',
      x: 'кс',
      y: 'ы',
      z: 'з'
    };

    let result = '';
    let i = 0;

    while (i < word.length) {
      let matched = false;

      for (const [latin, russian] of Object.entries(combinations)) {
        if (word.startsWith(latin, i)) {
          result += russian;
          i += latin.length;
          matched = true;
          break;
        }
      }

      if (matched) continue;

      result += letters[word[i]] || word[i];
      i++;
    }

    return result;
  }

  function extractNameFromUrl(url) {
    try {
      const parsed = new URL(url);

      let path = decodeURIComponent(parsed.pathname);

      // Берём название после /product/, если такой раздел есть.
      const productMatch = path.match(/\/product\/([^/]+)/i);

      let slug = productMatch
        ? productMatch[1]
        : path.split('/').filter(Boolean).pop();

      if (!slug) return '';

      slug = slug
        .toLowerCase()
        .replace(/_/g, '-')
        .replace(/\.(html?|php)$/i, '');

      // Убираем объём/вес в конце:
      // 2-7-l, 500-ml, 10-kg и подобные обозначения.
      slug = slug.replace(
        /-\d+(?:-\d+)?-(?:l|ml|g|kg|gr|mm|cm|m|шт|pcs)$/i,
        ''
      );

      // Убираем длинные числовые ID товара.
      slug = slug.replace(/-\d{6,}(?:-\d{6,})*$/g, '');

      // Убираем короткий числовой код в конце, например 3206.
      slug = slug.replace(/-\d{3,5}$/g, '');

      const parts = slug.split('-').filter(Boolean);

      if (!parts.length) return '';

      // Преобразуем числовые конструкции 3-v-1 в 3 в 1.
      const words = [];
      let i = 0;

      while (i < parts.length) {
        if (
          /^\d+$/.test(parts[i]) &&
          parts[i + 1] === 'v' &&
          /^\d+$/.test(parts[i + 2] || '')
        ) {
          words.push(parts[i], 'в', parts[i + 2]);
          i += 3;
          continue;
        }

        words.push(transliterateToRussian(parts[i]));
        i++;
      }

      // Составные названия типа грунт-эмаль.
      if (
        parts[0] === 'grunt' &&
        parts[1] === 'emal' &&
        words.length >= 2
      ) {
        words[0] = 'Грунт-эмаль';
        words.splice(1, 1);
      }

      // Наиболее распространённые цвета.
      const colors = [
        'жёлтая',
        'жёлтый',
        'жёлтое',
        'чёрная',
        'чёрный',
        'чёрное',
        'белая',
        'белый',
        'красная',
        'красный',
        'синяя',
        'синий',
        'зелёная',
        'зелёный'
      ];

      // Выделяем цвет запятой, если он указан в конце.
      let result = words.join(' ');

      const lastWord = words[words.length - 1];

      if (
        words.length > 2 &&
        colors.includes(String(lastWord).toLowerCase())
      ) {
        const beforeColor = words.slice(0, -1).join(' ');
        result = beforeColor + ', ' + lastWord;
      }

      // Заглавная буква в начале названия.
      result = result.charAt(0).toUpperCase() + result.slice(1);

      return result.trim();

    } catch (error) {
      console.warn('[LinkParser] Ошибка восстановления названия:', error);
      return '';
    }
  }

  // =========================================================
  // ЗАПАСНОЕ ЗАПОЛНЕНИЕ ИЗ URL
  // =========================================================

  function fallbackFromUrl(url, card, originalError = null) {
    const name = extractNameFromUrl(url);

    if (!name) {
      console.warn('[LinkParser] Не удалось извлечь название из URL');
      return false;
    }

    const changed = fillIfEmpty(card, '.det-name', name);

    card._parsedProductData = {
      name: name,
      price: null,
      article: null,
      supplier: null,
      source: 'url-fallback',
      originalError: originalError
    };

    console.info(
      '[LinkParser] Название восстановлено из ссылки:',
      name
    );

    if (changed) {
      notify(
        'Не удалось получить данные с сайта. Название восстановлено из ссылки. Проверьте его перед сохранением.',
        'success'
      );
    } else {
      notify(
        'Сайт недоступен. Название из ссылки определено, но поле уже заполнено.',
        'warning'
      );
    }

    return true;
  }

  // =========================================================
  // ОСНОВНОЙ ПАРСЕР
  // =========================================================

  async function parseLinkData(url, card) {
    if (!url || !card) {
      notify('Не удалось определить ссылку или карточку товара.');
      return false;
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch (_) {
      notify('Некорректная ссылка на товар.');
      return false;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      notify('Поддерживаются только HTTP и HTTPS ссылки.');
      return false;
    }

    let response;

    try {
      response = await requestJson(`${WORKER_URL}/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: parsedUrl.href
        })
      });

    } catch (error) {
      console.error('[LinkParser] Ошибка запроса Worker:', error);

      return fallbackFromUrl(
        parsedUrl.href,
        card,
        error.message
      );
    }

    // Если Worker вернул ошибку — пробуем URL.
    if (!response.success || !response.product) {
      console.error('[LinkParser] Ошибка парсинга:', response);

      if (response.diagnostic) {
        console.error(
          '[LinkParser] Причина:',
          response.diagnostic.name,
          response.diagnostic.message
        );
      }

      return fallbackFromUrl(
        parsedUrl.href,
        card,
        response.error || response.message || 'PARSER_ERROR'
      );
    }

    const product = response.product;
    let changed = false;

    changed = fillIfEmpty(card, '.det-name', product.name) || changed;
    changed = fillIfEmpty(card, '.det-price', product.price) || changed;
    changed = fillIfEmpty(card, '.det-article', product.article) || changed;
    changed = fillIfEmpty(card, '.det-supplier', product.supplier) || changed;

    // Если Worker успешно ответил, но название не нашёл,
    // восстанавливаем только название из ссылки.
    if (!product.name) {
      changed =
        fillIfEmpty(
          card,
          '.det-name',
          extractNameFromUrl(parsedUrl.href)
        ) || changed;
    }

    const priceInput = card.querySelector('.det-price');

    if (
      priceInput &&
      priceInput.value.trim() &&
      typeof window.calculateRowTotal === 'function'
    ) {
      window.calculateRowTotal(priceInput);
    }

    card._parsedProductData = product;

    console.info('[LinkParser] Получены данные товара:', product);

    const found = [
      product.name,
      product.price !== null ? product.price : '',
      product.article
    ].filter(value => value !== '').length;

    if (changed) {
      notify(
        found === 3
          ? 'Название, цена и артикул успешно получены.'
          : 'Данные товара получены. Некоторые поля могут потребовать ручного заполнения.',
        'success'
      );
    } else {
      notify(
        'Товар найден, но заполненные поля оставлены без изменений.',
        'success'
      );
    }

    return true;
  }

  window.parseLinkData = parseLinkData;

  window.LinkParser = {
    parseLinkData,
    extractNameFromUrl
  };

})();
