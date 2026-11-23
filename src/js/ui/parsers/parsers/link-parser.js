
(function () {
  'use strict';

  const WORKER_URL =
    'https://zakupki-proxy.artemgvardin1.workers.dev';

  // ============================================================
  // 1. СЛОВАРЬ ИСКЛЮЧЕНИЙ
  // ============================================================

  // Здесь находятся только слова, которые невозможно надежно
  // восстановить обычными правилами транслитерации.
  const WORD_EXCEPTIONS = {
    // Частые слова
    grunt: 'грунт',
    emal: 'эмаль',
    rzhavchine: 'ржавчине',
    novbythim: 'Новбытхим',
    zheltaya: 'жёлтая',
    zheltyy: 'жёлтый',
    zheltoe: 'жёлтое',
    zheltye: 'жёлтые',
    seryy: 'серый',
    seraya: 'серая',
    belyy: 'белый',
    belaya: 'белая',
    chernyy: 'чёрный',
    chernaya: 'чёрная',
    zelenyy: 'зелёный',
    zelenaya: 'зелёная',
    krasnyy: 'красный',
    krasnaya: 'красная',
    siniy: 'синий',
    sinyaya: 'синяя',

    // Товары и характеристики
    akkumulyator: 'аккумулятор',
    akkumulyatornyy: 'аккумуляторный',
    shchetochnyy: 'щёточный',
    snezhouborshchik: 'снегоуборщик',
    koreyskie: 'корейские',
    koreyskiy: 'корейский',
    salfetki: 'салфетки',
    salfetka: 'салфетка',
    uborki: 'уборки',
    umnye: 'умные',
    komplekte: 'комплекте',
    komplekt: 'комплект',
    zaryadnoe: 'зарядное',
    ustroystvo: 'устройство',
    nasos: 'насос',
    filtr: 'фильтр',
    dlya: 'для',
    po: 'по',
    bez: 'без',
    s: 'с',
    i: 'и',
    na: 'на',
    ot: 'от',
    v: 'в',

    // Бренды
    deko: 'DEKO',
    bosch: 'BOSCH',
    makita: 'Makita',
    dewalt: 'DeWALT',
    metabo: 'Metabo',
    einhell: 'Einhell',
    patriot: 'PATRIOT',
    hyundai: 'Hyundai',
    husqvarna: 'Husqvarna',
    luma: 'Лума',
    novbythim: 'Новбытхим',

    // Обозначения
    akb: 'АКБ',
    zaryad: 'заряд',
    zaryadnoe: 'зарядное',
    setevoy: 'сетевой',
    besprovodnoy: 'беспроводной'
  };

  // ============================================================
  // 2. ПРАВИЛА ТРАНСЛИТЕРАЦИИ
  // ============================================================

  // Важно: длинные сочетания обрабатываются раньше коротких.
  const TRANSLIT_RULES = [
    [/shch/g, 'щ'],
    [/sch/g, 'щ'],
    [/yo/g, 'ё'],
    [/jo/g, 'ё'],
    [/zh/g, 'ж'],
    [/kh/g, 'х'],
    [/ts/g, 'ц'],
    [/ch/g, 'ч'],
    [/sh/g, 'ш'],
    [/yu/g, 'ю'],
    [/ju/g, 'ю'],
    [/ya/g, 'я'],
    [/ja/g, 'я'],
    [/ye/g, 'е'],
    [/je/g, 'е'],
    [/ph/g, 'ф'],
    [/ck/g, 'к'],
    [/qu/g, 'кв'],
    [/th/g, 'т'],

    // Типичные русские окончания
    [/cheskiy$/g, 'ческий'],
    [/cheskaya$/g, 'ческая'],
    [/cheskoe$/g, 'ческое'],
    [/nyy$/g, 'ный'],
    [/naya$/g, 'ная'],
    [/noye$/g, 'ное'],
    [/ovyy$/g, 'овый'],
    [/evyy$/g, 'евый'],
    [/skiy$/g, 'ский'],
    [/skaya$/g, 'ская'],
    [/skoe$/g, 'ское'],
    [/skie$/g, 'ские'],
    [/ennyy$/g, 'енный'],
    [/annyy$/g, 'анный'],
    [/ennaya$/g, 'енная'],
    [/annaya$/g, 'анная'],
    [/ovaya$/g, 'овая'],
    [/evaya$/g, 'евая'],
    [/aya$/g, 'ая'],
    [/oye$/g, 'ое'],
    [/oe$/g, 'ое'],
    [/iy$/g, 'ий'],
    [/yy$/g, 'ый'],
    [/ey$/g, 'ей'],
    [/ay$/g, 'ай'],
    [/oy$/g, 'ой'],
    [/uy$/g, 'уй'],

    // Одиночные буквы
    [/a/g, 'а'],
    [/b/g, 'б'],
    [/c(?=[eiy])/g, 'ц'],
    [/c/g, 'к'],
    [/d/g, 'д'],
    [/e/g, 'е'],
    [/f/g, 'ф'],
    [/g/g, 'г'],
    [/h/g, 'х'],
    [/i/g, 'и'],
    [/j/g, 'й'],
    [/k/g, 'к'],
    [/l/g, 'л'],
    [/m/g, 'м'],
    [/n/g, 'н'],
    [/o/g, 'о'],
    [/p/g, 'п'],
    [/q/g, 'к'],
    [/r/g, 'р'],
    [/s/g, 'с'],
    [/t/g, 'т'],
    [/u/g, 'у'],
    [/v/g, 'в'],
    [/w/g, 'в'],
    [/x/g, 'кс'],
    [/y/g, 'ы'],
    [/z/g, 'з']
  ];

  function transliterateWord(word) {
    if (!word) return '';

    const original = word;
    const lower = word.toLowerCase();

    if (WORD_EXCEPTIONS[lower]) {
      return WORD_EXCEPTIONS[lower];
    }

    // Слова с цифрами чаще всего являются моделями и артикулами.
    // Не пытаемся превращать ST21V в кириллицу.
    if (/[a-z]/i.test(original) && /\d/.test(original)) {
      return original.toUpperCase();
    }

    let result = lower;

    for (const [pattern, replacement] of TRANSLIT_RULES) {
      result = result.replace(pattern, replacement);
    }

    return result;
  }

  // ============================================================
  // 3. ОБРАБОТКА ЧИСЕЛ И ЕДИНИЦ ИЗМЕРЕНИЯ
  // ============================================================

  function normalizeMeasurements(text) {
    let result = text;

    // 30h40sm -> 30×40 см
    result = result.replace(
      /(\d+(?:[.,]\d+)?)h(\d+(?:[.,]\d+)?)(mm|sm|cm|m|kg)?/gi,
      function (_, a, b, unit) {
        const units = {
          mm: 'мм',
          sm: 'см',
          cm: 'см',
          m: 'м',
          kg: 'кг'
        };

        return (
          a + '×' + b +
          (unit ? ' ' + units[unit.toLowerCase()] : '')
        );
      }
    );

    // 2-7-l -> 2,7 л
    result = result.replace(
      /(\d+)-(\d+)-(l|ml|kg|g)$/gi,
      function (_, a, b, unit) {
        const units = {
          l: 'л',
          ml: 'мл',
          kg: 'кг',
          g: 'г'
        };

        return a + ',' + b + ' ' + units[unit.toLowerCase()];
      }
    );

    // 2-7-l внутри строки
    result = result.replace(
      /(\d+)-(\d+)-(l|ml|kg|g)(?=-|$)/gi,
      function (_, a, b, unit) {
        const units = {
          l: 'л',
          ml: 'мл',
          kg: 'кг',
          g: 'г'
        };

        return a + ',' + b + ' ' + units[unit.toLowerCase()];
      }
    );

    // 30-sm, 18-v, 500-ml, 2-kg
    result = result.replace(
      /(\d+(?:[.,]\d+)?)-(mm|sm|cm|ml|kg|km|gb|tb|mah|v|w|hz|l|g)$/gi,
      function (_, number, unit) {
        const units = {
          mm: 'мм',
          sm: 'см',
          cm: 'см',
          ml: 'мл',
          kg: 'кг',
          km: 'км',
          gb: 'ГБ',
          tb: 'ТБ',
          mah: 'мА·ч',
          v: 'В',
          w: 'Вт',
          hz: 'Гц',
          l: 'л',
          g: 'г'
        };

        return number + ' ' + units[unit.toLowerCase()];
      }
    );

    // 2x4 -> 2×4
    result = result.replace(
      /(\d+)\s*x\s*(\d+)/gi,
      '$1×$2'
    );

    // 2sht -> 2 шт.
    result = result.replace(
      /(\d+)sht\b/gi,
      '$1 шт.'
    );

    // 2sht -> 2 шт. (вариант с дефисом)
    result = result.replace(
      /(\d+)-sht\b/gi,
      '$1 шт.'
    );

    // 4ach -> 4 А·ч
    result = result.replace(
      /(\d+(?:[.,]\d+)?)ach\b/gi,
      '$1 А·ч'
    );

    // 18v -> 18 В
    result = result.replace(
      /(\d+(?:[.,]\d+)?)v\b/gi,
      '$1 В'
    );

    // 1000w -> 1000 Вт
    result = result.replace(
      /(\d+(?:[.,]\d+)?)w\b/gi,
      '$1 Вт'
    );

    // 500ml -> 500 мл
    result = result.replace(
      /(\d+(?:[.,]\d+)?)ml\b/gi,
      '$1 мл'
    );

    // 2kg -> 2 кг
    result = result.replace(
      /(\d+(?:[.,]\d+)?)kg\b/gi,
      '$1 кг'
    );

    // 30sm / 30cm -> 30 см
    result = result.replace(
      /(\d+(?:[.,]\d+)?)(sm|cm)\b/gi,
      '$1 см'
    );

    // 30mm -> 30 мм
    result = result.replace(
      /(\d+(?:[.,]\d+)?)mm\b/gi,
      '$1 мм'
    );

    // 2-7 без единицы измерения не преобразуем автоматически.

    return result;
  }

  // ============================================================
  // 4. ПОЛУЧЕНИЕ НАЗВАНИЯ ИЗ URL
  // ============================================================

  function getSlugFromUrl(url) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;

      let slug = '';

      // Для типичных карточек /product/ берём сегмент после product.
      const productMatch = path.match(/\/product\/([^/]+)/i);

      if (productMatch && productMatch[1]) {
        slug = productMatch[1];
      } else {
        const segments = path.split('/').filter(Boolean);
        slug = segments.length
          ? segments[segments.length - 1]
          : '';
      }

      try {
        slug = decodeURIComponent(slug);
      } catch (e) {
        // Оставляем исходный slug, если декодирование не удалось.
      }

      return slug;
    } catch (e) {
      return '';
    }
  }

  function removeTechnicalId(slug) {
    let result = slug;

    // Убираем длинный цифровой ID в конце URL.
    result = result.replace(/-\d{6,}$/g, '');

    // Убираем короткий артикул перед ID:
    // ...-3206-12378203 -> ...
    result = result.replace(/-\d{3,5}$/g, '');

    return result;
  }

  function transliterateSlugToken(token) {
    if (!token) return '';

    // Уже кириллические фрагменты не меняем.
    if (/[а-яё]/i.test(token)) {
      return token;
    }

    // Числовые и цифровые обозначения.
    if (/^\d+(?:[.,]\d+)?$/.test(token)) {
      return token;
    }

    // Технические сочетания с цифрами.
    if (/^\d+x\d+$/i.test(token)) {
      return token.replace(/x/i, '×');
    }

    if (/^\d+h\d+(mm|sm|cm|m)?$/i.test(token)) {
      return normalizeMeasurements(token);
    }

    if (/^\d+(sht|ach|ml|mm|sm|cm|kg|mah|gb|tb|hz|v|w|l|g)$/i.test(token)) {
      return normalizeMeasurements(token);
    }

    // Сохраняем буквенно-цифровые модели.
    if (/[a-z]/i.test(token) && /\d/.test(token)) {
      return token.toUpperCase();
    }

    return transliterateWord(token);
  }

  function slugToRussianTitle(url) {
    let slug = getSlugFromUrl(url);

    if (!slug) return '';

    slug = removeTechnicalId(slug);

    // Заменяем подчёркивания пробелами.
    slug = slug.replace(/_/g, '-');

    // Сначала обрабатываем специальные числовые конструкции.
    slug = slug.replace(
      /(\d+)-(\d+)-(l|ml|kg|g)(?=-|$)/gi,
      function (_, a, b, unit) {
        const units = {
          l: 'л',
          ml: 'мл',
          kg: 'кг',
          g: 'г'
        };

        return a + ',' + b + ' ' + units[unit.toLowerCase()];
      }
    );

    // Сохраняем конструкцию 3-v-1 как 3 в 1.
    slug = slug.replace(
      /(^|-)3-v-1(?=-|$)/gi,
      '$13-в-1'
    );

    // Составляем токены.
    const tokens = slug
      .split('-')
      .map(token => token.trim())
      .filter(Boolean);

    const result = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Если конструкция уже преобразована в "3-в-1",
      // сохраняем её как единое выражение.
      if (/^\d+-в-\d+$/i.test(token)) {
        result.push(token.replace(/-/g, ' '));
        continue;
      }

      // 2-7-l после предварительной обработки может оказаться
      // отдельными частями, поэтому проверяем их вместе.
      if (
        /^\d+$/.test(token) &&
        tokens[i + 1] &&
        /^\d+$/.test(tokens[i + 1]) &&
        tokens[i + 2] &&
        /^(l|ml|kg|g)$/i.test(tokens[i + 2])
      ) {
        const units = {
          l: 'л',
          ml: 'мл',
          kg: 'кг',
          g: 'г'
        };

        result.push(
          token + ',' + tokens[i + 1] + ' ' +
          units[tokens[i + 2].toLowerCase()]
        );

        i += 2;
        continue;
      }

      // 30-h-40-sm -> 30×40 см
      if (
        /^\d+$/.test(token) &&
        tokens[i + 1] &&
        /^h$/i.test(tokens[i + 1]) &&
        tokens[i + 2] &&
        /^\d+$/.test(tokens[i + 2])
      ) {
        let measurement = token + '×' + tokens[i + 2];
        let offset = 2;

        if (
          tokens[i + 3] &&
          /^(mm|sm|cm|m)$/i.test(tokens[i + 3])
        ) {
          const unit = tokens[i + 3].toLowerCase();
          measurement += ' ' + (
            unit === 'mm' ? 'мм' :
            unit === 'm' ? 'м' : 'см'
          );
          offset = 3;
        }

        result.push(measurement);
        i += offset;
        continue;
      }

      // 3-v-1: в уже разделённых частях.
      if (
        /^\d+$/.test(token) &&
        tokens[i + 1] &&
        /^v$/i.test(tokens[i + 1]) &&
        tokens[i + 2] &&
        /^\d+$/.test(tokens[i + 2])
      ) {
        result.push(token + ' в ' + tokens[i + 2]);
        i += 2;
        continue;
      }

      // 2-x-4 -> 2×4
      if (
        /^\d+$/.test(token) &&
        tokens[i + 1] &&
        /^x$/i.test(tokens[i + 1]) &&
        tokens[i + 2] &&
        /^\d+$/.test(tokens[i + 2])
      ) {
        result.push(token + '×' + tokens[i + 2]);
        i += 2;
        continue;
      }

      result.push(transliterateSlugToken(token));
    }

    let title = result.join(' ');

    // Соединяем распространённое составное слово.
    title = title.replace(/\bгрунт эмаль\b/gi, 'Грунт-эмаль');

    // Убираем лишние пробелы.
    title = title
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.])/g, '$1')
      .trim();

    // Нормализуем обозначения.
    title = normalizeMeasurements(title);

    // Первая буква названия заглавная.
    if (title) {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    return title;
  }

  // ============================================================
  // 5. РАБОТА С ПОЛЯМИ ФОРМЫ
  // ============================================================

  function fillIfEmpty(card, selector, value) {
    if (!card || value === undefined || value === null) {
      return false;
    }

    const normalizedValue = String(value).trim();

    if (!normalizedValue) return false;

    const field = card.querySelector(selector);

    if (!field) return false;

    // Не перезаписываем уже заполненное поле.
    if (String(field.value || '').trim()) {
      return false;
    }

    field.value = normalizedValue;

    field.dispatchEvent(
      new Event('input', { bubbles: true })
    );

    field.dispatchEvent(
      new Event('change', { bubbles: true })
    );

    return true;
  }

  function getFirstValue(object, keys) {
    if (!object || typeof object !== 'object') {
      return '';
    }

    for (const key of keys) {
      const value = object[key];

      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ''
      ) {
        return value;
      }
    }

    return '';
  }

  function notify(message, type) {
    if (typeof window.showToast === 'function') {
      try {
        window.showToast(message, type || 'info');
        return;
      } catch (e) {
        console.warn('Toast notification error:', e);
      }
    }

    console.info('[LinkParser]', message);
  }

  function recalculateCard(card) {
    if (
      typeof window.calculateRowTotal === 'function'
    ) {
      try {
        window.calculateRowTotal(card);
      } catch (e) {
        console.warn('Row recalculation error:', e);
      }
    }
  }

  // ============================================================
  // 6. ЗАПРОС К CLOUDFLARE WORKER
  // ============================================================

  async function requestJson(url, options) {
    const response = await fetch(url, options);

    let data;

    try {
      data = await response.json();
    } catch (e) {
      throw new Error(
        'Сервер вернул некорректный JSON. HTTP ' +
        response.status
      );
    }

    if (!response.ok) {
      const error = new Error(
        data && data.error
          ? data.error
          : 'Ошибка HTTP ' + response.status
      );

      error.status = response.status;
      error.data = data;

      throw error;
    }

    return data;
  }

  // ============================================================
  // 7. ЗАПОЛНЕНИЕ ДАННЫХ ТОВАРА
  // ============================================================

  function fillProductFields(product, card) {
    if (!product || typeof product !== 'object') {
      return {
        nameFilled: false,
        priceFilled: false,
        articleFilled: false,
        supplierFilled: false
      };
    }

    const name = getFirstValue(product, [
      'name',
      'title',
      'productName',
      'product_name'
    ]);

    const price = getFirstValue(product, [
      'price',
      'currentPrice',
      'current_price',
      'amount'
    ]);

    const article = getFirstValue(product, [
      'article',
      'sku',
      'mpn',
      'vendorCode',
      'vendor_code',
      'partNumber',
      'part_number'
    ]);

    const supplier = getFirstValue(product, [
      'supplier',
      'brand',
      'manufacturer',
      'vendor',
      'seller'
    ]);

    const result = {
      nameFilled: fillIfEmpty(card, '.det-name', name),
      priceFilled: fillIfEmpty(card, '.det-price', price),
      articleFilled: fillIfEmpty(card, '.det-article', article),
      supplierFilled: fillIfEmpty(card, '.det-supplier', supplier)
    };

    recalculateCard(card);

    return result;
  }

  // ============================================================
  // 8. ОСНОВНАЯ ФУНКЦИЯ ПАРСИНГА
  // ============================================================

  async function parseLinkData(url, card) {
    if (!url || !card) {
      notify('Не указана ссылка или не найдена карточка товара.', 'error');
      return false;
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch (e) {
      notify('Некорректная ссылка на товар.', 'error');
      return false;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      notify('Поддерживаются только HTTP и HTTPS ссылки.', 'error');
      return false;
    }

    const fallbackName = slugToRussianTitle(parsedUrl.href);

    try {
      const response = await requestJson(
        WORKER_URL + '/parse',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: parsedUrl.href
          })
        }
      );

      const product =
        response &&
        response.product &&
        typeof response.product === 'object'
          ? response.product
          : null;

      if (response && response.success && product) {
        card._parsedProductData = product;

        // Сначала используем название, полученное со страницы.
        const fields = fillProductFields(product, card);

        // Если страница не вернула название, берём его из URL.
        if (!fields.nameFilled && !getFirstValue(product, [
          'name',
          'title',
          'productName',
          'product_name'
        ])) {
          fillIfEmpty(card, '.det-name', fallbackName);
        }

        recalculateCard(card);

        if (fields.nameFilled || fields.priceFilled ||
            fields.articleFilled || fields.supplierFilled) {
          notify('Данные товара успешно получены.', 'success');
          return true;
        }

        // Если всё уже было заполнено вручную, ничего не затираем.
        if (fallbackName) {
          notify(
            'Данные получены. Заполненные вручную поля сохранены.',
            'info'
          );
          return true;
        }

        notify(
          'Не удалось получить данные товара. Заполните поля вручную.',
          'error'
        );

        return false;
      }

      // Worker ответил, но не смог получить карточку.
      if (fallbackName) {
        const filled = fillIfEmpty(
          card,
          '.det-name',
          fallbackName
        );

        card._parsedProductData = null;
        card._parsedProductFallback = {
          source: 'url',
          url: parsedUrl.href
        };

        recalculateCard(card);

        notify(
          filled
            ? 'Не удалось получить цену и артикул. Наименование заполнено из ссылки.'
            : 'Не удалось получить данные. Ранее введённое наименование сохранено.',
          'info'
        );

        return true;
      }

      notify(
        'Не удалось получить данные товара. Заполните поля вручную.',
        'error'
      );

      return false;

    } catch (error) {
      console.error('Link parser error:', error);

      // Даже при HTTP 403, блокировке магазина или сетевой ошибке
      // пытаемся восстановить название из URL.
      if (fallbackName) {
        const filled = fillIfEmpty(
          card,
          '.det-name',
          fallbackName
        );

        card._parsedProductData = null;
        card._parsedProductFallback = {
          source: 'url',
          url: parsedUrl.href,
          error: error.message || String(error)
        };

        recalculateCard(card);

        notify(
          filled
            ? 'Страница магазина недоступна для парсинга. Наименование заполнено из ссылки.'
            : 'Страница магазина недоступна. Ранее введённое наименование сохранено.',
          'info'
        );

        return true;
      }

      notify(
        'Не удалось получить данные товара. Заполните поля вручную.',
        'error'
      );

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
    transliterateWord,
    transliterateToRussian: transliterateWord,
    normalizeMeasurements
  };

})();