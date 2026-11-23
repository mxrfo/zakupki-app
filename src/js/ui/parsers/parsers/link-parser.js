
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

    try {
      const response = await requestJson(`${WORKER_URL}/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: parsedUrl.href
        })
      });

      if (!response.success || !response.product) {
        console.error('[LinkParser] Ошибка парсинга:', response);

        if (response.diagnostic) {
          console.error(
            '[LinkParser] Причина:',
            response.diagnostic.name,
            response.diagnostic.message
          );
        }

        notify(
          response.message ||
          'Не удалось получить данные товара. Заполните поля вручную.'
        );

        return false;
      }

      const product = response.product;
      let changed = false;

      changed = fillIfEmpty(card, '.det-name', product.name) || changed;
      changed = fillIfEmpty(card, '.det-price', product.price) || changed;
      changed = fillIfEmpty(card, '.det-article', product.article) || changed;
      changed = fillIfEmpty(card, '.det-supplier', product.supplier) || changed;

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

    } catch (error) {
      console.error('[LinkParser]', error);
      notify(error.message || 'Не удалось получить данные товара.');
      return false;
    }
  }

  window.parseLinkData = parseLinkData;

  window.LinkParser = {
    parseLinkData
  };
})();
