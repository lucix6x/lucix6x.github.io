const CACHE_VERSION = 'v1.1.0';
const CACHE_NAME = `finances-${CACHE_VERSION}`;
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Instalar o Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Tenta cachear os arquivos, mas não falha se algum não existir
      return Promise.allSettled(
        URLS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`Não foi possível cachear ${url}:`, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Ativar o Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estratégia: Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Ignorar requisições que não sejam GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Ignorar requisições para Firebase e APIs externas
  const url = new URL(event.request.url);
  if (
    url.hostname !== self.location.hostname &&
    !url.pathname.startsWith('/icon') &&
    !url.pathname.includes('fonts.googleapis') &&
    !url.pathname.includes('tailwindcss') &&
    !url.pathname.includes('cdnjs') &&
    !url.pathname.includes('firebasejs')
  ) {
    return;
  }

  event.respondWith(
    // Tentar a rede primeiro
    fetch(event.request)
      .then((response) => {
        // Se conseguir, cachear para offline
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Se falhar, usar o cache
        return caches.match(event.request).then((response) => {
          return response || caches.match('/index.html');
        });
      })
  );
});

// Sincronização em background (quando a conexão voltar)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(
      // Enviar dados pendentes para o servidor
      (async () => {
        try {
          const db = await indexedDB.open('pfc');
          // Sincronizar dados com Firebase aqui se necessário
          console.log('Dados sincronizados em background');
        } catch (error) {
          console.error('Erro ao sincronizar:', error);
        }
      })()
    );
  }
});

// Notificações push
self.addEventListener('push', (event) => {
  let data = {
    title: 'Finanças a Dois',
    body: 'Você tem uma atualização pendente',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag || 'notification',
      requireInteraction: false,
    })
  );
});

// Clique em notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já existe uma aba aberta, foca nela
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // Caso contrário, abre uma nova aba
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
