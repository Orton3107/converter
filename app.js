'use strict';

// ═══════════════════════════════════════════════
// КОНФИГУРАЦИЯ SUPABASE
// Для фронтенда ключи обычно встраиваются напрямую, так как .env не работает в браузере.
// В продакшене эти значения могут быть захардкожены или загружены из другого безопасного источника.
const SUPABASE_URL = 'https://knnthxhaqwfkfedfgcgk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtubnRoeGhhcXdma2ZlZGZnY2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNDU4MTcsImV4cCI6MjA5ODgyMTgxN30.RZ8v2S3frO9vTu0bXUp9cRTPbaZijivcwfwK0284eJM';

const CURRENCIES = {
  UAH: { symbol: '₴', name: 'Гривна' },
  MDL: { symbol: 'L', name: 'Молдавский лей' },
  EUR: { symbol: '€', name: 'Евро' },
  USD: { symbol: '$', name: 'Доллар' }
};

// Инициализация Supabase клиента
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// КОНФИГУРАЦИЯ ДЛЯ ЛОКАЛЬНОГО КЭШИРОВАНИЯ (уменьшаем TTL для более частых проверок)
const CACHE_KEY = 'converter_rates_cache';
const CACHE_TTL = 1 * 60 * 1000; // 1 минута в миллисекундах (будет часто обновляться из Supabase)

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

function saveToCache(ratesData, updateTime, source = 'open.er-api.com') {
  try {
    const payload = {
      rates: ratesData,
      timestamp: updateTime,
      source: source
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Ошибка записи кэша:', e);
  }
}

// ═══════════════════════════════════════════════
// ПОЛУЧЕНИЕ КУРСОВ ИЗ SUPABASE
// ═══════════════════════════════════════════════
async function fetchRates() {
  refreshBtn.classList.add('loading');
  try {
    // 1. Пробуем загрузить из Supabase
    console.log('Попытка загрузки курсов из Supabase...');
    const { data: supabaseData, error: supabaseError } = await supabase
      .from('currency_rates')
      .select('*');

    if (supabaseError) {
      console.error('Ошибка Supabase:', supabaseError);
      throw new Error(`Ошибка Supabase: ${supabaseError.message}`);
    }

    console.log('Данные из Supabase получены:', supabaseData);

    if (supabaseData && supabaseData.length > 0) {
      // Преобразуем данные из Supabase в формат { USD: X, EUR: Y, ... }
      const ratesFromDb = {};
      let updateTime = null;

      supabaseData.forEach(rate => {
        const parsedRate = parseFloat(rate.rate_to_usd);
        if (isNaN(parsedRate)) {
          console.warn(`Некорректный курс для ${rate.currency_code}: ${rate.rate_to_usd}`);
          return; // Пропускаем эту запись
        }
        ratesFromDb[rate.currency_code] = parsedRate;
        // Обновляем время последнего обновления (берем самое свежее)
        if (!updateTime || new Date(rate.last_updated) > new Date(updateTime)) {
          updateTime = new Date(rate.last_updated).getTime();
        }
      });

      console.log('Сформированный ratesFromDb:', ratesFromDb);
      console.log('Время последнего обновления из БД:', updateTime ? new Date(updateTime).toISOString() : 'null');

      // Если есть данные, сохраняем их
      if (Object.keys(ratesFromDb).length > 0) {
        rates = ratesFromDb;
        lastUpdate = updateTime || Date.now();
        saveToCache(ratesFromDb, lastUpdate, 'supabase'); // Сохраняем в кэш, указывая источник
        updateLastUpdateDisplay();
        showStatus('Курсы обновлены из Supabase', 'success');
        return; // Успешно загрузили из Supabase, выходим
      } else {
        console.warn('Нет валидных данных в ответе Supabase.');
      }
    } else {
      console.log('Данные в Supabase отсутствуют или массив пуст.');
    }

    // 2. Если данные в Supabase отсутствуют или пустые, пробуем кэш
    console.log('Попытка загрузки из кэша...');
    const cached = loadFromCache();
    if (cached && cached.data.rates) {
      console.log('Данные из кэша загружены:', cached.data.rates);
      rates = cached.data.rates;
      lastUpdate = cached.data.timestamp;
      updateLastUpdateDisplay();
      showStatus('Данные в Supabase отсутствуют, используются кэшированные курсы', 'warning');
      return;
    } else {
      console.log('Кэш пуст или недоступен.');
    }

    // 3. Если и кэш пуст, можно попробовать загрузить из внешнего API как запасной вариант
    // (или просто показать ошибку, если это не предусмотрено логикой приложения)
    console.warn('Данные в Supabase и кэше отсутствуют. Попытка загрузки из внешнего API.');
    // Здесь можно добавить логику fallback к fetch(API_URL) если необходимо
    throw new Error('Данные о курсах валют недоступны. Попробуйте обновить позже.');

  } catch (error) {
    console.error('Ошибка загрузки курсов:', error);
    // В случае любой ошибки пробуем использовать кэш, даже если он устарел
    const cached = loadFromCache();
    if (cached && cached.data.rates) {
      rates = cached.data.rates;
      lastUpdate = cached.data.timestamp;
      updateLastUpdateDisplay();
      showStatus(`Ошибка сети: ${error.message}. Используются кэшированные курсы.`, 'error');
    } else {
      showStatus(`Не удалось загрузить курсы: ${error.message}. Проверьте интернет.`, 'error');
    }
  } finally {
    refreshBtn.classList.remove('loading');
    console.log('Вызов renderResults. Текущие rates:', rates);
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