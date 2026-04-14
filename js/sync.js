// ── HEARD — Offline Sync & localStorage Cache ──
// Puffert Ratings wenn offline und synchronisiert bei nächster Verbindung.

const KEYS = {
  ARTISTS:   'heard_artists',
  RATINGS:   'heard_ratings',
  USERS:     'heard_users',
  FESTIVAL:  'heard_festival',
  PENDING:   'heard_pending_ratings',
  SYNCED_AT: 'heard_synced_at'
};

// ── Lokaler Cache ──

export function cacheArtists(artists) {
  localStorage.setItem(KEYS.ARTISTS, JSON.stringify(artists));
}

export function getCachedArtists() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.ARTISTS) || '[]');
  } catch { return []; }
}

export function cacheRatings(ratings) {
  localStorage.setItem(KEYS.RATINGS, JSON.stringify(ratings));
  localStorage.setItem(KEYS.SYNCED_AT, new Date().toISOString());
}

export function getCachedRatings() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.RATINGS) || '[]');
  } catch { return []; }
}

export function cacheUsers(users) {
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
}

export function getCachedUsers() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
  } catch { return []; }
}

export function cacheFestival(festival) {
  localStorage.setItem(KEYS.FESTIVAL, JSON.stringify(festival));
}

export function getCachedFestival() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.FESTIVAL) || 'null');
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
