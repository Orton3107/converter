'use strict';

// ═══════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════
const CACHE_VERSION = 'converter-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Файлы, которые кэшируем для оффлайн-работы
const APP_SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// URL API для кэширования
const API_URL_PATTERN = 'https://open.er-api.com/v6/latest/USD';

// ═══════════════════════════════════════════════
// УСТАНОВКА — кэшируем app shell
// ═══════════════════════════════════════════════
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => {
        // Кэшируем по одному, чтобы один сломанный файл не ломал всю установку
        return Promise.allSettled(
          APP_SHELL_FILES.map((file) =>
            cache.add(file).catch((err) => {
              console.warn(`SW: не удалось закэшировать ${file}:`, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ═══════════════════════════════════════════════
// АКТИВАЦИЯ — удаляем старые кэши
// ═══════════════════════════════════════════════
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => {
              console.log('SW: удаляем старый кэш:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ═══════════════════════════════════════════════
// ЗАПРОСЫ — стратегия кэширования
// ═══════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Только GET-запросы
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ── API запросы: stale-while-revalidate ──
  if (url.href.includes('open.er-api.com')) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // ── Навигация (HTML): cache-first с fallback ──
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html')
        .then((cached) => cached || fetch(request))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // ── Остальные запросы: cache-first ──
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // Кэшируем только корректные ответы
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Офлайн и нет в кэше — ничего не поделаешь
          console.warn('SW: ресурс недоступен офлайн:', request.url);
        });
    })
  );
});

// ═══════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════
// Stale-while-revalidate: отдаём кэш, параллельно обновляем
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => {
      // Нет сети — просто вернём кэш ниже
      return null;
    });

  // Возвращаем кэш сразу, если есть; иначе ждём сеть
  return cachedResponse || fetchPromise;
}

// ── Обработка сообщений от клиента ──
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});