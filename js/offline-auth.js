// ── HEARD — Offline-Auth (Passphrase) ──

const LS_HASH      = 'heard_offline_hash';
const LS_USER      = 'heard_user_cache';
const LS_DISMISSED = 'heard_passphrase_prompt_dismissed';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function setupPassphrase(passphrase) {
  const hash = await sha256(passphrase.trim());
  localStorage.setItem(LS_HASH, hash);
  return hash;
}

export async function verifyPassphrase(passphrase) {
  const stored = localStorage.getItem(LS_HASH);
  if (!stored) return false;
  const hash = await sha256(passphrase.trim());
  return hash === stored;
}

export function hasOfflineHash() {
  return !!localStorage.getItem(LS_HASH);
}

// Bereits in Firebase gespeicherten Hash lokal übernehmen (z.B. nach Storage-Verlust
// oder auf einem neuen Gerät) — verhindert, dass erneut eine neue Passphrase
// vorgeschlagen wird, obwohl der User schon eine eingerichtet hat.
export function importOfflineHash(hash) {
  if (!hash) return;
  localStorage.setItem(LS_HASH, hash);
}

// Merkt sich, dass der User den Setup-Vorschlag bewusst weggeklickt hat, damit er
// nicht bei jedem Login erneut mit einer neuen Vorschlags-Passphrase auftaucht.
// Über "Profil → Passphrase einrichten" bleibt das Setup jederzeit manuell erreichbar.
export function hasDismissedPassphrasePrompt() {
  return !!localStorage.getItem(LS_DISMISSED);
}

export function dismissPassphrasePrompt() {
  localStorage.setItem(LS_DISMISSED, '1');
}

// Bereits in Firebase hinterlegten Dismissed-Status lokal übernehmen (z.B. nach
// Storage-Verlust oder auf einem neuen Gerät) — analog zu importOfflineHash().
export function importDismissed(flag) {
  if (flag) localStorage.setItem(LS_DISMISSED, '1');
}

export function hasCachedUser() {
  return !!localStorage.getItem(LS_USER);
}

export function getCachedUser() {
  try { return JSON.parse(localStorage.getItem(LS_USER) || 'null'); }
  catch { return null; }
}

export function cacheUserForOffline(user) {
  localStorage.setItem(LS_USER, JSON.stringify({
    uid:         user.uid,
    displayName: user.displayName || '',
    email:       user.email       || '',
    photoURL:    user.photoURL    || ''
  }));
}

export function generatePassphraseSuggestion(userName, artists, ratings, userId) {
  const firstName = (userName || 'Du').split(' ')[0];
  const favorites = ratings
    .filter(r => r.user_id === userId && r.want_to_see)
    .map(r => artists.find(a => a.id === r.artist_id)?.name)
    .filter(Boolean);

  if (favorites.length >= 1) {
    const pick = favorites[Math.floor(Math.random() * favorites.length)];
    const opts = [
      `${firstName} will ${pick} unbedingt live sehen`,
      `${pick} auf dem Swamp um 4 Uhr morgens`,
      `${firstName} und ${pick} — das wird legendär`,
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  const fallback = [
    `${firstName} tanzt bis der Arzt kommt`,
    `Das Line-Up dieses Jahr ist der Hammer`,
    `${firstName} kommt entspannt vom Festival zurück`,
  ];
  return fallback[Math.floor(Math.random() * fallback.length)];
}
