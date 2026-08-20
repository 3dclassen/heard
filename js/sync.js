// ── HEARD — Offline Sync & localStorage Cache ──
// Puffert Ratings wenn offline und synchronisiert bei nächster Verbindung.

const KEYS = {
  ARTISTS:   'heard_artists',
  RATINGS:   'heard_ratings',
  USERS:     'heard_users',
  FESTIVAL:  'heard_festival',
  CREW:      'heard_crew',
  PENDING:   'heard_pending_ratings',
  SYNCED_AT: 'heard_synced_at'
};

// ── Lokaler Cache ──
//
// Artists/Ratings sind PRO FESTIVAL gecacht (Key-Suffix festivalId) — nicht mehr ein
// einzelner globaler Slot. Sonst überschreibt jeder Festival-Wechsel (auch online!)
// den Cache des vorherigen Festivals, und offline zu einem Festival zu wechseln, das
// man vorher schon verlassen hat, zeigt fälschlich "keine Artists" statt der Daten
// vom letzten Online-Besuch.

function artistsKey(festivalId) { return `${KEYS.ARTISTS}_${festivalId}`; }
function ratingsKey(festivalId) { return `${KEYS.RATINGS}_${festivalId}`; }

export function cacheArtists(festivalId, artists) {
  localStorage.setItem(artistsKey(festivalId), JSON.stringify(artists));
}

export function getCachedArtists(festivalId) {
  const existing = localStorage.getItem(artistsKey(festivalId));
  if (existing != null) {
    try { return JSON.parse(existing); } catch { return []; }
  }
  return migrateLegacyCache(KEYS.ARTISTS, artistsKey(festivalId), festivalId);
}

export function cacheRatings(festivalId, ratings) {
  localStorage.setItem(ratingsKey(festivalId), JSON.stringify(ratings));
  localStorage.setItem(KEYS.SYNCED_AT, new Date().toISOString());
}

export function getCachedRatings(festivalId) {
  const existing = localStorage.getItem(ratingsKey(festivalId));
  if (existing != null) {
    try { return JSON.parse(existing); } catch { return []; }
  }
  return migrateLegacyCache(KEYS.RATINGS, ratingsKey(festivalId), festivalId);
}

// Einmalige Migration von der alten, nicht Festival-spezifischen Cache-Struktur: wenn
// unter dem neuen Key noch nichts liegt, aber die alte globale Liste zufällig zu genau
// diesem Festival gehört, in den neuen Key übernehmen statt sie beim Update zu verlieren.
function migrateLegacyCache(legacyKey, newKey, festivalId) {
  try {
    const legacy = JSON.parse(localStorage.getItem(legacyKey) || '[]');
    if (Array.isArray(legacy) && legacy.length > 0 && legacy[0]?.festival_id === festivalId) {
      localStorage.setItem(newKey, JSON.stringify(legacy));
      return legacy;
    }
  } catch { /* ignore */ }
  return [];
}

export function cacheUsers(users) {
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
}

export function getCachedUsers() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
  } catch { return []; }
}

// Cached war vorher nie tatsächlich verdrahtet (cacheFestival/getCachedFestival lagen
// hier unbenutzt) — dadurch blieb state.festivals offline immer leer und der Festival-
// Umschalter im Profil zeigte buchstäblich nichts an. Jetzt die ganze Liste cachen,
// analog zu cacheArtists/getCachedArtists.
export function cacheFestivals(festivals) {
  localStorage.setItem(KEYS.FESTIVAL, JSON.stringify(festivals));
}

export function getCachedFestivals() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.FESTIVAL) || '[]');
  } catch { return []; }
}

export function cacheCrew(crew) {
  localStorage.setItem(KEYS.CREW, JSON.stringify(crew));
}

export function getCachedCrew() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.CREW) || 'null');
  } catch { return null; }
}

export function getSyncedAt() {
  return localStorage.getItem(KEYS.SYNCED_AT);
}

// ── Pending Ratings (Offline-Queue) ──

export function addPendingRating(ratingData) {
  const pending = getPendingRatings();
  // Gleicher User+Artist → überschreiben statt doppelt
  const idx = pending.findIndex(
    r => r.userId === ratingData.userId && r.artistId === ratingData.artistId
  );
  if (idx >= 0) {
    pending[idx] = ratingData;
  } else {
    pending.push(ratingData);
  }
  localStorage.setItem(KEYS.PENDING, JSON.stringify(pending));
}

export function getPendingRatings() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.PENDING) || '[]');
  } catch { return []; }
}

export function clearPendingRatings() {
  localStorage.removeItem(KEYS.PENDING);
}

export function removePendingRating(userId, artistId) {
  const pending = getPendingRatings().filter(
    r => !(r.userId === userId && r.artistId === artistId)
  );
  localStorage.setItem(KEYS.PENDING, JSON.stringify(pending));
}

// ── Online/Offline Detection ──

export function isOnline() {
  return navigator.onLine;
}

export function onOnline(callback) {
  window.addEventListener('online', callback);
  return () => window.removeEventListener('online', callback);
}

export function onOffline(callback) {
  window.addEventListener('offline', callback);
  return () => window.removeEventListener('offline', callback);
}

// ── Sync-Orchestrierung ──
// Wird aus app.js aufgerufen wenn die App online geht

export async function syncPendingToFirebase(saveRatingFn) {
  const pending = getPendingRatings();
  if (pending.length === 0) return;

  console.log(`[sync] ${pending.length} ausstehende Ratings werden synchronisiert...`);

  const results = await Promise.allSettled(
    pending.map(r => saveRatingFn(r))
  );

  const failed = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(`[sync] Rating ${pending[i].artistId} erfolgreich synchronisiert`);
    } else {
      console.error(`[sync] Rating ${pending[i].artistId} fehlgeschlagen:`, result.reason);
      failed.push(pending[i]);
    }
  });

  // Nur fehlgeschlagene in der Queue behalten
  localStorage.setItem(KEYS.PENDING, JSON.stringify(failed));
  return { synced: pending.length - failed.length, failed: failed.length };
}
