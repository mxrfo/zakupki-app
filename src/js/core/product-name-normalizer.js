(function(){
    'use strict';

    const CyrillicToTranslit = window.CyrillicToTranslit;
    const transliterator = typeof CyrillicToTranslit === 'function' 
        ? new CyrillicToTranslit({preset: 'ru'}) 
        : null;

    // Бренды и названия, которые сохраняем в заданном написании.
    const BRANDS = {
        svetocopy: 'SvetoCopy',
        deko: 'DEKO',
        bosch: 'Bosch',
        makita: 'Makita',
        dewalt: 'DeWALT',
        metabo: 'Metabo',
        einhell: 'Einhell',
        patriot: 'PATRIOT',
        hyundai: 'Hyundai',
        husqvarna: 'Husqvarna',
        luma: 'Luma',
        novbythim: 'Новбытхим'
    };

    // Ручные исключения: проверенные слова и специальные обозначения.
    const EXCEPTIONS = {
        grunt: 'грунт',
        emal: 'эмаль',
        rzhavchine: 'ржавчине',
        zheltaya: 'жёлтая',
        zheltyy: 'жёлтый',
        zheltoe: 'жёлтое',
        akb: 'АКБ',
        zaryad: 'заряд',
        zaryadnoe: 'зарядное',
        ustroystvo: 'устройство',
        dlya: 'для',
        printera: 'принтера',
        printer: 'принтер',
        bumaga: 'бумага',
        listov: 'листов',
        listy: 'листов',
        salfetki: 'салфетки',
        salfetka: 'салфетка',
        uborki: 'уборки',
        umnye: 'умные',
        koreyskie: 'корейские',
        koreyskiy: 'корейский',
        akkumulyator: 'аккумулятор',
        akkumulyatornyy: 'аккумуляторный',
        shchetochnyy: 'щёточный',
        snezhouborshchik: 'снегоуборщик',
        komplekte: 'комплекте',
        komplekt: 'комплект',
        setevoy: 'сетевой',
        besprovodnoy: 'беспроводной',
        po: 'по',
        bez: 'без',
        s: 'с',
        i: 'и',
        na: 'на',
        ot: 'от',
        v: 'в'
    };

    const UNITS = {
        mm: 'мм', sm: 'см', cm: 'см', kg: 'кг', ml: 'мл', l: 'л', g: 'г',
        v: 'В', w: 'Вт', hz: 'Гц', gb: 'ГБ', tb: 'ТБ', km: 'км', m: 'м'
    };

    // Ленивая загрузка проверщика орфографии (исключает загрузку при открытии приложения)
    let spellCheckerPromise = null;

    function getSpellChecker() {
        if (!spellCheckerPromise) {
            spellCheckerPromise = new Promise((resolve) => {
                if (window.RussianSpellChecker && typeof window.RussianSpellChecker.correct === 'function') {
                    resolve(window.RussianSpellChecker);
                    return;
                }
                // Динамически загружаем скрипт только при первой необходимости
                const script = document.createElement('script');
                script.src = 'spellchecker.js';
                script.onload = () => resolve(window.RussianSpellChecker);
                script.onerror = () => {
                    console.warn('[ProductNameNormalizer] Не удалось загрузить Hunspell. Проверка орфографии отключена.');
                    resolve(null);
                };
                document.head.appendChild(script);
            });
        }
        return spellCheckerPromise;
    }

    async function isRussianWord(word) {
        if (!word || !/[а-яё]/i.test(word)) {
            return false;
        }
        const checker = await getSpellChecker();
        if (!checker || typeof checker.correct !== 'function') {
            return false;
        }
        try {
            return checker.correct(word);
        } catch (error) {
            console.warn('[ProductNameNormalizer] Ошибка проверки слова:', word, error);
            return false;
        }
    }

    async function transliterateWord(word) {
        if (!word) return '';
        const lower = word.toLowerCase();
        
        // Быстрые проверки без обращения к словарю
        if (BRANDS[lower]) return BRANDS[lower];
        if (EXCEPTIONS[lower]) return EXCEPTIONS[lower];
        if (/[а-яё]/i.test(word)) return word;
        if (/[a-z]/i.test(word) && /\d/.test(word)) return word.toUpperCase();
        if (!transliterator) return word;

        try {
            const candidate = transliterator.reverse(lower);
            if (!candidate || !/[а-яё]/i.test(candidate)) {
                return word;
            }
            // Главная проверка Hunspell (теперь асинхронная и ленивая)
            if (await isRussianWord(candidate)) {
                return candidate;
            }
            return word;
        } catch (error) {
            console.warn('[ProductNameNormalizer] Ошибка транслитерации:', word, error);
            return word;
        }
    }

    function normalizeMeasurements(value) {
        let result = value;
        result = result.replace(/(\d+)-?x-?(\d+)-ach\b/gi, '$1×$2 А·ч');
        result = result.replace(/(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)(mm|sm|cm)\b/gi, (_, a, b, unit) => `${a}×${b}${UNITS[unit.toLowerCase()]}`);
        result = result.replace(/(\d+)-(\d+)-(ml|kg|l|g)\b/gi, (_, a, b, unit) => `${a},${b}${UNITS[unit.toLowerCase()]}`);
        result = result.replace(/(\d+)-v-(\d+)\b/gi, '$1 в $2');
        result = result.replace(/(\d+(?:[.,]\d+)?)-(mm|sm|cm|ml|kg|km|gb|tb|hz|v|w|l|g)\b/gi, (_, number, unit) => `${number}${UNITS[unit.toLowerCase()]}`);
        result = result.replace(/(\d+)-?sht\b/gi, '$1 шт.');
        result = result.replace(/(\d+(?:[.,]\d+)?)-?ach\b/gi, '$1 А·ч');
        result = result.replace(/(\d+(?:[.,]\d+)?)(mah|mm|sm|cm|ml|kg|km|gb|tb|hz|v|w|l|g)\b/gi, (_, number, unit) => {
            const normalizedUnit = unit.toLowerCase();
            if (normalizedUnit === 'mah') return `${number} мА·ч`;
            return `${number}${UNITS[normalizedUnit]}`;
        });
        result = result.replace(/(\d+)\s*x\s*(\d+)/gi, '$1×$2');
        return result;
    }

    function normalizePaperQuantity(value) {
        const isPaper = /bumaga|printer|printera|svetocopy/i.test(value);
        if (!isPaper) return value;
        return value.replace(/(\d+)-l\b/gi, '$1 листов');
    }

    function removeTechnicalId(value) {
        let result = value;
        result = result.replace(/-\d{6,}$/g, '');
        result = result.replace(/-\d{3,5}$/g, '');
        return result;
    }

    function normalizePunctuation(value) {
        let result = value;
        result = result.replace(/[\_\-]+/g, ' ');
        result = result.replace(/\s+/g, ' ');
        result = result.replace(/\bгрунт\s+эмаль\b/gi, 'грунт-эмаль');
        result = result.replace(/(\d+)\.(\d+)(?=\s|$)/g, '$1,$2');
        return result.trim();
    }

    async function normalizeToken(token) {
        if (!token) return '';
        if (/^a\d+$/i.test(token)) return token.toUpperCase();
        if (/^\d+(?:[.,]\d+)?$/.test(token)) return token;
        if (/^\d+(?:[.,]\d+)?×\d+$/.test(token)) return token;
        if (/[a-z]/i.test(token) && /\d/.test(token)) return token.toUpperCase();
        return await transliterateWord(token);
    }

    async function normalize(input) {
        if (input === undefined || input === null) return '';
        let value = String(input).trim();
        if (!value) return '';

        if (/^https?:\/\//i.test(value)) {
            try {
                const url = new URL(value);
                const segments = url.pathname.split('/').filter(Boolean);
                value = segments.length ? segments[segments.length - 1] : '';
            } catch (error) {
                return '';
            }
        }

        try {
            value = decodeURIComponent(value);
        } catch (error) {}

        value = removeTechnicalId(value);
        value = normalizePaperQuantity(value);
        value = normalizeMeasurements(value);
        value = normalizePunctuation(value);

        const tokens = value.split(/\s+/).filter(Boolean);
        const results = await Promise.all(tokens.map(normalizeToken));
        let output = results.join(' ');

        output = output.replace(/\bгрунт\s+эмаль\b/gi, 'Грунт-эмаль');
        output = output.replace(/\s+/g, ' ').trim();
        if (!output) return '';

        output = output.charAt(0).toLocaleUpperCase('ru-RU') + output.slice(1);
        return output;
    }

    window.ProductNameNormalizer = {
        normalize,
        normalizeMeasurements,
        normalizeToken,
        transliterateWord,
        isRussianWord
    };
})();