/* ============================================================
   macro.js — курсы валют и ключевая ставка ЦБ (сеть, best-effort)
   ============================================================
   Курсы валют берутся из открытого зеркала данных ЦБ РФ
   (cbr-xml-daily.ru — публичный JSON с поддержкой CORS).
   Ключевая ставка — попытка через официальный сервис ЦБ РФ;
   у него нет гарантированной поддержки запросов из браузера,
   поэтому при ошибке приложение просто предлагает ввести
   значение вручную — сеть не обязательна для работы приложения.
   ============================================================ */
(function () {
  'use strict';

  const FX_MIRROR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
  const FX_CODES = ['USD', 'EUR', 'CNY', 'GBP'];

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут запроса')), ms)),
    ]);
  }

  async function fetchFxRates() {
    const resp = await withTimeout(fetch(FX_MIRROR_URL, { cache: 'no-store' }), 8000);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const rates = {};
    FX_CODES.forEach(code => {
      const v = data.Valute && data.Valute[code];
      if (v && v.Value && v.Nominal) rates[code] = v.Value / v.Nominal;
    });
    if (Object.keys(rates).length === 0) throw new Error('Пустой ответ');
    return { rates, date: (data.Date || '').slice(0, 10) || new Date().toISOString().slice(0, 10) };
  }

  async function fetchKeyRate() {
    const to = new Date();
    const from = new Date(to.getTime() - 21 * 864e5); // окно 3 недели — чтобы точно попасть на последнее значение
    const fmt = d => d.toISOString().slice(0, 10);
    const url = `https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx/KeyRate?FromDate=${fmt(from)}&ToDate=${fmt(to)}`;

    const resp = await withTimeout(fetch(url, { cache: 'no-store' }), 8000);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('Ошибка разбора ответа');

    const nodes = Array.from(xml.getElementsByTagName('KR'));
    if (nodes.length === 0) throw new Error('Нет данных в ответе');
    const last = nodes[nodes.length - 1];
    const rateNode = last.getElementsByTagName('Rate')[0];
    const dateNode = last.getElementsByTagName('DT')[0];
    const rate = rateNode ? parseFloat(rateNode.textContent.replace(',', '.')) : NaN;
    if (!rate || isNaN(rate)) throw new Error('Не удалось прочитать ставку');
    const date = dateNode ? dateNode.textContent.slice(0, 10) : fmt(to);
    return { rate, date };
  }

  window.Macro = { fetchFxRates, fetchKeyRate, FX_CODES };
})();
