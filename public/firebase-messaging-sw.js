/* eslint-disable no-undef */

// Generic Web Push service worker.
// Kept at /firebase-messaging-sw.js because the app already registers this path.

self.addEventListener('install', () => {
  // Ensure updates apply quickly (avoid stale cached branding/strings).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});


self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = null;
  try {
    payload = event.data.json();
  } catch {
    payload = { body: event.data.text() };
  }

  // If this is an FCM payload, let Firebase's SW handle it (avoid duplicates).
  if (payload && payload.data && (payload.data.FCM_MSG || payload.data.fcmMessageId)) {
    return;
  }

  const title = (payload && (payload.title || payload.notification?.title)) || 'Nova atividade';
  const body = (payload && (payload.body || payload.notification?.body)) || '';
  const data = (payload && payload.data) ? payload.data : {};

  const options = {
    body,
    icon: 'https://i.postimg.cc/nrCMQ8mx/logo-calendario.jpg',
    badge: 'https://i.postimg.cc/nrCMQ8mx/logo-calendario.jpg',
    data
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow('/');
  })());
});


