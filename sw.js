/**
 * Service Worker for Margins PWA
 * Provides offline capability and caching strategies
 */

const CACHE_NAME = 'readlater-v1';
const STATIC_CACHE = 'readlater-static-v1';
const DYNAMIC_CACHE = 'readlater-dynamic-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
    '/readitlater/',
    '/readitlater/index.html',
    '/readitlater/style.css',
    '/readitlater/reader.css',
    '/readitlater/app.js',
    '/readitlater/reader.js',
    '/readitlater/content-fetcher.js',
    '/readitlater/firebase-config.js',
    '/readitlater/manifest.json'
];

// External resources to cache
const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch((error) => {
                console.error('[SW] Failed to cache static assets:', error);
            })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            return name.startsWith('readlater-') &&
                                name !== STATIC_CACHE &&
                                name !== DYNAMIC_CACHE;
                        })
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip Firebase and external API requests (let them go to network)
    if (url.hostname.includes('firebase') ||
        url.hostname.includes('googleapis.com') && !url.pathname.includes('css')) {
        return;
    }

    // For HTML pages - network first, then cache
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // For static assets - cache first, then network
    if (isStaticAsset(url)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // For images - cache with network fallback
    if (request.destination === 'image') {
        event.respondWith(cacheFirstWithRefresh(request));
        return;
    }

    // Default - network first with cache fallback
    event.respondWith(networkFirst(request));
});

// Check if URL is a static asset
function isStaticAsset(url) {
    const staticExtensions = ['.css', '.js', '.woff', '.woff2', '.ttf', '.png', '.jpg', '.svg', '.ico'];
    return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

// Cache first strategy
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed for:', request.url);
        return new Response('Offline', { status: 503 });
    }
}

// Network first strategy
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache for:', request.url);
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Return cached index.html for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/readitlater/index.html');
        }

        return new Response('Offline', { status: 503 });
    }
}

// Cache first with background refresh
async function cacheFirstWithRefresh(request) {
    const cachedResponse = await caches.match(request);

    // Start network fetch in background
    const networkFetch = fetch(request).then(async (response) => {
        if (response.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => null);

    // Return cached version immediately if available
    if (cachedResponse) {
        return cachedResponse;
    }

    // Wait for network if no cache
    const networkResponse = await networkFetch;
    return networkResponse || new Response('', { status: 503 });
}

// Handle background sync for offline saves
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync triggered:', event.tag);

    if (event.tag === 'sync-articles') {
        event.waitUntil(syncPendingArticles());
    }
});

// Sync pending articles when back online
async function syncPendingArticles() {
    try {
        // Get pending articles from IndexedDB
        const pendingArticles = await getPendingArticles();

        for (const article of pendingArticles) {
            // Notify the main page to sync this article
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'SYNC_ARTICLE',
                    article: article
                });
            });
        }
    } catch (error) {
        console.error('[SW] Sync failed:', error);
    }
}

// Placeholder for IndexedDB operations
async function getPendingArticles() {
    // This would be implemented with IndexedDB
    return [];
}

// Listen for messages from the main page
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);

    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data.type === 'CACHE_ARTICLE') {
        // Cache article content for offline reading
        cacheArticleContent(event.data.article);
    }
});

// Cache article content for offline reading
async function cacheArticleContent(article) {
    if (!article || !article.content) return;

    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        const response = new Response(JSON.stringify(article), {
            headers: { 'Content-Type': 'application/json' }
        });
        await cache.put(`/readitlater/article/${article.id}`, response);
        console.log('[SW] Cached article:', article.id);
    } catch (error) {
        console.error('[SW] Failed to cache article:', error);
    }
}
