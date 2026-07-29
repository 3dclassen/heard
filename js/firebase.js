// ── HEARD — Firebase Modul ──
// Initialisiert Firebase und exportiert alle benötigten Funktionen.
// Firebase API Key im Frontend ist OK — Sicherheit läuft über Security Rules.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
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
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDC_Lks22kSzmd8-R7XrrhWoUlMrpkxFxc",
  authDomain: "heard-lineup.firebaseapp.com",
  projectId: "heard-lineup",
  storageBucket: "heard-lineup.firebasestorage.app",
  messagingSenderId: "91207051146",
  appId: "1:91207051146:web:58d353bfa6ced848d98a73",
  measurementId: "G-V9BZ8HM4RX",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Offline-Persistenz aktivieren (IndexedDB Cache für Firestore)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn(
      "Firestore-Persistenz: Mehrere Tabs offen — nur ein Tab kann offline cachen.",
    );
  } else if (err.code === "unimplemented") {
    console.warn("Firestore-Persistenz: Browser nicht unterstützt.");
  }
});

// ── Auth ──

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

const microsoftProvider = new OAuthProvider("microsoft.com");
microsoftProvider.setCustomParameters({ prompt: "select_account" });

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
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      display_name: user.displayName || "Unbekannt",
      email: user.email,
      photo_url: user.photoURL || "",
      role: "viewer",
      created_at: serverTimestamp(),
    });
  }
  return (await getDoc(ref)).data();
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function onUsersChange(callback) {
  return onSnapshot(
    collection(db, "users"),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) =>
      console.error("[firebase] onUsersChange Fehler:", err.code, err.message),
  );
}

// ── Artists ──

export function onArtistsChange(festivalId, callback) {
  // Kein orderBy — würde einen zusammengesetzten Firestore-Index erfordern.
  // Sortierung läuft client-seitig in app.js (sortArtists).
  const q = query(
    collection(db, "artists"),
    where("festival_id", "==", festivalId),
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) =>
      console.error(
        "[firebase] onArtistsChange Fehler:",
        err.code,
        err.message,
      ),
  );
}

export async function addArtist(data) {
  const ref = doc(collection(db, "artists"));
  await setDoc(ref, { ...data, created_at: serverTimestamp() });
  return ref.id;
}

export async function updateArtist(id, data) {
  await updateDoc(doc(db, "artists", id), data);
}

export async function deleteArtist(id) {
  await deleteDoc(doc(db, "artists", id));
}

export async function importArtists(artists) {
  const batch = writeBatch(db);
  artists.forEach((artist) => {
    const ref = doc(collection(db, "artists"));
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
  const q = query(
    collection(db, "ratings"),
    where("festival_id", "==", festivalId),
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) =>
      console.error(
        "[firebase] onRatingsChange Fehler:",
        err.code,
        err.message,
      ),
  );
}

export async function saveRating({
  userId,
  artistId,
  festivalId,
  rating,
  comment,
  listened,
  want_to_see,
  seen,
}) {
  const id = ratingId(userId, artistId);
  const ref = doc(db, "ratings", id);
  await setDoc(ref, {
    user_id: userId,
    artist_id: artistId,
    festival_id: festivalId,
    rating: rating ?? 0,
    comment: comment ?? "",
    listened: listened ?? false,
    want_to_see: want_to_see ?? false,
    seen: seen ?? false,
    updated_at: serverTimestamp(),
  });
}

// ── Festivals ──

export async function getFestival(id) {
  const snap = await getDoc(doc(db, "festivals", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveFestival(id, data) {
  const ref = id ? doc(db, "festivals", id) : doc(collection(db, "festivals"));
  await setDoc(
    ref,
    { ...data, created_at: serverTimestamp() },
    { merge: true },
  );
  return ref.id;
}

export function onFestivalsChange(callback) {
  return onSnapshot(collection(db, "festivals"), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function setUserRole(uid, role) {
  await updateDoc(doc(db, "users", uid), { role });
}

export async function saveOfflineAuthHash(uid, hash) {
  await updateDoc(doc(db, "users", uid), { offline_auth_hash: hash });
}

export async function saveActiveFestival(uid, festivalId) {
  await updateDoc(doc(db, "users", uid), { active_festival_id: festivalId });
}

export async function saveActiveCrew(uid, crewId) {
  await updateDoc(doc(db, "users", uid), { active_crew_id: crewId });
}

// ── Crew (crew_connections + crew_invites) ──
// Datenmodell:
//   crew_invites/{CODE}  → creator_uid, persistent, used, created_at
//   crew_connections/{id} → members[], name?, created_by?, created_at

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function getOrCreateMyInviteCode(uid) {
  const q = query(
    collection(db, "crew_invites"),
    where("creator_uid", "==", uid),
    where("persistent", "==", true),
  );
  const snap = await getDocs(q);
  if (!snap.empty) return snap.docs[0].id;
  const code = generateCode();
  await setDoc(doc(db, "crew_invites", code), {
    creator_uid: uid,
    persistent: true,
    used: false,
    created_at: serverTimestamp(),
  });
  return code;
}

export function onCrewChange(uid, callback) {
  const q = query(
    collection(db, "crew_connections"),
    where("members", "array-contains", uid),
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null,
      ),
    (err) => console.error("[firebase] onCrewChange:", err.code),
  );
}

export async function createCrew(uid, name) {
  const existing = await getDocs(
    query(
      collection(db, "crew_connections"),
      where("members", "array-contains", uid),
    ),
  );
  if (!existing.empty) throw new Error("ALREADY_IN_CREW");
  const ref = doc(collection(db, "crew_connections"));
  await setDoc(ref, {
    name: name.trim(),
    members: [uid],
    created_by: uid,
    created_at: serverTimestamp(),
  });
  await getOrCreateMyInviteCode(uid);
  return ref.id;
}

export async function joinCrewByCode(code, uid) {
  const normalized = code.trim().toUpperCase();
  const inviteRef = doc(db, "crew_invites", normalized);
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) throw new Error("CODE_NOT_FOUND");
  const invite = inviteSnap.data();
  if (invite.creator_uid === uid) throw new Error("CODE_OWN");
  if (invite.used && !invite.persistent) throw new Error("CODE_USED");
  const existingSnap = await getDocs(
    query(
      collection(db, "crew_connections"),
      where("members", "array-contains", uid),
    ),
  );
  if (!existingSnap.empty) throw new Error("ALREADY_IN_CREW");
  const creatorSnap = await getDocs(
    query(
      collection(db, "crew_connections"),
      where("members", "array-contains", invite.creator_uid),
    ),
  );
  if (creatorSnap.empty) {
    const newRef = doc(collection(db, "crew_connections"));
    await setDoc(newRef, {
      members: [invite.creator_uid, uid],
      created_by: invite.creator_uid,
      created_at: serverTimestamp(),
    });
  } else {
    const crewDoc = creatorSnap.docs[0];
    const members = crewDoc.data().members || [];
    if (members.includes(uid)) throw new Error("ALREADY_MEMBER");
    await updateDoc(crewDoc.ref, { members: [...members, uid] });
  }
  if (!invite.persistent) await updateDoc(inviteRef, { used: true });
}

export async function leaveCrew(crewId, uid) {
  const ref = doc(db, "crew_connections", crewId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const newMembers = data.members.filter((m) => m !== uid);
  if (newMembers.length === 0) {
    await deleteDoc(ref);
  } else {
    const update = { members: newMembers };
    if (data.created_by === uid) update.created_by = newMembers[0];
    await updateDoc(ref, update);
  }
}

export async function saveCrewName(crewId, name) {
  await updateDoc(doc(db, "crew_connections", crewId), { name: name.trim() });
}

export function onAllCrewsChange(callback) {
  return onSnapshot(
    collection(db, "crew_connections"),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.warn("[firebase] onAllCrewsChange:", err.code);
      callback([]);
    },
  );
}

// Re-exports für direkten Import in anderen Modulen
export {
  serverTimestamp,
  doc,
  collection,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
};
