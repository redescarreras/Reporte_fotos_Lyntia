// Service Worker for Photo Report App
const CACHE_NAME = 'photo-report-v1';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                './',
                './index.html',
                './css/style.css',
                './js/app.js',
                './libs/jspdf.umd.min.js',
                './libs/compressor.min.js',
                './assets/logo-elecnor.png',
                './assets/logo-lyntia.png',
                './assets/logo-redes.png'
            ]);
        })
    );
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});
