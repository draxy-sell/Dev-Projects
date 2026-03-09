// ═══════════════════════════════════════════════
// SERVICE WORKER — ProjectPro
// draxy-sell/Dev-Projects
// ═══════════════════════════════════════════════

const SW_VERSION = 'projectpro-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// ── Réception d'un message depuis l'app ──
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SAVE_DATA') {
    // Sauvegarder les données dans le SW pour les notifs offline
    saveToCache(e.data.payload);
  }
  if (e.data && e.data.type === 'CHECK_NOW') {
    checkAndNotify();
  }
});

// ── Sauvegarde dans le cache SW ──
async function saveToCache(data) {
  const cache = await caches.open(SW_VERSION);
  const response = new Response(JSON.stringify(data));
  await cache.put('/projectpro-data', response);
}

async function loadFromCache() {
  try {
    const cache = await caches.open(SW_VERSION);
    const response = await cache.match('/projectpro-data');
    if (!response) return null;
    return await response.json();
  } catch(e) {
    return null;
  }
}

// ── Vérification et envoi des notifs ──
async function checkAndNotify() {
  const data = await loadFromCache();
  if (!data) return;

  const { projects = [], tasks = [], reminders = [], fired = [] } = data;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const heure = now.getHours();
  const minutes = now.getMinutes();
  const newFired = [...fired];

  function daysLeft(d) {
    if (!d) return null;
    return Math.ceil((new Date(d + 'T00:00:00') - now) / 86400000);
  }

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function getProject(id) {
    return projects.find(p => p.id === id) || null;
  }

  function getProjectProgress(pid) {
    const pt = tasks.filter(t => t.project === pid);
    if (!pt.length) return 0;
    return Math.round(pt.filter(t => t.status === 'Terminé').length / pt.length * 100);
  }

  // ── 1. RAPPELS MANUELS (fenêtre ±2 min) ──
  for (const r of reminders.filter(r => !r.done)) {
    const dt = new Date(r.date + 'T' + r.time);
    const diffMin = (dt - now) / 60000;
    const key = `rem_${r.id}_${r.date}_${r.time}`;

    if (diffMin >= -2 && diffMin <= 2 && !newFired.includes(key)) {
      newFired.push(key);
      const proj = getProject(r.project);
      const body = (proj ? `📁 ${proj.nom}\n` : '') + (r.desc || '');
      const ico = r.type ? r.type.split(' ')[0] : '🔔';

      await self.registration.showNotification(`${ico} ${r.title}`, {
        body: body.trim() || 'Rappel ProjectPro',
        icon: '/Dev-Projects/icon-192.png',
        badge: '/Dev-Projects/icon-192.png',
        tag: key,
        requireInteraction: true,
        data: { url: 'https://draxy-sell.github.io/Dev-Projects/Projet%20Pro.html' }
      });
    }
  }

  // ── 2. DEADLINES QUOTIDIENNES À 9H ──
  if (heure === 9 && minutes <= 2) {

    // PROJETS
    for (const p of projects.filter(p => p.status !== 'Terminé' && p.status !== 'Annulé' && p.end)) {
      const dl = daysLeft(p.end);
      if (dl === null || dl < 0 || dl > 14) continue;
      const key = `proj_${p.id}_${today}`;
      if (newFired.includes(key)) continue;
      newFired.push(key);

      const prog = getProjectProgress(p.id);
      const urgence = dl === 0 ? '🔴 AUJOURD\'HUI' : dl <= 3 ? `🔴 J-${dl}` : dl <= 7 ? `🟡 J-${dl}` : `🟠 J-${dl}`;

      await self.registration.showNotification(`${urgence} — ${p.nom}`, {
        body: `Avancement : ${prog}% · Échéance : ${fmtDate(p.end)}`,
        icon: '/Dev-Projects/icon-192.png',
        badge: '/Dev-Projects/icon-192.png',
        tag: key,
        requireInteraction: true,
        data: { url: 'https://draxy-sell.github.io/Dev-Projects/Projet%20Pro.html' }
      });
    }

    // TÂCHES
    for (const t of tasks.filter(t => t.status !== 'Terminé' && t.due)) {
      const dl = daysLeft(t.due);
      if (dl === null || dl < 0 || dl > 14) continue;
      const key = `task_${t.id}_${today}`;
      if (newFired.includes(key)) continue;
      newFired.push(key);

      const proj = getProject(t.project);
      const urgence = dl === 0 ? '🔴 AUJOURD\'HUI' : dl <= 3 ? `🔴 J-${dl}` : dl <= 7 ? `🟡 J-${dl}` : `🟠 J-${dl}`;

      await self.registration.showNotification(`${urgence} — Tâche : ${t.title}`, {
        body: (proj ? `📁 ${proj.nom} · ` : '') + `Priorité : ${t.prio} · ${fmtDate(t.due)}`,
        icon: '/Dev-Projects/icon-192.png',
        badge: '/Dev-Projects/icon-192.png',
        tag: key,
        requireInteraction: false,
        data: { url: 'https://draxy-sell.github.io/Dev-Projects/Projet%20Pro.html' }
      });
    }
  }

  // Sauvegarder les nouvelles clés fired (garder les 300 dernières)
  data.fired = newFired.slice(-300);
  await saveToCache(data);
}

// ── Clic sur une notification → ouvre l'app ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url)
    || 'https://draxy-sell.github.io/Dev-Projects/Projet%20Pro.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── Vérification périodique via Background Sync (si supporté) ──
self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-deadlines') {
    e.waitUntil(checkAndNotify());
  }
});

// ── Fallback : push event ──
self.addEventListener('push', e => {
  e.waitUntil(checkAndNotify());
});
