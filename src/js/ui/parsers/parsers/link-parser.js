/* ============================================================
   UNIVERSAL PRODUCT LINK PARSER
   No external services. Works on HTML already retrieved by Worker.
   Exposes window.LinkParser.parseDocument(doc, url)
   ============================================================ */
(function (global) {
  'use strict';

  const clean = (value) => {
    if (value == null) return '';
    if (typeof value === 'object') return value.name || value.value || value['@value'] || '';
    return String(value).replace(/\s+/g, ' ').trim();
  };

  const asArray = (value) => value == null ? [] : (Array.isArray(value) ? value : [value]);
  const first = (...values) => values.map(clean).find(Boolean) || '';
  const parsePrice = (value) => {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') return value;
    let s = String(value).replace(/[^\d.,\s]/g, '').replace(/\s/g, '');
    if (!s) return 0;
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const normalizeType = (node) => asArray(node && node['@type']).map(t => String(t).split('/').pop().toLowerCase());
  const isProduct = (node) => normalizeType(node).some(t => ['product', 'productgroup'].includes(t));

  function walkNodes(data, out, seen) {
    if (!data || typeof data !== 'object') return;
    if (seen.has(data)) return;
    seen.add(data);
    if (Array.isArray(data)) { data.forEach(x => walkNodes(x, out, seen)); return; }
    if (isProduct(data)) out.push(data);
    if (data['@graph']) walkNodes(data['@graph'], out, seen);
    // Traverse common JSON-LD nesting without walking every arbitrary object twice.
    ['mainEntity', 'itemListElement', 'hasVariant', 'isVariantOf', 'item', 'subjectOf'].forEach(k => {
      if (data[k]) walkNodes(data[k], out, seen);
    });
  }

  function offersFrom(product) {
    let offers = product && product.offers;
    if (offers && offers.offers) offers = offers.offers;
    return asArray(offers);
  }
  function bestOffer(product) {
    const offers = offersFrom(product);
    const valid = offers.map(o => ({
      price: parsePrice(o && (o.price ?? o.lowPrice ?? o.highPrice)),
      currency: clean(o && (o.priceCurrency || o.currency)),
      availability: clean(o && o.availability),
      seller: clean(o && (o.seller && (o.seller.name || o.seller) || o.brand))
    })).filter(o => o.price > 0);
    return valid[0] || { price: 0, currency: '', availability: '', seller: '' };
  }
  function meta(doc, selectors) {
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el) {
        const val = clean(el.content || el.value || el.textContent);
        if (val) return val;
      }
    }
    return '';
  }
  function text(doc, selectors) {
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      const val = clean(el && (el.textContent || el.innerText));
      if (val) return val;
    }
    return '';
  }
  function getImage(doc, product) {
    const fromProduct = asArray(product && product.image).map(img => typeof img === 'object' ? (img.url || img.contentUrl) : img).find(Boolean);
    return first(fromProduct, meta(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']), doc.querySelector('img[itemprop="image"]')?.src);
  }
  function characteristics(doc, product) {
    const pairs = [];
    asArray(product && product.additionalProperty).forEach(p => {
      const name = clean(p && (p.name || p.property));
      const value = clean(p && (p.value || p.valueText));
      if (name && value) pairs.push({ name, value });
    });
    if (!pairs.length) {
      doc.querySelectorAll('table tr, dl').forEach(row => {
        const cells = row.querySelectorAll('th,td,dt,dd');
        if (cells.length >= 2) {
          const name = clean(cells[0].textContent), value = clean(cells[1].textContent);
          if (name && value && name.length < 100 && value.length < 300) pairs.push({ name, value });
        }
      });
    }
    return pairs.slice(0, 40);
  }

  function parseDocument(doc, url) {
    const products = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try { walkNodes(JSON.parse(script.textContent), products, new Set()); } catch (_) { /* malformed JSON-LD */ }
    });
    const product = products[0] || {};
    const offer = bestOffer(product);
    const title = first(product.name, meta(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']), text(doc, ['h1', '[itemprop="name"]']), doc.title);
    const description = first(product.description, meta(doc, ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']));
    const brand = first(product.brand && (product.brand.name || product.brand), product.manufacturer, meta(doc, ['meta[property="product:brand"]', 'meta[name="brand"]']));
    const article = first(product.sku, product.mpn, product.productID, product.gtin, product.gtin13, product.gtin14,
      meta(doc, ['meta[property="product:retailer_item_id"]', 'meta[name="sku"]', 'meta[itemprop="sku"]']),
      text(doc, ['[itemprop="sku"]', '[itemprop="mpn"]', '.product-sku', '.sku', '.article', '.product-article', '[data-widget="webProductSku"]']));
    const price = offer.price || parsePrice(meta(doc, ['meta[property="product:price:amount"]', 'meta[property="og:price:amount"]', 'meta[itemprop="price"]'])) || parsePrice(text(doc, ['[itemprop="price"]', '.price', '.product-price', '.product__price', '.price-current', '.sale-price']));
    const currency = first(offer.currency, meta(doc, ['meta[property="product:price:currency"]', 'meta[property="og:price:currency"]']));
    const availability = first(offer.availability, product.availability, meta(doc, ['meta[itemprop="availability"]']));
    const urlHost = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; } })();
    return {
      title, description, brand, article, price, currency, availability,
      image: getImage(doc, product), supplier: offer.seller,
      url, host: urlHost, characteristics: characteristics(doc, product),
      source: products.length ? 'json-ld' : 'html',
      parsedAt: new Date().toISOString()
    };
  }

  global.LinkParser = { parseDocument, parsePrice };
})(window);
