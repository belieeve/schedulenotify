// AI Secretary - Service Worker
// Handles: caching for offline, periodic notification checks

const CACHE_NAME = 'ai-secretary-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/manifest.json',
];

// ===== Install =====
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// ===== Activate =====
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();

    // Start periodic notification check
    startNotificationCheck();
});

// ===== Fetch (Network first, fallback to cache) =====
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone and cache successful responses
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache
                return caches.match(event.request).then((cached) => {
                    return cached || new Response('Offline', { status: 503 });
                });
            })
    );
});

// ===== Message from client =====
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SCHEDULE_NOTIFICATIONS') {
        const events = event.data.events || [];
        scheduleNotifications(events);
    }

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// ===== Notification Click =====
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clients) => {
            // Focus existing window or open new one
            for (const client of clients) {
                if (client.url.includes('/') && 'focus' in client) {
                    return client.focus();
                }
            }
            return self.clients.openWindow('/');
        })
    );
});

// ===== Notification Scheduling =====
let scheduledTimeouts = [];

function scheduleNotifications(events) {
    // Clear existing timeouts
    scheduledTimeouts.forEach((t) => clearTimeout(t));
    scheduledTimeouts = [];

    const now = Date.now();
    const REMINDER_MINUTES = 10; // Notify 10 min before

    events.forEach((event) => {
        const eventTime = new Date(event.date).getTime();
        const notifyTime = eventTime - REMINDER_MINUTES * 60 * 1000;
        const delay = notifyTime - now;

        // Schedule if within next 24 hours and in the future
        if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
            const timeout = setTimeout(() => {
                const eventDate = new Date(event.date);
                const timeStr = eventDate.toLocaleTimeString('ja-JP', {
                    hour: '2-digit',
                    minute: '2-digit',
                });

                self.registration.showNotification('📅 まもなく予定があります', {
                    body: `${timeStr} ${event.title}${event.description ? '\n' + event.description : ''}`,
                    icon: '/icons/icon-192.png',
                    badge: '/icons/icon-192.png',
                    tag: `event-${event.id}`,
                    renotify: true,
                    requireInteraction: true,
                    data: { eventId: event.id },
                });
            }, delay);

            scheduledTimeouts.push(timeout);
        }

        // Also notify at the event time
        const delayExact = eventTime - now;
        if (delayExact > 0 && delayExact < 24 * 60 * 60 * 1000) {
            const timeout = setTimeout(() => {
                const eventDate = new Date(event.date);
                const timeStr = eventDate.toLocaleTimeString('ja-JP', {
                    hour: '2-digit',
                    minute: '2-digit',
                });

                self.registration.showNotification('⏰ 予定の時間です！', {
                    body: `${event.title}${event.description ? '\n' + event.description : ''}`,
                    icon: '/icons/icon-192.png',
                    badge: '/icons/icon-192.png',
                    tag: `event-now-${event.id}`,
                    renotify: true,
                    requireInteraction: true,
                    data: { eventId: event.id },
                });
            }, delayExact);

            scheduledTimeouts.push(timeout);
        }
    });

    console.log(`[SW] Scheduled ${scheduledTimeouts.length} notifications`);
}

// ===== Periodic check (every 30 min) =====
let checkInterval = null;

function startNotificationCheck() {
    if (checkInterval) clearInterval(checkInterval);
    checkInterval = setInterval(() => {
        // Request events from client
        self.clients.matchAll({ type: 'window' }).then((clients) => {
            clients.forEach((client) => {
                client.postMessage({ type: 'REQUEST_EVENTS' });
            });
        });
    }, 30 * 60 * 1000); // Every 30 minutes
}
