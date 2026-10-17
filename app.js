'use strict';

/* ═══════════════════════════════════════════════
   КОНФИГУРАЦИЯ
   ═══════════════════════════════════════════════ */
const SUPABASE_URL = 'https://knnthxhaqwfkfedfgcgk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtubnRoeGhhcXdma2ZlZGZnY2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNDU4MTcsImV4cCI6MjA5ODgyMTgxN30.RZ8v2S3frO9vTu0bXUp9cRTPbaZijivcwfwK0284eJM';

const CURRENCIES = {
  UAH: { symbol: '₴', name: 'Гривна' },
  MDL: { symbol: 'L', name: 'Молдавский лей' },
  EUR: { symbol: '€', name: 'Евро' },
  USD: { symbol: '$', name: 'Доллар США' }
};

const CACHE_KEY = 'converter_rates_cache';
const PREFS_KEY = 'converter_prefs';
const CACHE_TTL = 60 * 1000;

/* ═══════════════════════════════════════════════
   ФЛАГИ (inline SVG)
   ═══════════════════════════════════════════════ */
function stars(count, cx, cy, r, size, color) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = (-90 + (360 / count) * i) * Math.PI / 180;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    out += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${size}" fill="${color}"/>`;
  }
  return out;
}

function usDots() {
  let out = '';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) {
      const x = 2.6 + col * 3.9 + (row % 2 ? 1.9 : 0);
      const y = 2.6 + row * 3.9;
      out += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.85" fill="#ffffff"/>`;
    }
  }
  return out;
}

const FLAGS = {
  UAH: `<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="20" fill="#0057B7"/>
      <rect y="20" width="60" height="20" fill="#FFD700"/>
    </svg>`,
  MDL: `<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <rect width="20" height="40" fill="#003DA5"/>
      <rect x="20" width="20" height="40" fill="#FFD200"/>
      <rect x="40" width="20" height="40" fill="#C8102E"/>
      <path d="M30 12.5c-3.1 0-5.2 2.1-5.2 5 0 4.2 2.2 6.4 3.2 9.4h4c1-3 3.2-5.2 3.2-9.4 0-2.9-2.1-5-5.2-5z" fill="#7A4B22"/>
      <path d="M27.2 15.4c-0.9-0.6-1.6-0.3-2 0.4 0.9 0.1 1.4 0.5 1.6 1.2z" fill="#7A4B22"/>
      <path d="M32.8 15.4c0.9-0.6 1.6-0.3 2 0.4-0.9 0.1-1.4 0.5-1.6 1.2z" fill="#7A4B22"/>
      <circle cx="30" cy="19" r="1" fill="#FFD200"/>
    </svg>`,
  EUR: `<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="40" fill="#003399"/>
      ${stars(12, 30, 20, 10.5, 1.55, '#FFCC00')}
    </svg>`,
  USD: `<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="40" fill="#ffffff"/>
      <rect width="60" height="3.08" fill="#B22234"/>
      <rect y="6.15" width="60" height="3.08" fill="#B22234"/>
      <rect y="12.31" width="60" height="3.08" fill="#B22234"/>
      <rect y="18.46" width="60" height="3.08" fill="#B22234"/>
      <rect y="24.62" width="60" height="3.08" fill="#B22234"/>
      <rect y="30.77" width="60" height="3.08" fill="#B22234"/>
      <rect y="36.92" width="60" height="3.08" fill="#B22234"/>
      <rect width="26" height="21.54" fill="#3C3B6E"/>
      ${usDots()}
    </svg>`
};

/* ═══════════════════════════════════════════════
   DOM
   ═══════════════════════════════════════════════ */
const el = {
  rowFrom: document.getElementById('rowFrom'),
  rowTo: document.getElementById('rowTo'),
  flagFrom: document.getElementById('flagFrom'),
  flagTo: document.getElementById('flagTo'),
  codeFrom: document.getElementById('codeFrom'),
  codeTo: document.getElementById('codeTo'),
  valFrom: document.getElementById('valFrom'),
  valTo: document.getElementById('valTo'),
  keypad: document.getElementById('keypad'),
  rateLine: document.getElementById('rateLine'),
  rateAge: document.getElementById('rateAge'),
  refreshBtn: document.getElementById('refreshBtn'),
  infoBtn: document.getElementById('infoBtn'),
  pickerBackdrop: document.getElementById('pickerBackdrop'),
  curList: document.getElementById('curList'),
  infoBackdrop: document.getElementById('infoBackdrop'),
  ratesList: document.getElementById('ratesList'),
  sheetMeta: document.getElementById('sheetMeta'),
  statusMessage: document.getElementById('statusMessage')
};

/* ═══════════════════════════════════════════════
   СОСТОЯНИЕ
   ═══════════════════════════════════════════════ */
const state = {
  from: 'UAH',
  to: 'USD',
  tokens: [],       // ['100', '+', '20']
  input: '0',       // текущее вводимое число
  justEvaluated: false,
  rates: null,
  lastUpdate: null,
  pickerSlot: 'from'
};

/* ═══════════════════════════════════════════════
   УТИЛИТЫ
   ═══════════════════════════════════════════════ */
function groupInt(str) {
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
}

function formatTyped(raw) {
  if (!raw) return '';
  const neg = raw.startsWith('-');
  const body = neg ? raw.slice(1) : raw;
  const [int, dec] = body.split('.');
  let out = groupInt(int || '0');
  if (dec !== undefined) out += ',' + dec;
  return (neg ? '−' : '') + out;
}

function formatResult(value) {
  if (!isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  const maxFrac = abs < 1 ? 4 : 2;
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac
  });
}

function formatRate(value) {
  if (!isFinite(value) || value === 0) return '—';
  const abs = Math.abs(value);
  const maxFrac = abs >= 1 ? 2 : 5;
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac
  });
}

function applyOp(a, op, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? NaN : a / b;
    default: return b;
  }
}

function currentValue() {
  const seq = state.tokens.slice();
  if (state.input !== '') seq.push(state.input);
  if (!seq.length) return 0;
  let acc = Number(seq[0]) || 0;
  let i = 1;
  while (i < seq.length) {
    const op = seq[i];
    const next = seq[i + 1];
    if (next === undefined) break;
    acc = applyOp(acc, op, Number(next) || 0);
    i += 2;
  }
  return acc;
}

function convert(value, from, to) {
  if (!state.rates || !state.rates[from] || !state.rates[to]) return null;
  return (value / state.rates[from]) * state.rates[to];
}

/* ═══════════════════════════════════════════════
   ОТРИСОВКА
   ═══════════════════════════════════════════════ */
const OP_LABEL = { '+': '+', '-': '−', '*': '×', '/': '÷' };

function fitValue(node) {
  const len = node.textContent.length;
  let size = 38;
  if (len > 7) size = Math.max(19, 38 - (len - 7) * 2.6);
  node.style.fontSize = size + 'px';
}

function render() {
  el.flagFrom.innerHTML = FLAGS[state.from];
  el.flagTo.innerHTML = FLAGS[state.to];
  el.codeFrom.textContent = state.from;
  el.codeTo.textContent = state.to;

  // верхняя строка — выражение
  let top = '';
  if (state.tokens.length) {
    top = state.tokens.map(t => (t.length === 1 && OP_LABEL[t]) ? OP_LABEL[t] : formatTyped(t)).join(' ');
    if (state.input !== '') top += ' ' + formatTyped(state.input);
  } else {
    top = formatTyped(state.input || '0');
  }
  el.valFrom.textContent = top;
  fitValue(el.valFrom);

  // нижняя строка — результат конвертации
  const value = currentValue();
  const converted = convert(value, state.from, state.to);
  el.valTo.textContent = converted === null ? '—' : formatResult(converted);
  fitValue(el.valTo);

  // линия курса
  const unit = convert(1, state.from, state.to);
  el.rateLine.textContent = unit === null
    ? `1 ${state.from} = — ${state.to}`
    : `1 ${state.from} = ${formatRate(unit)} ${state.to}`;

  updateAge();
}

function ageLabel(ts) {
  if (!ts) return 'Загрузка…';
  const diff = Date.now() - ts;
  const sec = Math.max(0, Math.round(diff / 1000));
  if (sec < 60) return 'Только что';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} ч назад`;
  const d = new Date(ts);
  const today = new Date();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Сегодня ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${time}`;
}

function updateAge() {
  const text = ageLabel(state.lastUpdate);
  el.rateAge.textContent = text;
  el.rateAge.className = 'rate-age' + (state.lastUpdate && Date.now() - state.lastUpdate > 3 * 3600 * 1000 ? ' stale' : '');
}

/* ═══════════════════════════════════════════════
   КЛАВИАТУРА
   ═══════════════════════════════════════════════ */
function pushDigit(d) {
  if (state.justEvaluated) {
    state.tokens = [];
    state.input = '0';
    state.justEvaluated = false;
  }
  if (state.input === '0') state.input = d;
  else state.input += d;

  const digits = state.input.replace(/\D/g, '');
  if (digits.length > 12) state.input = state.input.slice(0, -1);
}

function pushComma() {
  state.justEvaluated = false;
  if (state.input === '') state.input = '0.';
  else if (!state.input.includes('.')) state.input += '.';
}

function pushOp(op) {
  state.justEvaluated = false;
  if (state.input !== '') {
    state.tokens.push(state.input, op);
    state.input = '';
  } else if (state.tokens.length) {
    state.tokens[state.tokens.length - 1] = op;
  } else {
    state.tokens.push('0', op);
  }
}

function backspace() {
  state.justEvaluated = false;
  if (state.input !== '') {
    state.input = state.input.length > 1 ? state.input.slice(0, -1) : '0';
  } else if (state.tokens.length) {
    const last = state.tokens.pop();
    if (last !== undefined && !isNaN(Number(last))) state.input = last;
  }
}

function clearAll() {
  state.tokens = [];
  state.input = '0';
  state.justEvaluated = false;
}

function percent() {
  const value = state.input !== '' ? Number(state.input) : currentValue();
  const res = value / 100;
  state.input = String(res);
  state.tokens = [];
  state.justEvaluated = false;
}

function equals() {
  const value = currentValue();
  state.tokens = [];
  state.input = String(Math.round(value * 1e10) / 1e10);
  state.justEvaluated = true;
}

function swapCurrencies() {
  const f = state.from;
  state.from = state.to;
  state.to = f;
  savePrefs();
  render();
}

el.keypad.addEventListener('click', (e) => {
  const btn = e.target.closest('button.key');
  if (!btn) return;

  if (btn.dataset.digit !== undefined) pushDigit(btn.dataset.digit);
  else if (btn.dataset.op !== undefined) pushOp(btn.dataset.op);
  else {
    switch (btn.dataset.action) {
      case 'clear': clearAll(); break;
      case 'backspace': backspace(); break;
      case 'swap': swapCurrencies(); return;
      case 'percent': percent(); break;
      case 'comma': pushComma(); break;
      case 'equals': equals(); break;
    }
  }
  render();
});

// физическая клавиатура (удобно на десктопе)
document.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9') { pushDigit(e.key); render(); }
  else if (e.key === ',' || e.key === '.') { pushComma(); render(); }
  else if (['+', '-', '*', '/'].includes(e.key)) { pushOp(e.key); render(); }
  else if (e.key === 'Enter' || e.key === '=') { equals(); render(); }
  else if (e.key === 'Backspace') { backspace(); render(); }
  else if (e.key === 'Escape') { clearAll(); render(); }
});

/* ═══════════════════════════════════════════════
   ВЫБОР ВАЛЮТЫ
   ═══════════════════════════════════════════════ */
function openPicker(slot) {
  state.pickerSlot = slot;
  const current = slot === 'from' ? state.from : state.to;
  el.curList.innerHTML = Object.keys(CURRENCIES).map(code => `
    <button type="button" class="cur-option ${code === current ? 'selected' : ''}" data-code="${code}">
      <span class="flag">${FLAGS[code]}</span>
      <span class="opt-code">${code}</span>
      <span class="opt-name">${CURRENCIES[code].name}</span>
      <span class="opt-check">✓</span>
    </button>
  `).join('');
  el.pickerBackdrop.classList.add('open');
}

function closePicker() {
  el.pickerBackdrop.classList.remove('open');
}

el.curList.addEventListener('click', (e) => {
  const btn = e.target.closest('.cur-option');
  if (!btn) return;
  const code = btn.dataset.code;
  if (state.pickerSlot === 'from') {
    if (code === state.to) { state.to = state.from; }
    state.from = code;
  } else {
    if (code === state.from) { state.from = state.to; }
    state.to = code;
  }
  closePicker();
  savePrefs();
  render();
});

el.rowFrom.addEventListener('click', () => openPicker('from'));
el.rowTo.addEventListener('click', () => openPicker('to'));
el.pickerBackdrop.addEventListener('click', (e) => {
  if (e.target === el.pickerBackdrop) closePicker();
});

/* ═══════════════════════════════════════════════
   ИНФОРМАЦИЯ О КУРСАХ
   ═══════════════════════════════════════════════ */
function openInfo() {
  if (!state.rates) {
    el.ratesList.innerHTML = '<div class="sheet-meta">Курсы ещё не загружены</div>';
    el.sheetMeta.textContent = '';
  } else {
    el.ratesList.innerHTML = Object.keys(CURRENCIES).map(code => `
      <div class="rate-option">
        <span class="flag">${FLAGS[code]}</span>
        <span class="opt-code">${code}</span>
        <span class="opt-name">${CURRENCIES[code].name}</span>
        <span class="opt-value">${formatRate(state.rates[code])}</span>
      </div>
    `).join('');
    el.sheetMeta.textContent = `Курсы к 1 USD · обновлено: ${ageLabel(state.lastUpdate)}`;
  }
  el.infoBackdrop.classList.add('open');
}

el.infoBtn.addEventListener('click', openInfo);
el.infoBackdrop.addEventListener('click', (e) => {
  if (e.target === el.infoBackdrop) el.infoBackdrop.classList.remove('open');
});

/* ═══════════════════════════════════════════════
   НАСТРОЙКИ
   ═══════════════════════════════════════════════ */
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ from: state.from, to: state.to }));
  } catch (e) { /* игнорируем */ }
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (CURRENCIES[p.from] && CURRENCIES[p.to] && p.from !== p.to) {
      state.from = p.from;
      state.to = p.to;
    }
  } catch (e) { /* игнорируем */ }
}

/* ═══════════════════════════════════════════════
   КЭШ КУРСОВ
   ═══════════════════════════════════════════════ */
function loadFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { data, age: Date.now() - data.timestamp, isFresh: Date.now() - data.timestamp < CACHE_TTL };
  } catch (e) {
    return null;
  }
}

function saveToCache(ratesData, updateTime, source) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rates: ratesData, timestamp: updateTime, source }));
  } catch (e) { /* игнорируем */ }
}

/* ═══════════════════════════════════════════════
   ЗАГРУЗКА КУРСОВ ИЗ SUPABASE
   ═══════════════════════════════════════════════ */
let sb = null;

async function fetchRates({ manual = false } = {}) {
  el.refreshBtn.classList.add('loading');
  try {
    if (!sb) throw new Error('нет подключения к базе');

    const { data, error } = await sb.from('currency_rates').select('*');
    if (error) throw new Error(error.message);

    if (!data || !data.length) throw new Error('в базе нет курсов');

    const parsed = {};
    let updateTime = null;
    data.forEach(row => {
      const rate = parseFloat(row.rate_to_usd);
      if (isNaN(rate)) return;
      parsed[row.currency_code] = rate;
      const t = new Date(row.last_updated).getTime();
      if (!isNaN(t) && (!updateTime || t > updateTime)) updateTime = t;
    });

    if (!Object.keys(parsed).length) throw new Error('некорректные данные в базе');

    state.rates = parsed;
    state.lastUpdate = updateTime || Date.now();
    saveToCache(parsed, state.lastUpdate, 'supabase');
    render();
    if (manual) showStatus('Курс обновлён', 'success');
  } catch (error) {
    const cached = loadFromCache();
    if (cached && cached.data.rates) {
      state.rates = cached.data.rates;
      state.lastUpdate = cached.data.timestamp;
      render();
      el.rateAge.className = 'rate-age stale';
      el.rateAge.textContent = 'Кэш · ' + ageLabel(state.lastUpdate);
      if (manual) showStatus(`Ошибка сети. Используются кэшированные курсы`, 'error');
    } else {
      el.rateAge.textContent = 'Нет данных';
      el.rateAge.className = 'rate-age error';
      showStatus(`Не удалось загрузить курсы: ${error.message}`, 'error');
    }
  } finally {
    el.refreshBtn.classList.remove('loading');
  }
}

el.refreshBtn.addEventListener('click', () => fetchRates({ manual: true }));

/* ═══════════════════════════════════════════════
   СТАТУС
   ═══════════════════════════════════════════════ */
let statusTimer = null;

function showStatus(message, type = '') {
  el.statusMessage.textContent = message;
  el.statusMessage.className = 'status-message show ' + type;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    el.statusMessage.className = 'status-message ' + type;
  }, 2600);
}

/* ═══════════════════════════════════════════════
   ИНИЦИАЛИЗАЦИЯ
   ═══════════════════════════════════════════════ */
async function init() {
  loadPrefs();
  render();

  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    sb = null;
  }

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (e) { /* офлайн-режим не критичен */ }
  }

  const forceRefresh = new URLSearchParams(location.search).get('forceRefresh') === 'true';
  const cached = loadFromCache();

  if (cached && cached.data.rates && !forceRefresh) {
    state.rates = cached.data.rates;
    state.lastUpdate = cached.data.timestamp;
    render();
    if (cached.isFresh) return;
  }

  await fetchRates();
}

setInterval(updateAge, 30 * 1000);
init();
