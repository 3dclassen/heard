// ── HEARD — Firebase Modul ──
// Initialisiert Firebase und exportiert alle benötigten Funktionen.
// Firebase API Key im Frontend ist OK — Sicherheit läuft über Security Rules.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch,
  enableIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig = {
  apiKey:            'AIzaSyDC_Lks22kSzmd8-R7XrrhWoUlMrpkxFxc',
  authDomain:        'heard-lineup.firebaseapp.com',
  projectId:         'heard-lineup',
  storageBucket:     'heard-lineup.firebasestorage.app',
  messagingSenderId: '91207051146',
  appId:             '1:91207051146:web:58d353bfa6ced848d98a73',
  measurementId:     'G-V9BZ8HM4RX'
};

const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// Offline-Persistenz aktivieren (IndexedDB Cache für Firestore)
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore-Persistenz: Mehrere Tabs offen — nur ein Tab kann offline cachen.');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore-Persistenz: Browser nicht unterstützt.');
  }
});

// ── Auth ──

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

const microsoftProvider = new OAuthProvider('microsoft.com');
microsoftProvider.setCustomParameters({ prompt: 'select_account' });

export function loginWithMicrosoft() {
  return signInWithPopup(auth, microsoftProvider);
}

export function logout() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── User-Profil ──

export async function ensureUserProfile(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid:          user.uid,
      display_name: user.displayName || 'Unbekannt',
      email:        user.email,
      photo_url:    user.photoURL || '',
      role:         'viewer',
      created_at:   serverTimestamp()
    });
  }
  return (await getDoc(ref)).data();
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function onUsersChange(callback) {
  return onSnapshot(collection(db, 'users'),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error('[firebase] onUsersChange Fehler:', err.code, err.message)
  );
}

// ── Artists ──

export function onArtistsChange(festivalId, callback) {
  // Kein orderBy — würde einen zusammengesetzten Firestore-Index erfordern.
  // Sortierung läuft client-seitig in app.js (sortArtists).
  const q = query(
    collection(db, 'artists'),
    where('festival_id', '==', festivalId)
  );
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error('[firebase] onArtistsChange Fehler:', err.code, err.message)
  );
}

export async function addArtist(data) {
  const ref = doc(collection(db, 'artists'));
  await setDoc(ref, { ...data, created_at: serverTimestamp() });
  return ref.id;
}

export async function updateArtist(id, data) {
  await updateDoc(doc(db, 'artists', id), data);
}

export async function deleteArtist(id) {
  await deleteDoc(doc(db, 'artists', id));
}

export async function importArtists(artists) {
  const batch = writeBatch(db);
  artists.forEach(artist => {
    const ref = doc(collection(db, 'artists'));
    batch.set(ref, { ...artist, created_at: serverTimestamp() });
  });
  await batch.commit();
}

// ── Ratings ──
// Dokument-ID: {userId}_{artistId} — deterministisch, kein Query nötig

export function ratingId(userId, artistId) {
  return `${userId}_${artistId}`;
}

export function onRatingsChange(festivalId, callback) {
  const q = query(collection(db, 'ratings'), where('festival_id', '==', festivalId));
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error('[firebase] onRatingsChange Fehler:', err.code, err.message)
  );
}

export async function saveRating({ userId, artistId, festivalId, rating, comment, listened, want_to_see, seen }) {
  const id  = ratingId(userId, artistId);
  const ref = doc(db, 'ratings', id);
  await setDoc(ref, {
    user_id:    userId,
    artist_id:  artistId,
    festival_id: festivalId,
    rating:     rating ?? 0,
    comment:    comment ?? '',
    listened:   listened ?? false,
    want_to_see: want_to_see ?? false,
    seen:       seen ?? false,
    updated_at: serverTimestamp()
  });
}

// ── Festivals ──

export async function getFestival(id) {
  const snap = await getDoc(doc(db, 'festivals', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveFestival(id, data) {
  const ref = id ? doc(db, 'festivals', id) : doc(collection(db, 'festivals'));
  await setDoc(ref, { ...data, created_at: serverTimestamp() }, { merge: true });
  return ref.id;
}

export function onFestivalsChange(callback) {
  return onSnapshot(collection(db, 'festivals'), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function setUserRole(uid, role) {
  await updateDoc(doc(db, 'users', uid), { role });
}

export async function saveOfflineAuthHash(uid, hash) {
  await updateDoc(doc(db, 'users', uid), { offline_auth_hash: hash });
}

export async function saveCrewName(uid, name) {
  await updateDoc(doc(db, 'users', uid), { crew_name: name.trim() });
}

// Gibt den persistenten Einladungs-Code des Users zurück (erstellt ihn wenn nötig).
// Dieser Code bleibt dauerhaft gültig und kann beliebig oft weitergegeben werden.
export async function getOrCreatePersistentCode(uid) {
  const userRef  = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.data();

  if (userData?.invite_code) {
    // Sicherstellen dass das crew_invites-Dokument noch vorhanden ist
    const inviteSnap = await getDoc(doc(db, 'crew_invites', userData.invite_code));
    if (inviteSnap.exists()) return userData.invite_code;
  }

  const code = generateCode();
  await setDoc(doc(db, 'crew_invites', code), {
    creator_uid: uid,
    created_at:  serverTimestamp(),
    used:        false,
    persistent:  true
  });
  await updateDoc(userRef, { invite_code: code });
  return code;
}

// ── Crew ──

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // keine mehrdeutigen Zeichen (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createInviteCode(uid) {
  const code = generateCode();
  await setDoc(doc(db, 'crew_invites', code), {
    creator_uid: uid,
    created_at:  serverTimestamp(),
    used:        false
  });
  return code;
}

export async function acceptInviteCode(code, uid) {
  const normalized = code.trim().toUpperCase();
  const inviteRef  = doc(db, 'crew_invites', normalized);
  const snap       = await getDoc(inviteRef);

  if (!snap.exists())             throw new Error('CODE_NOT_FOUND');
  const invite = snap.data();
  if (invite.creator_uid === uid) throw new Error('CODE_OWN');
  if (!invite.persistent && invite.used) throw new Error('CODE_USED');

  // Bereits verbunden?
  const q        = query(collection(db, 'crew_connections'), where('members', 'array-contains', uid));
  const existing = await getDocs(q);
  if (existing.docs.some(d => d.data().members.includes(invite.creator_uid))) {
    throw new Error('ALREADY_CONNECTED');
  }

  await setDoc(doc(collection(db, 'crew_connections')), {
    members:    [invite.creator_uid, uid],
    created_at: serverTimestamp()
  });
  // Persistente Codes bleiben aktiv — Einmal-Codes werden als verwendet markiert
  if (!invite.persistent) await updateDoc(inviteRef, { used: true });
  return invite.creator_uid;
}

export function onCrewChange(uid, callback) {
  const q = query(collection(db, 'crew_connections'), where('members', 'array-contains', uid));
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error('[firebase] onCrewChange Fehler:', err.code, err.message)
  );
}

// Re-exports für direkten Import in anderen Modulen
export { serverTimestamp, doc, collection, getDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where };
