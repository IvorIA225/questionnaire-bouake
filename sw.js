/*
 * -------------------------------------------------------------
 * ENQUÊTES DE TERRAIN - BOUAKÉ
 * SERVICE WORKER FOR OFFLINE-FIRST PWA CACHING
 * -------------------------------------------------------------
 */

const CACHE_NAME = "enquetes-bouake-cache-v1";
const ASSETS_TO_CACHE = [
    "./",
    "./index.html",
    "./app.css",
    "./app.js",
    "./manifest.json"
];

// Install Service Worker and cache all vital assets
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log("Caching essential offline assets...");
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Activate and remove old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log("Clearing old PWA cache:", cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Intercept requests and serve from Cache first (Offline-First strategy)
self.addEventListener("fetch", (event) => {
    // Only intercept local/same-origin GET requests
    if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse; // Return cache match
            }
            
            // Fallback to network
            return fetch(event.request).then((networkResponse) => {
                // If valid response, cache a copy for future offline access
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Offline fallback (e.g. if requesting a page not cached)
                console.log("Failed to fetch asset while offline:", event.request.url);
            });
        })
    );
});
