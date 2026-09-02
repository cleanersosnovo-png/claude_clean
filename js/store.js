/* ============================================================
   store.js — данные, категории и работа с localStorage
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'fintrek.v1';

  // Категории расходов и доходов
  const CATEGORIES = {
    expense: [
      { id: 'food',      name: 'Кафе',         emoji: '🍔', color: '#f97316' },
      { id: 'groceries', name: 'Продукты',     emoji: '🛒', color: '#22c55e' },
      { id: 'transport', name: 'Транспорт',    emoji: '🚌', color: '#3b82f6' },
      { id: 'housing',   name: 'Жильё',        emoji: '🏠', color: '#8b5cf6' },
      { id: 'fun',       name: 'Досуг',        emoji: '🎬', color: '#ec4899' },
      { id: 'clothes',   name: 'Одежда',       emoji: '👕', color: '#14b8a6' },
      { id: 'health',    name: 'Здоровье',     emoji: '💊', color: '#ef4444' },
      { id: 'education', name: 'Обучение',     emoji: '📚', color: '#6366f1' },
      { id: 'comm',      name: 'Связь',        emoji: '📱', color: '#0ea5e9' },
      { id: 'travel',    name: 'Поездки',      emoji: '✈️', color: '#06b6d4' },
      { id: 'gifts',     name: 'Подарки',      emoji: '🎁', color: '#f43f5e' },
      { id: 'invest_out', name: 'Инвестиции',  emoji: '📊', color: '#2563eb' },
      { id: 'other',     name: 'Прочее',       emoji: '💳', color: '#64748b' },
    ],
    income: [
      { id: 'salary',    name: 'Зарплата',     emoji: '💵', color: '#16a34a' },
      { id: 'freelance', name: 'Подработка',   emoji: '💼', color: '#0d9488' },
      { id: 'invest',    name: 'Инвестиции',   emoji: '📈', color: '#2563eb' },
      { id: 'gift_in',   name: 'Подарок',      emoji: '🎁', color: '#db2777' },
      { id: 'other_in',  name: 'Прочее',       emoji: '💰', color: '#64748b' },
    ],
  };

  const DEFAULT_STATE = {
    transactions: [],           // { id, type, amount, category, date:'YYYY-MM-DD', note }
    loans: [],                  // { id, name, principal, remaining, monthlyPayment, rate, nextDate }
    settings: {
      currency: '₽',
      totalBudget: 0,
      categoryBudgets: {},      // { categoryId: amount }
      reportEmail: '',
    },
  };

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return {
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        loans: Array.isArray(parsed.loans) ? parsed.loans : [],
        settings: Object.assign(structuredClone(DEFAULT_STATE.settings), parsed.settings || {}),
      };
    } catch (e) {
      console.warn('Не удалось загрузить данные:', e);
      return structuredClone(DEFAULT_STATE);
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Не удалось сохранить данные:', e);
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- Публичный API ----------
  const Store = {
    CATEGORIES,

    getState() { return state; },
    getSettings() { return state.settings; },
    getTransactions() { return state.transactions; },
    getLoans() { return state.loans; },

    categoryById(id) {
      return CATEGORIES.expense.find(c => c.id === id)
          || CATEGORIES.income.find(c => c.id === id)
          || { id, name: 'Прочее', emoji: '❓', color: '#64748b' };
    },

    addTransaction(tx) {
      const item = {
        id: uid(),
        type: tx.type,
        amount: Math.abs(Number(tx.amount)) || 0,
        category: tx.category,
        date: tx.date,
        note: (tx.note || '').trim(),
      };
      state.transactions.push(item);
      persist();
      return item;
    },

    updateTransaction(id, patch) {
      const tx = state.transactions.find(t => t.id === id);
      if (!tx) return null;
      if (patch.amount != null) tx.amount = Math.abs(Number(patch.amount)) || 0;
      if (patch.type) tx.type = patch.type;
      if (patch.category) tx.category = patch.category;
      if (patch.date) tx.date = patch.date;
      if (patch.note != null) tx.note = patch.note.trim();
      persist();
      return tx;
    },

    deleteTransaction(id) {
      state.transactions = state.transactions.filter(t => t.id !== id);
      persist();
    },

    addLoan(loan) {
      const item = {
        id: uid(),
        name: (loan.name || '').trim() || 'Кредит',
        principal: Math.abs(Number(loan.principal)) || 0,
        remaining: Math.abs(Number(loan.remaining)) || 0,
        monthlyPayment: Math.abs(Number(loan.monthlyPayment)) || 0,
        rate: Number(loan.rate) || 0,
        nextDate: loan.nextDate || null,
      };
      state.loans.push(item);
      persist();
      return item;
    },

    updateLoan(id, patch) {
      const loan = state.loans.find(l => l.id === id);
      if (!loan) return null;
      if (patch.name != null) loan.name = patch.name.trim() || 'Кредит';
      if (patch.principal != null) loan.principal = Math.abs(Number(patch.principal)) || 0;
      if (patch.remaining != null) loan.remaining = Math.max(0, Number(patch.remaining) || 0);
      if (patch.monthlyPayment != null) loan.monthlyPayment = Math.abs(Number(patch.monthlyPayment)) || 0;
      if (patch.rate != null) loan.rate = Number(patch.rate) || 0;
      if (patch.nextDate !== undefined) loan.nextDate = patch.nextDate;
      persist();
      return loan;
    },

    deleteLoan(id) {
      state.loans = state.loans.filter(l => l.id !== id);
      persist();
    },

    payLoan(id, amount) {
      const loan = state.loans.find(l => l.id === id);
      if (!loan) return null;
      const pay = Math.abs(Number(amount)) || 0;
      loan.remaining = Math.max(0, loan.remaining - pay);
      if (loan.nextDate) {
        const d = new Date(loan.nextDate + 'T00:00:00');
        d.setMonth(d.getMonth() + 1);
        loan.nextDate = d.toISOString().slice(0, 10);
      }
      persist();
      return loan;
    },

    updateSettings(patch) {
      Object.assign(state.settings, patch);
      persist();
    },

    setCategoryBudget(catId, amount) {
      const val = Number(amount) || 0;
      if (val > 0) state.settings.categoryBudgets[catId] = val;
      else delete state.settings.categoryBudgets[catId];
      persist();
    },

    // Операции за конкретный месяц (ключ 'YYYY-MM')
    transactionsForMonth(monthKey) {
      return state.transactions.filter(t => t.date.slice(0, 7) === monthKey);
    },

    // Список месяцев, где есть операции (+ текущий), от новых к старым
    availableMonths() {
      const set = new Set(state.transactions.map(t => t.date.slice(0, 7)));
      set.add(new Date().toISOString().slice(0, 7));
      return Array.from(set).sort().reverse();
    },

    exportJSON() {
      return JSON.stringify(state, null, 2);
    },

    importJSON(text) {
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.transactions)) {
        throw new Error('Неверный формат файла');
      }
      state = {
        transactions: parsed.transactions,
        loans: Array.isArray(parsed.loans) ? parsed.loans : [],
        settings: Object.assign(structuredClone(DEFAULT_STATE.settings), parsed.settings || {}),
      };
      persist();
    },

    clearAll() {
      state = structuredClone(DEFAULT_STATE);
      persist();
    },
  };

  window.Store = Store;
})();
