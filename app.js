'use strict';

// ═══════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════
const API_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_KEY = 'converter_rates_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах

const CURRENCIES = {
  UAH: { symbol: '₴', name: 'Гривна' },
  MDL: { symbol: 'L', name: 'Молдавский лей' },
  EUR: { symbol: '€', name: 'Евро' },
  USD: { symbol: '$', name: 'Доллар' }
};

// ═══════════════════════════════════════════════
// DOM ЭЛЕМЕНТЫ
// ═══════════════════════════════════════════════
const amountInput = document.getElementById('amount');
const fromCurrencySelect = document.getElementById('fromCurrency');
const resultsContainer = document.getElementById('results');
const lastUpdateSpan = document.getElementById('lastUpdate');
const refreshBtn = document.getElementById('refreshBtn');
const statusMessage = document.getElementById('statusMessage');
const chipCheckboxes = document.querySelectorAll('.chip input[type="checkbox"]');

// ═══════════════════════════════════════════════
// СОСТОЯНИЕ
// ═══════════════════════════════════════════════
let rates = null;      // Курсы валют относительно USD
let lastUpdate = null;  // Время последнего обновления

// ═══════════════════════════════════════════════
// РАБОТА С КЭШЕМ
// ═══════════════════════════════════════════════
function loadFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const age = Date.now() - data.timestamp;
    return { data, age, isFresh: age < CACHE_TTL };
  } catch (e) {
    console.warn('Ошибка чтения кэша:', e);
    return null;
  }
}

function saveToCache(ratesData, updateTime) {
  try {
    const payload = {
      rates: ratesData,
      timestamp: updateTime,
      source: 'open.er-api.com'
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Ошибка записи кэша:', e);
  }
}

// ═══════════════════════════════════════════════
// ПОЛУЧЕНИЕ КУРСОВ
// ═══════════════════════════════════════════════
async function fetchRates() {
  refreshBtn.classList.add('loading');
  try {
    const response = await fetch(API_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.result !== 'success' || !data.rates) {
      throw new Error('Некорректный ответ API');
    }
    // Извлекаем только нужные валюты
    const filtered = {
      USD: data.rates.USD,
      EUR: data.rates.EUR,
      UAH: data.rates.UAH,
      MDL: data.rates.MDL
    };
    const updateTime = data.time_last_update_unix
      ? data.time_last_update_unix * 1000
      : Date.now();
    rates = filtered;
    lastUpdate = updateTime;
    saveToCache(filtered, updateTime);
    updateLastUpdateDisplay();
    showStatus('Курсы обновлены', 'success');
  } catch (error) {
    console.error('Ошибка загрузки курсов:', error);
    // Пытаемся использовать кэш даже если устарел
    const cached = loadFromCache();
    if (cached && cached.data.rates) {
      rates = cached.data.rates;
      lastUpdate = cached.data.timestamp;
      updateLastUpdateDisplay();
      showStatus('Нет сети — используются кэшированные курсы', 'error');
    } else {
      showStatus('Не удалось загрузить курсы. Проверьте интернет.', 'error');
    }
  } finally {
    refreshBtn.classList.remove('loading');
    renderResults();
  }
}

// ═══════════════════════════════════════════════
// КОНВЕРТАЦИЯ
// ═══════════════════════════════════════════════
function convert(amount, from, to) {
  if (!rates) return 0;
  // rates хранят: 1 USD = X валюты
  // Переводим сумму в USD, затем в целевую валюту
  const amountInUSD = amount / rates[from];
  return amountInUSD * rates[to];
}

function formatNumber(value) {
  if (!isFinite(value)) return '0';
  const abs = Math.abs(value);
  let decimals;
  if (abs === 0) decimals = 0;
  else if (abs < 0.01) decimals = 6;
  else if (abs < 1) decimals = 4;
  else if (abs < 100) decimals = 2;
  else decimals = 2;
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals
  });
}

// ═══════════════════════════════════════════════
// ОТРИСОВКА
// ═══════════════════════════════════════════════
function getActiveTargetCurrencies() {
  const active = [];
  chipCheckboxes.forEach(cb => {
    if (cb.checked) active.push(cb.value);
  });
  return active;
}

function renderResults() {
  if (!rates) {
    resultsContainer.innerHTML = '<div class="empty-state">Загрузка курсов…</div>';
    return;
  }

  const amount = parseFloat(amountInput.value) || 0;
  const from = fromCurrencySelect.value;
  const targets = getActiveTargetCurrencies();

  if (targets.length === 0) {
    resultsContainer.innerHTML = '<div class="empty-state">Выберите хотя бы одну валюту</div>';
    return;
  }

  const html = targets
    .filter(code => code !== from)
    .map(code => {
      const converted = convert(amount, from, code);
      const info = CURRENCIES[code];
      return `
        <div class="result-item" data-currency="${code}">
          <div class="result-currency">
            <span class="result-symbol">${info.symbol}</span>
            <span class="result-code">${code}</span>
          </div>
          <div class="result-value">${formatNumber(converted)}</div>
        </div>
      `;
    })
    .join('');

  if (!html) {
    resultsContainer.innerHTML = '<div class="empty-state">Это та же валюта — выберите другую для сравнения</div>';
  } else {
    resultsContainer.innerHTML = html;
  }
}

function updateLastUpdateDisplay() {
  if (!lastUpdate) {
    lastUpdateSpan.textContent = '—';
    return;
  }
  const date = new Date(lastUpdate);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const timeStr = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
  if (isToday) {
    lastUpdateSpan.textContent = `Сегодня ${timeStr}`;
  } else {
    const dateStr = date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit'
    });
    lastUpdateSpan.textContent = `${dateStr} ${timeStr}`;
  }
}

// ═══════════════════════════════════════════════
// СТАТУС-СООБЩЕНИЯ
// ═══════════════════════════════════════════════
let statusTimer = null;

function showStatus(message, type = '') {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message show ' + type;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusMessage.className = 'status-message ' + type;
  }, 3000);
}

// ═══════════════════════════════════════════════
// ОБРАБОТЧИКИ СОБЫТИЙ
// ═══════════════════════════════════════════════
amountInput.addEventListener('input', renderResults);
fromCurrencySelect.addEventListener('change', renderResults);
chipCheckboxes.forEach(cb => cb.addEventListener('change', renderResults));

refreshBtn.addEventListener('click', () => {
  fetchRates();
});

// ═══════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════
async function init() {
  // Регистрация Service Worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
      console.log('Service Worker зарегистрирован');
    } catch (e) {
      console.warn('Ошибка регистрации SW:', e);
    }
  }

  // Загружаем кэш
  const cached = loadFromCache();
  if (cached) {
    rates = cached.data.rates;
    lastUpdate = cached.data.timestamp;
    updateLastUpdateDisplay();
    renderResults();
    // Если кэш свежий — не делаем сетевой запрос
    if (cached.isFresh) {
      console.log('Используется свежий кэш, обновление не требуется');
      return;
    }
    console.log('Кэш устарел, обновляем курсы…');
  }

  // Загружаем актуальные курсы
  await fetchRates();
}

// Запуск
init();