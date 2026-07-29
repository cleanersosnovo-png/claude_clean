/* ============================================================
   app.js — логика интерфейса «Финтрек»
   ============================================================ */
(function () {
  'use strict';

  const S = window.Store;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- Состояние UI ----------
  let currentView = 'dashboard';
  let currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  let modalDraft = null; // { id?, type, category, ... } при открытом окне

  const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const MONTHS_RU_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const VIEW_TITLES = { dashboard: 'Главная', transactions: 'Операции', analytics: 'Аналитика', budget: 'Бюджет' };

  // ---------- Форматирование ----------
  function cur() { return S.getSettings().currency; }

  function fmtMoney(n, withCur = true) {
    const rounded = Math.round(n);
    const s = rounded.toLocaleString('ru-RU');
    return withCur ? `${s} ${cur()}` : s;
  }
  function fmtShort(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + 'М';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.0', '') + 'к';
    return String(Math.round(n));
  }

  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return `${MONTHS_RU[m - 1]} ${y}`;
  }
  function isCurrentMonth(key) { return key === new Date().toISOString().slice(0, 7); }
  function daysInMonth(key) { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  // ---------- Расчёты за месяц ----------
  function monthStats(key) {
    const txs = S.transactionsForMonth(key);
    const expenses = txs.filter(t => t.type === 'expense');
    const incomes = txs.filter(t => t.type === 'income');
    const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
    const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);

    const byCat = {};
    expenses.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
    const catList = Object.entries(byCat)
      .map(([id, amount]) => ({ ...S.categoryById(id), amount }))
      .sort((a, b) => b.amount - a.amount);

    const budget = S.getSettings().totalBudget || 0;
    const dim = daysInMonth(key);
    const dayNow = isCurrentMonth(key) ? new Date().getDate() : dim;
    const avgPerDay = dayNow > 0 ? totalExpense / dayNow : 0;
    const projection = isCurrentMonth(key) ? avgPerDay * dim : totalExpense;

    const today = todayISO();
    const spentToday = expenses.filter(t => t.date === today).reduce((s, t) => s + t.amount, 0);

    return { txs, expenses, incomes, totalExpense, totalIncome, byCat, catList,
             budget, dim, dayNow, avgPerDay, projection, spentToday };
  }

  // ============================================================
  //  РЕНДЕР ВСЕГО ПРИЛОЖЕНИЯ
  // ============================================================
  function renderAll() {
    $('#currentMonthLabel').textContent = isCurrentMonth(currentMonth) ? 'Этот месяц' : monthLabel(currentMonth);
    renderDashboard();
    renderTransactions();
    renderAnalytics();
    renderBudget();
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const st = monthStats(currentMonth);

    $('#dashSpent').textContent = fmtMoney(st.totalExpense);
    $('#statToday').textContent = fmtMoney(st.spentToday);
    $('#statAvg').textContent = fmtMoney(st.avgPerDay);
    $('#statIncome').textContent = fmtMoney(st.totalIncome);
    $('#statProjection').textContent = fmtMoney(st.projection);

    // Бюджет-бар
    const bar = $('#dashBudgetBar');
    if (st.budget > 0) {
      const pct = Math.min(100, (st.totalExpense / st.budget) * 100);
      bar.style.width = pct + '%';
      bar.classList.toggle('over', st.totalExpense > st.budget);
      $('#dashBudgetText').textContent = `Бюджет ${fmtMoney(st.budget)}`;
      const left = st.budget - st.totalExpense;
      $('#dashBudgetLeft').textContent = left >= 0 ? `Осталось ${fmtMoney(left)}` : `Перерасход ${fmtMoney(-left)}`;
    } else {
      bar.style.width = '0%';
      $('#dashBudgetText').textContent = 'Бюджет не задан';
      $('#dashBudgetLeft').textContent = '';
    }

    // Топ категорий (до 5)
    const topWrap = $('#dashTopCategories');
    if (st.catList.length === 0) {
      topWrap.innerHTML = '<div class="empty-hint">Нет расходов в этом месяце</div>';
    } else {
      const maxAmt = st.catList[0].amount;
      topWrap.innerHTML = st.catList.slice(0, 5).map(c => {
        const w = Math.round((c.amount / maxAmt) * 100);
        const pct = st.totalExpense > 0 ? Math.round((c.amount / st.totalExpense) * 100) : 0;
        return `
          <div class="cat-row">
            <div class="cat-icon" style="background:${c.color}22">${c.emoji}</div>
            <div class="cat-row__body">
              <div class="cat-row__name">${c.name}</div>
              <div class="cat-bar"><div class="cat-bar__fill" style="width:${w}%;background:${c.color}"></div></div>
            </div>
            <div style="text-align:right">
              <div class="cat-row__amount">${fmtMoney(c.amount)}</div>
              <div class="cat-row__meta">${pct}%</div>
            </div>
          </div>`;
      }).join('');
    }

    // Последние операции (5)
    const recent = [...st.txs].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 5);
    const recentWrap = $('#dashRecent');
    recentWrap.innerHTML = recent.length
      ? recent.map(txItemHTML).join('')
      : '<div class="empty-hint">Пока нет операций. Нажмите + чтобы добавить.</div>';
    bindTxItems(recentWrap);

    // Инсайты
    renderInsights($('#dashInsights'), st, 3);
  }

  // ---------- Transactions ----------
  function renderTransactions() {
    const search = ($('#txSearch').value || '').toLowerCase().trim();
    const catFilter = $('#txCategoryFilter').value;

    // селект категорий (заполняем один раз)
    if (!$('#txCategoryFilter').dataset.filled) {
      const opts = ['<option value="">Все категории</option>']
        .concat(S.CATEGORIES.expense.map(c => `<option value="${c.id}">${c.emoji} ${c.name}</option>`));
      $('#txCategoryFilter').innerHTML = opts.join('');
      $('#txCategoryFilter').dataset.filled = '1';
    }

    let txs = S.transactionsForMonth(currentMonth);
    if (search) txs = txs.filter(t => (t.note || '').toLowerCase().includes(search) || S.categoryById(t.category).name.toLowerCase().includes(search));
    if (catFilter) txs = txs.filter(t => t.category === catFilter);
    txs.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));

    const wrap = $('#txList');
    if (txs.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-state__emoji">🧾</div>
        <div>Нет операций за этот период</div></div>`;
      return;
    }

    // группировка по дням
    const groups = {};
    txs.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
    const html = Object.keys(groups).sort().reverse().map(date => {
      const dayTotal = groups[date].filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return `
        <div class="tx-day-label"><span>${formatDayLabel(date)}</span><span>−${fmtMoney(dayTotal)}</span></div>
        ${groups[date].map(txItemHTML).join('')}`;
    }).join('');
    wrap.innerHTML = html;
    bindTxItems(wrap);
  }

  function formatDayLabel(date) {
    const d = new Date(date + 'T00:00:00');
    const today = todayISO();
    const yst = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    if (date === today) return 'Сегодня';
    if (date === yst) return 'Вчера';
    const wd = ['вс','пн','вт','ср','чт','пт','сб'][d.getDay()];
    return `${d.getDate()} ${MONTHS_RU_SHORT[d.getMonth()]}, ${wd}`;
  }

  function txItemHTML(t) {
    const c = S.categoryById(t.category);
    const sign = t.type === 'income' ? '+' : '−';
    return `
      <div class="tx-item" data-id="${t.id}">
        <div class="cat-icon" style="background:${c.color}22">${c.emoji}</div>
        <div class="tx-item__body">
          <div class="tx-item__title">${escapeHTML(t.note) || c.name}</div>
          <div class="tx-item__sub">${c.name}</div>
        </div>
        <div class="tx-item__amount ${t.type === 'income' ? 'income' : ''}">${sign}${fmtMoney(t.amount)}</div>
      </div>`;
  }

  function bindTxItems(root) {
    $$('.tx-item', root).forEach(el => {
      el.addEventListener('click', () => {
        const tx = S.getTransactions().find(t => t.id === el.dataset.id);
        if (tx) openModal(tx);
      });
    });
  }

  // ---------- Analytics ----------
  function renderAnalytics() {
    const st = monthStats(currentMonth);

    // Donut
    const segments = st.catList.map(c => ({ value: c.amount, color: c.color }));
    window.Charts.renderDonut($('#donutChart'), segments);
    $('#donutTotal').textContent = fmtShort(st.totalExpense) + ' ' + cur();

    // Legend
    const legend = $('#donutLegend');
    if (st.catList.length === 0) {
      legend.innerHTML = '<div class="empty-hint">Нет данных за месяц</div>';
    } else {
      legend.innerHTML = st.catList.map(c => {
        const pct = st.totalExpense > 0 ? Math.round((c.amount / st.totalExpense) * 100) : 0;
        return `<div class="legend__row">
          <span class="legend__dot" style="background:${c.color}"></span>
          <span class="legend__name">${c.emoji} ${c.name}</span>
          <span class="legend__val">${fmtMoney(c.amount)}</span>
          <span class="legend__pct">${pct}%</span>
        </div>`;
      }).join('');
    }

    // Bar chart: последние 6 месяцев
    const bars = [];
    const [cy, cm] = currentMonth.split('-').map(Number);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(cy, cm - 1 - i, 1);
      const key = d.toISOString().slice(0, 7);
      const total = S.transactionsForMonth(key).filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      bars.push({ label: MONTHS_RU_SHORT[d.getMonth()], value: total, current: key === currentMonth });
    }
    window.Charts.renderBars($('#barChart'), bars, fmtShort);

    renderInsights($('#analyticsInsights'), st, 6);
  }

  // ---------- Инсайты и рекомендации ----------
  function renderInsights(container, st, limit) {
    const items = buildInsights(st);
    if (items.length === 0) {
      container.innerHTML = '<div class="empty-hint">Добавьте операции — здесь появятся советы</div>';
      return;
    }
    container.innerHTML = items.slice(0, limit).map(it =>
      `<div class="insight insight--${it.kind}">
        <span class="insight__emoji">${it.emoji}</span>
        <span class="insight__text">${it.text}</span>
      </div>`).join('');
  }

  function buildInsights(st) {
    const out = [];
    if (st.expenses.length === 0) return out;

    // 1. Сравнение с прошлым месяцем
    const [y, m] = currentMonth.split('-').map(Number);
    const prevKey = new Date(y, m - 2, 1).toISOString().slice(0, 7);
    const prevTotal = S.transactionsForMonth(prevKey).filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    if (prevTotal > 0) {
      const diff = st.totalExpense - prevTotal;
      const pct = Math.round(Math.abs(diff) / prevTotal * 100);
      if (diff > 0 && pct >= 5) {
        out.push({ kind: 'warn', emoji: '📈', text: `Расходы выросли на <b>${pct}%</b> к прошлому месяцу (${fmtMoney(prevTotal)} → ${fmtMoney(st.totalExpense)}).` });
      } else if (diff < 0 && pct >= 5) {
        out.push({ kind: 'good', emoji: '📉', text: `Отлично! Тратите на <b>${pct}%</b> меньше, чем в прошлом месяце. Экономия ${fmtMoney(-diff)}.` });
      }
    }

    // 2. Бюджет
    if (st.budget > 0) {
      const usedPct = Math.round(st.totalExpense / st.budget * 100);
      if (st.totalExpense > st.budget) {
        out.push({ kind: 'warn', emoji: '🚨', text: `Бюджет превышен на <b>${fmtMoney(st.totalExpense - st.budget)}</b> (${usedPct}%). Стоит притормозить с тратами.` });
      } else if (isCurrentMonth(currentMonth) && st.projection > st.budget) {
        out.push({ kind: 'warn', emoji: '⚠️', text: `При текущем темпе к концу месяца выйдет <b>${fmtMoney(st.projection)}</b> — это выше бюджета на ${fmtMoney(st.projection - st.budget)}.` });
      } else if (usedPct <= 70 && isCurrentMonth(currentMonth)) {
        out.push({ kind: 'good', emoji: '✅', text: `Вы уложились в <b>${usedPct}%</b> бюджета. Хороший запас — ${fmtMoney(st.budget - st.totalExpense)}.` });
      }
    }

    // 3. Самая крупная категория
    if (st.catList.length > 0) {
      const top = st.catList[0];
      const pct = Math.round(top.amount / st.totalExpense * 100);
      if (pct >= 35) {
        out.push({ kind: 'default', emoji: top.emoji, text: `Больше всего уходит на «<b>${top.name}</b>» — ${fmtMoney(top.amount)} (${pct}% всех трат). Здесь потенциал для оптимизации.` });
      }
    }

    // 4. Превышение категорийных бюджетов
    const catBudgets = S.getSettings().categoryBudgets;
    Object.entries(catBudgets).forEach(([id, limit]) => {
      const spent = st.byCat[id] || 0;
      if (spent > limit) {
        const c = S.categoryById(id);
        out.push({ kind: 'warn', emoji: c.emoji, text: `Категория «<b>${c.name}</b>» вышла за лимит: ${fmtMoney(spent)} из ${fmtMoney(limit)}.` });
      }
    });

    // 5. Норма сбережений
    if (st.totalIncome > 0) {
      const savings = st.totalIncome - st.totalExpense;
      const rate = Math.round(savings / st.totalIncome * 100);
      if (rate >= 20) {
        out.push({ kind: 'good', emoji: '🏦', text: `Норма сбережений <b>${rate}%</b> — вы откладываете ${fmtMoney(savings)}. Так держать!` });
      } else if (rate < 0) {
        out.push({ kind: 'warn', emoji: '📛', text: `Расходы превысили доходы на <b>${fmtMoney(-savings)}</b>. Пора пересмотреть траты.` });
      } else {
        out.push({ kind: 'default', emoji: '💡', text: `Норма сбережений <b>${rate}%</b>. Финансисты советуют откладывать хотя бы 20% дохода.` });
      }
    }

    // 6. Средний чек по кафе — частая точка оптимизации
    const foodTx = st.expenses.filter(t => t.category === 'food');
    if (foodTx.length >= 4) {
      const avg = foodTx.reduce((s, t) => s + t.amount, 0) / foodTx.length;
      out.push({ kind: 'default', emoji: '☕', text: `Кафе и перекусы: <b>${foodTx.length}</b> покупок, в среднем ${fmtMoney(avg)}. Готовя дома, можно заметно сэкономить.` });
    }

    return out;
  }

  // ---------- Budget / Settings ----------
  function renderBudget() {
    $('#totalBudgetInput').value = S.getSettings().totalBudget || '';
    $('#currencySelect').value = S.getSettings().currency;
    $('#amountCur').textContent = cur();

    const st = monthStats(currentMonth);
    const budgets = S.getSettings().categoryBudgets;
    const wrap = $('#categoryBudgets');
    wrap.innerHTML = S.CATEGORIES.expense.map(c => {
      const limit = budgets[c.id] || 0;
      const spent = st.byCat[c.id] || 0;
      const pct = limit > 0 ? Math.min(100, Math.round(spent / limit * 100)) : 0;
      const over = limit > 0 && spent > limit;
      return `
        <div class="cat-row">
          <div class="cat-icon" style="background:${c.color}22">${c.emoji}</div>
          <div class="cat-row__body">
            <div class="cat-row__name">${c.name}</div>
            ${limit > 0 ? `<div class="cat-bar"><div class="cat-bar__fill" style="width:${pct}%;background:${over ? 'var(--danger)' : c.color}"></div></div>
              <div class="cat-row__meta">${fmtMoney(spent, false)} / ${fmtMoney(limit)}</div>` : ''}
          </div>
          <input type="number" inputmode="decimal" class="input cat-budget-input" data-cat="${c.id}"
                 style="width:96px;text-align:right" placeholder="Лимит" value="${limit || ''}" />
        </div>`;
    }).join('');

    $$('.cat-budget-input', wrap).forEach(inp => {
      inp.addEventListener('change', () => {
        S.setCategoryBudget(inp.dataset.cat, inp.value);
        renderBudget(); renderDashboard();
      });
    });
  }

  // ============================================================
  //  МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ / РЕДАКТИРОВАНИЯ
  // ============================================================
  function openModal(tx) {
    const editing = !!tx;
    modalDraft = {
      id: tx ? tx.id : null,
      type: tx ? tx.type : 'expense',
      category: tx ? tx.category : 'food',
      amount: tx ? tx.amount : '',
      date: tx ? tx.date : todayISO(),
      note: tx ? tx.note : '',
    };

    setModalType(modalDraft.type);
    $('#amountInput').value = modalDraft.amount || '';
    $('#dateInput').value = modalDraft.date;
    $('#noteInput').value = modalDraft.note;
    $('#amountCur').textContent = cur();
    $('#deleteTxBtn').hidden = !editing;
    $('#saveTxBtn').textContent = editing ? 'Обновить' : 'Сохранить';

    $('#txModal').hidden = false;
    setTimeout(() => $('#amountInput').focus(), 250);
  }

  function closeModal() { $('#txModal').hidden = true; modalDraft = null; }

  function setModalType(type) {
    modalDraft.type = type;
    $$('#typeSeg .seg__btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    // если текущая категория не из нужного набора — берём первую
    const set = S.CATEGORIES[type];
    if (!set.find(c => c.id === modalDraft.category)) modalDraft.category = set[0].id;
    renderCatGrid();
  }

  function renderCatGrid() {
    const set = S.CATEGORIES[modalDraft.type];
    const grid = $('#catGrid');
    grid.innerHTML = set.map(c =>
      `<button class="cat-chip ${c.id === modalDraft.category ? 'active' : ''}" data-cat="${c.id}">
        <span class="cat-chip__emoji">${c.emoji}</span><span>${c.name}</span>
      </button>`).join('');
    $$('.cat-chip', grid).forEach(chip => {
      chip.addEventListener('click', () => {
        modalDraft.category = chip.dataset.cat;
        $$('.cat-chip', grid).forEach(x => x.classList.toggle('active', x === chip));
      });
    });
  }

  function saveModal() {
    const amount = parseFloat($('#amountInput').value);
    if (!amount || amount <= 0) { toast('Введите сумму'); $('#amountInput').focus(); return; }
    const payload = {
      type: modalDraft.type,
      category: modalDraft.category,
      amount,
      date: $('#dateInput').value || todayISO(),
      note: $('#noteInput').value,
    };
    if (modalDraft.id) {
      S.updateTransaction(modalDraft.id, payload);
      toast('Операция обновлена');
    } else {
      S.addTransaction(payload);
      toast('Добавлено ✓');
    }
    // если операция в другом месяце — переключимся туда
    const mk = payload.date.slice(0, 7);
    if (mk !== currentMonth) currentMonth = mk;
    closeModal();
    renderAll();
  }

  function deleteModal() {
    if (!modalDraft.id) return;
    if (!confirm('Удалить эту операцию?')) return;
    S.deleteTransaction(modalDraft.id);
    toast('Удалено');
    closeModal();
    renderAll();
  }

  // ============================================================
  //  ВЫБОР МЕСЯЦА
  // ============================================================
  function openMonthPicker() {
    const months = S.availableMonths();
    const list = $('#monthList');
    list.innerHTML = months.map(key => {
      const total = S.transactionsForMonth(key).filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return `<button class="month-item ${key === currentMonth ? 'active' : ''}" data-key="${key}">
        <span>${monthLabel(key)}</span>
        <span class="month-item__sum">${total > 0 ? '−' + fmtMoney(total) : '—'}</span>
      </button>`;
    }).join('');
    $$('.month-item', list).forEach(el => {
      el.addEventListener('click', () => {
        currentMonth = el.dataset.key;
        $('#monthModal').hidden = true;
        renderAll();
      });
    });
    $('#monthModal').hidden = false;
  }

  // ============================================================
  //  НАВИГАЦИЯ
  // ============================================================
  function navigate(view) {
    currentView = view;
    $$('.view').forEach(v => v.hidden = v.id !== `view-${view}`);
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.nav === view));
    $('#headerTitle').textContent = VIEW_TITLES[view];
    $('#main').scrollTop = 0;
    window.scrollTo(0, 0);
  }

  // ============================================================
  //  ПРОЧЕЕ
  // ============================================================
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1900);
  }

  function escapeHTML(s) {
    return (s || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function exportData() {
    const blob = new Blob([S.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fintrek-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Данные экспортированы');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        S.importJSON(reader.result);
        toast('Данные загружены');
        renderAll();
      } catch (e) {
        toast('Ошибка: неверный файл');
      }
    };
    reader.readAsText(file);
  }

  // ============================================================
  //  ПОДКЛЮЧЕНИЕ СОБЫТИЙ
  // ============================================================
  function bindEvents() {
    // Навигация по табам + ссылкам «Все»
    $$('[data-nav]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.nav)));

    // FAB
    $('#fab').addEventListener('click', () => openModal(null));

    // Модалка операции
    $('#txModal').addEventListener('click', e => { if (e.target.dataset.close !== undefined) closeModal(); });
    $$('#typeSeg .seg__btn').forEach(b => b.addEventListener('click', () => setModalType(b.dataset.type)));
    $('#saveTxBtn').addEventListener('click', saveModal);
    $('#deleteTxBtn').addEventListener('click', deleteModal);

    // Месяц
    $('#monthPickerBtn').addEventListener('click', openMonthPicker);
    $('#monthModal').addEventListener('click', e => { if (e.target.dataset.close !== undefined) $('#monthModal').hidden = true; });

    // Фильтры операций
    $('#txSearch').addEventListener('input', renderTransactions);
    $('#txCategoryFilter').addEventListener('change', renderTransactions);

    // Настройки бюджета
    $('#totalBudgetInput').addEventListener('change', e => {
      S.updateSettings({ totalBudget: Number(e.target.value) || 0 });
      renderDashboard(); renderBudget();
    });
    $('#currencySelect').addEventListener('change', e => {
      S.updateSettings({ currency: e.target.value });
      renderAll();
    });

    // Данные
    $('#exportBtn').addEventListener('click', exportData);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
    $('#clearBtn').addEventListener('click', () => {
      if (confirm('Удалить ВСЕ операции и настройки? Это действие необратимо.')) {
        S.clearAll(); currentMonth = new Date().toISOString().slice(0, 7);
        toast('Всё очищено'); renderAll();
      }
    });
  }

  // ---------- Первичное наполнение демо-данными (только при первом запуске) ----------
  function seedIfEmpty() {
    if (S.getTransactions().length > 0) return;
    if (localStorage.getItem('fintrek.seeded')) return;
    localStorage.setItem('fintrek.seeded', '1');

    const now = new Date();
    const mk = (offset, cat, type, amount, note) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      S.addTransaction({ type, category: cat, amount, date: d.toISOString().slice(0, 10), note });
    };
    S.updateSettings({ totalBudget: 60000 });
    mk(0, 'groceries', 'expense', 1240, 'Пятёрочка');
    mk(0, 'food', 'expense', 450, 'Кофе');
    mk(1, 'transport', 'expense', 65, 'Метро');
    mk(1, 'food', 'expense', 890, 'Обед');
    mk(2, 'fun', 'expense', 1200, 'Кино');
    mk(3, 'groceries', 'expense', 2300, 'Ашан');
    mk(4, 'comm', 'expense', 500, 'Мобильная связь');
    mk(5, 'housing', 'expense', 18000, 'Аренда');
    mk(2, 'salary', 'income', 90000, 'Зарплата');
  }

  // ---------- Service worker ----------
  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
  }

  // ---------- Старт ----------
  function init() {
    seedIfEmpty();
    bindEvents();
    navigate('dashboard');
    renderAll();
    registerSW();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
