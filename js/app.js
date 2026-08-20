// ── HEARD — Haupt-App (index.html) ──

import {
  auth, db,
  loginWithGoogle, loginWithMicrosoft, logout, onAuthChange,
  onArtistsChange, onRatingsChange, onUsersChange, onFestivalsChange,
  saveRating, ratingId, saveOfflineAuthHash, saveOfflineAuthDismissed, saveActiveFestival, saveFestival
} from './firebase.js';

import {
  cacheArtists, getCachedArtists,
  cacheRatings, getCachedRatings,
  cacheUsers, getCachedUsers,
  cacheFestivals, getCachedFestivals,
  addPendingRating, syncPendingToFirebase,
  isOnline, onOnline, onOffline
} from './sync.js';

import {
  setupPassphrase, verifyPassphrase,
  hasOfflineHash, hasCachedUser, getCachedUser, cacheUserForOffline,
  generatePassphraseSuggestion, importOfflineHash,
  hasDismissedPassphrasePrompt, dismissPassphrasePrompt, importDismissed,
  ensureUserProfileOffline
} from './offline-auth.js';

import { getLang, setLang, t, randomQuote as i18nRandomQuote, applyTranslations, setupLangToggle } from './i18n.js';
import { forceUpdate } from './sw-register.js';

// ── Konstante ──

const APP_VERSION = self.APP_VERSION;

const FESTIVAL_STAGE_LABELS = {
  'modem-2026': { hive: 'The Hive', swamp: 'The Swamp', seed: 'The Seed' }
};

const FESTIVAL_TEMPLATES = [
  { name: 'MODEM Festival',       location: 'Kroatien',    stages: ['hive','swamp','seed'] },
  { name: 'Nation of Gondwana',   location: 'Deutschland', stages: ['main','forest','ambient'] },
  { name: 'Ozora',                location: 'Ungarn',      stages: ['main','pumpui','dao'] },
  { name: 'Fusion',               location: 'Deutschland', stages: ['main','coa','turbine'] },
  { name: 'Bucht der Träumer',    location: 'Deutschland', stages: ['main','forest'] },
  { name: 'Drops',                location: 'Deutschland', stages: ['main'] },
  { name: 'Master of Puppets',    location: 'Deutschland', stages: ['main','second'] },
  { name: 'MOYN Festival',        location: 'Deutschland', stages: ['main','forest','silent'] },
  { name: 'Manuell eingeben',     location: '',            stages: [] },
];

// ── 80er-Zitate (via i18n) ──

function randomQuote(key) {
  return i18nRandomQuote(key);
}

// ── State ──

let state = {
  user:             null,
  userProfile:      null,
  artists:          [],
  ratings:          [],
  users:            [],
  festivals:        [],
  activeFestivalId: 'modem-2026',
  filterStage:      'all',
  filterStatus:     'all',
  searchQuery:      '',
  sortBy:           'name-asc',
  openArtist:       null,
  unsubscribers:    []
};

// ── Filter-State Persistenz ──

const FILTER_STORAGE_KEY = 'heard_filter_state';

function saveFilterState() {
  localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
    filterStage:  state.filterStage,
    filterStatus: state.filterStatus,
    searchQuery:  state.searchQuery,
    sortBy:       state.sortBy,
  }));
}

function loadFilterState() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || 'null');
    if (saved) {
      if (saved.filterStage)  state.filterStage  = saved.filterStage;
      if (saved.filterStatus) state.filterStatus = saved.filterStatus;
      if (saved.searchQuery)  state.searchQuery  = saved.searchQuery;
      if (saved.sortBy)       state.sortBy       = saved.sortBy;
    }
  } catch {}
}

function syncFilterUI() {
  if (searchInput) searchInput.value = state.searchQuery;
  document.querySelectorAll('[data-status]').forEach(b => {
    b.classList.toggle('active', b.dataset.status === state.filterStatus);
  });
  document.querySelectorAll('[data-sort]').forEach(b => {
    b.classList.toggle('active', b.dataset.sort === state.sortBy);
  });
}

loadFilterState();

// ── DOM-Refs ──

const $ = id => document.getElementById(id);

const loginScreen        = $('login-screen');
const offlineLoginScreen = $('offline-login-screen');
const appShell           = $('app-shell');
const btnLogin           = $('btn-login');
const btnLogout          = $('btn-logout');
const navAvatar          = $('nav-avatar');
const navAvatarImg       = $('nav-avatar-img');
const offlineBanner      = $('offline-banner');
const artistList         = $('artist-list');
const searchInput        = $('search-input');
const panelBackdrop      = $('panel-backdrop');
const panel              = $('panel');

// ── Service Worker ──
// Registrierung + Update-Handling laufen in sw-register.js (auf jeder Seite eingebunden).
window.addEventListener('sw:sync-requested', syncOfflineRatings);

// ── Auth ──

btnLogin?.addEventListener('click', async () => {
  try {
    await loginWithGoogle();
  } catch (err) {
    showToast(t('toast.login_error'), 'error');
    console.error(err);
  }
});

$('btn-login-microsoft')?.addEventListener('click', async () => {
  try {
    await loginWithMicrosoft();
  } catch (err) {
    showToast(t('toast.ms_login_error'), 'error');
    console.error(err);
  }
});

btnLogout?.addEventListener('click', async () => {
  await logout();
});

navAvatar?.addEventListener('click', () => {
  openProfileModal();
});

onAuthChange(async user => {
  state.user = user;
  try {
    if (user) {
      cacheUserForOffline(user);
      // Offline-sicher: macht keinen hängenden Firestore-Roundtrip wenn wir offline
      // sind und dieses users/{uid}-Doc noch nicht lokal gecacht ist (neues Gerät,
      // geleerter Cache) — genau das hat die App vorher komplett blockiert, bevor
      // überhaupt die Passphrase-Eingabe erreicht wurde.
      state.userProfile = await ensureUserProfileOffline(user);
      state.activeFestivalId = state.userProfile?.active_festival_id || 'modem-2026';
      showApp();
      startListeners();
      await syncOfflineRatings();

      // Falls lokal kein Hash (mehr) da ist, aber schon einer in Firebase hinterlegt
      // wurde (z.B. Storage geleert, neues Gerät) — den bestehenden übernehmen statt
      // eine neue Passphrase vorzuschlagen.
      if (!hasOfflineHash() && state.userProfile?.offline_auth_hash) {
        importOfflineHash(state.userProfile.offline_auth_hash);
      }

      // Dasselbe für den Dismissed-Status: falls lokaler Storage verloren ging (z.B.
      // iOS-PWA-Eviction), aber der User den Prompt schon mal bewusst weggeklickt hat,
      // das aus Firebase übernehmen statt den Prompt erneut zu zeigen.
      if (!hasDismissedPassphrasePrompt() && state.userProfile?.offline_auth_dismissed) {
        importDismissed(true);
      }

      // Passphrase-Setup nach kurzem Delay vorschlagen — aber nur wenn wirklich noch
      // keine eingerichtet ist UND der User den Vorschlag nicht schon mal weggeklickt hat
      // (sonst würde bei jedem Login erneut eine neue Vorschlags-Passphrase auftauchen).
      if (isOnline() && !hasOfflineHash() && !hasDismissedPassphrasePrompt()) {
        setTimeout(() => showPassphraseSetup(), 1500);
      }
    } else {
      stopListeners();
      // Offline + gecachte Session vorhanden → Passphrase-Login anbieten
      if (!isOnline() && hasCachedUser() && hasOfflineHash()) {
        showOfflineLogin();
      } else if (!isOnline() && hasCachedUser()) {
        // Kein Hash eingerichtet — gecachte Daten laden aber Hinweis zeigen
        loadOfflineWithoutAuth();
      } else {
        showLogin();
      }
    }
  } catch (err) {
    // Sicherheitsnetz: irgendein unerwarteter Fehler im Login-Flow darf die App nie
    // wieder komplett hängen lassen — offline notfalls ohne Auth weiterladen, online
    // wenigstens den Login-Screen zeigen statt eines leeren/eingefrorenen Bildschirms.
    console.error('[app] onAuthChange Fehler:', err);
    if (!isOnline() && hasCachedUser()) {
      loadOfflineWithoutAuth();
    } else {
      showLogin();
    }
  }
});

function showLogin() {
  loginScreen.style.display = 'flex';
  offlineLoginScreen.style.display = 'none';
  appShell.classList.remove('visible');
}

// Nav-Avatar mit Initialen-Fallback: ohne photoURL (z.B. Microsoft-Login liefert oft
// keins) oder wenn das Foto-URL 404ed, zeigte <img src=""> vorher das kaputte-Bild-Icon.
function setNavAvatar(user) {
  if (!navAvatarImg) return;
  let fallback = document.getElementById('nav-avatar-fallback');
  if (!fallback) {
    fallback = document.createElement('div');
    fallback.id = 'nav-avatar-fallback';
    fallback.className = 'nav-avatar-fallback';
    navAvatarImg.insertAdjacentElement('afterend', fallback);
  }
  fallback.textContent = getInitials(user?.displayName);

  const showFallback = () => { navAvatarImg.style.display = 'none'; fallback.style.display = 'flex'; };
  const showImg      = () => { navAvatarImg.style.display = '';     fallback.style.display = 'none'; };

  if (user?.photoURL) {
    navAvatarImg.onerror = showFallback;
    navAvatarImg.src = user.photoURL;
    showImg();
  } else {
    navAvatarImg.removeAttribute('src');
    showFallback();
  }
}

function showApp() {
  loginScreen.style.display = 'none';
  offlineLoginScreen.style.display = 'none';
  appShell.classList.add('visible');

  if (state.user) {
    setNavAvatar(state.user);
    const adminLink = $('nav-admin');
    if (adminLink && state.userProfile?.role === 'admin') {
      adminLink.style.display = '';
    }
  }

  document.title = `HEARD ${APP_VERSION} — Artists`;
  const versionEl = $('app-version');
  if (versionEl) versionEl.textContent = APP_VERSION;
  syncFilterUI();
}

// ── Offline Login ──

function showOfflineLogin() {
  const cached = getCachedUser();
  loginScreen.style.display = 'none';
  offlineLoginScreen.style.display = 'flex';
  appShell.classList.remove('visible');

  if (cached?.displayName) {
    const greeting = $('offline-user-greeting');
    if (greeting) greeting.textContent = `Hey ${cached.displayName.split(' ')[0]}. ${t('offline.greeting')}`;
  }
}

// Offline ohne eingerichtete Passphrase — Daten trotzdem laden
function loadOfflineWithoutAuth() {
  const cached = getCachedUser();
  if (!cached) { showLogin(); return; }

  // Synthetisches User-Objekt aus Cache
  state.user = { uid: cached.uid, displayName: cached.displayName, email: cached.email, photoURL: cached.photoURL };
  state.artists   = getCachedArtists().filter(a => a.festival_id === state.activeFestivalId);
  state.ratings   = getCachedRatings().filter(r => r.festival_id === state.activeFestivalId);
  state.users     = getCachedUsers();
  state.festivals = getCachedFestivals();
  showApp();
  render();
  openArtistFromDeepLink();
  updateNavFestival();
  renderStagePills();
  showToast(t('offline.banner'), 'error');
}

$('btn-offline-login')?.addEventListener('click', async () => {
  const input = $('offline-passphrase-input');
  const errorEl = $('offline-login-error');
  const passphrase = input?.value || '';

  if (!passphrase) return;

  const ok = await verifyPassphrase(passphrase);
  if (ok) {
    const cached = getCachedUser();
    state.user = { uid: cached.uid, displayName: cached.displayName, email: cached.email, photoURL: cached.photoURL };
    state.artists   = getCachedArtists().filter(a => a.festival_id === state.activeFestivalId);
    state.ratings   = getCachedRatings().filter(r => r.festival_id === state.activeFestivalId);
    state.users     = getCachedUsers();
    state.festivals = getCachedFestivals();
    showApp();
    render();
    openArtistFromDeepLink();
    updateNavFestival();
    renderStagePills();
    showToast(randomQuote('offlineLoginSuccess'), 'success');
  } else {
    if (errorEl) errorEl.style.display = '';
    input?.select();
  }
});

$('offline-passphrase-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-offline-login')?.click();
});

// ── Passphrase Setup ──

const passphraseBackdrop = $('passphrase-backdrop');
const passphrasePanel    = $('passphrase-panel');

function openPassphrasePanel() {
  passphraseBackdrop?.classList.add('open');
  passphrasePanel?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePassphrasePanel() {
  passphraseBackdrop?.classList.remove('open');
  passphrasePanel?.classList.remove('open');
  document.body.style.overflow = '';
}

function syncDismissedToFirestore() {
  if (isOnline() && state.user) {
    saveOfflineAuthDismissed(state.user.uid, true)
      .catch(e => console.warn('[offline-auth] Dismissed-Status nicht in Firebase gespeichert:', e));
  }
}

passphraseBackdrop?.addEventListener('click', () => {
  dismissPassphrasePrompt();
  syncDismissedToFirestore();
  closePassphrasePanel();
});

function showPassphraseSetup() {
  const suggestion = generatePassphraseSuggestion(
    state.user?.displayName,
    state.artists,
    state.ratings,
    state.user?.uid
  );

  $('passphrase-content').innerHTML = `
    <div class="panel-header">
      <div class="panel-artist-name" style="font-size:1.1rem">${t('passphrase.title')}</div>
    </div>
    <div class="passphrase-setup-hint">
      ${t('passphrase.hint')}<br>
      <strong>${t('passphrase.write_down')}</strong>
    </div>
    <div>
      <div class="passphrase-suggestion-label">${t('passphrase.suggestion_label')}</div>
      <div class="passphrase-suggestion-box" id="passphrase-suggestion">${escHtml(suggestion)}</div>
    </div>
    <div class="passphrase-divider">${t('passphrase.divider')}</div>
    <div style="display:flex;flex-direction:column;gap:0.75rem">
      <input type="text" id="passphrase-input-1" class="passphrase-input" placeholder="${t('passphrase.input_1')}" value="">
      <input type="text" id="passphrase-input-2" class="passphrase-input" placeholder="${t('passphrase.input_2')}">
      <p id="passphrase-match-error" style="color:var(--danger);font-size:0.85rem;display:none">${t('passphrase.mismatch')}</p>
    </div>
    <p class="quote-hint">${escHtml(randomQuote('passphraseSetup'))}</p>
    <button class="btn-save" id="btn-save-passphrase">${t('passphrase.save')}</button>
    <button id="btn-skip-passphrase" style="color:var(--text-muted);font-size:0.85rem;background:none;padding:0.25rem">${t('passphrase.skip')}</button>
  `;

  $('passphrase-suggestion')?.addEventListener('click', () => {
    const s = $('passphrase-suggestion')?.textContent || '';
    const i1 = $('passphrase-input-1');
    const i2 = $('passphrase-input-2');
    if (i1) i1.value = s;
    if (i2) i2.value = s;

    // Vorschlag füllt nur die Felder — der Save-Klick bleibt ein bewusster zweiter
    // Schritt. Damit das nicht übersehen wird, Fokus sichtbar auf den Save-Button lenken.
    const saveBtn = $('btn-save-passphrase');
    saveBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    saveBtn?.focus();
    saveBtn?.classList.add('pulse-attention');
    setTimeout(() => saveBtn?.classList.remove('pulse-attention'), 1500);
  });

  $('btn-save-passphrase')?.addEventListener('click', async () => {
    const p1 = $('passphrase-input-1')?.value.trim();
    const p2 = $('passphrase-input-2')?.value.trim();
    const errEl = $('passphrase-match-error');

    if (!p1 || p1.length < 6) {
      showToast(t('toast.min_length'), 'error'); return;
    }
    if (p1 !== p2) {
      if (errEl) errEl.style.display = '';
      return;
    }
    if (errEl) errEl.style.display = 'none';

    const btn = $('btn-save-passphrase');
    btn.disabled = true;
    btn.textContent = t('passphrase.saving');

    const hash = await setupPassphrase(p1);

    // Hash auch in Firebase speichern (damit bei neuem Gerät wiederherstellbar)
    try {
      if (isOnline() && state.user) await saveOfflineAuthHash(state.user.uid, hash);
    } catch (e) {
      console.warn('[offline-auth] Hash nicht in Firebase gespeichert:', e);
    }

    closePassphrasePanel();
    showToast(t('toast.passphrase_saved'), 'success');
  });

  $('btn-skip-passphrase')?.addEventListener('click', () => {
    dismissPassphrasePrompt();
    syncDismissedToFirestore();
    closePassphrasePanel();
  });

  openPassphrasePanel();
}

// ── Firestore Listeners ──

function startListeners() {
  // Offline-Zweig: v.a. relevant nach einem Festival-Wechsel offline (switchFestival()
  // ruft startListeners() erneut auf) — sonst würden hier live Firestore-Listener
  // angehängt, die ohne Netz nie feuern, state.artists/ratings blieben leer und die
  // Liste zeigt für immer "keine Artists" statt der gecachten Daten. Nach festival_id
  // filtern, da der Cache immer nur den zuletzt online geladenen Stand hält — sonst
  // könnten nach einem Wechsel versehentlich Artists des VORHERIGEN Festivals auftauchen.
  if (!isOnline()) {
    state.artists   = getCachedArtists().filter(a => a.festival_id === state.activeFestivalId);
    state.ratings   = getCachedRatings().filter(r => r.festival_id === state.activeFestivalId);
    state.users     = getCachedUsers();
    state.festivals = getCachedFestivals();
    render();
    openArtistFromDeepLink();
    updateNavFestival();
    renderStagePills();
    return;
  }

  let artistsInitialLoaded = false;

  const u1 = onArtistsChange(state.activeFestivalId, artists => {
    const isUpdate = artistsInitialLoaded;
    artistsInitialLoaded = true;
    const countChanged = isUpdate && artists.length !== state.artists.length;
    state.artists = artists;
    cacheArtists(artists);
    render();
    openArtistFromDeepLink();
    if (countChanged) showToast(t('toast.lineup_updated'));
  });

  const u2 = onRatingsChange(state.activeFestivalId, ratings => {
    state.ratings = ratings;
    cacheRatings(ratings);
    render();
    if (state.openArtist) renderPanel(state.openArtist);
  });

  const u3 = onUsersChange(users => {
    state.users = users;
    cacheUsers(users);
    render();
  });

  const u4 = onFestivalsChange(festivals => {
    state.festivals = festivals;
    cacheFestivals(festivals);
    updateNavFestival();
    renderStagePills();
  });

  state.unsubscribers = [u1, u2, u3, u4];
}

function stopListeners() {
  state.unsubscribers.forEach(u => u());
  state.unsubscribers = [];
}

// ── Offline / Online ──

onOnline(() => {
  offlineBanner?.classList.remove('visible');
  syncOfflineRatings();
});

onOffline(() => {
  offlineBanner?.classList.add('visible');
});

if (!isOnline()) {
  offlineBanner?.classList.add('visible');
  state.artists   = getCachedArtists().filter(a => a.festival_id === state.activeFestivalId);
  state.ratings   = getCachedRatings().filter(r => r.festival_id === state.activeFestivalId);
  state.users     = getCachedUsers();
  state.festivals = getCachedFestivals();
  render();
  openArtistFromDeepLink();
}

async function syncOfflineRatings() {
  if (!isOnline() || !state.user) return;
  const result = await syncPendingToFirebase(data => saveRating(data));
  if (result?.synced > 0) showToast(`${result.synced} ${t('toast.synced')}`);
}

// ── Filter ──

searchInput?.addEventListener('input', e => {
  state.searchQuery = e.target.value.toLowerCase();
  saveFilterState();
  render();
});

function renderStagePills() {
  const container = $('stage-pills');
  if (!container) return;

  const festival = state.festivals.find(f => f.id === state.activeFestivalId);
  const stages   = festival?.stages || [];
  const labels   = FESTIVAL_STAGE_LABELS[state.activeFestivalId] || {};

  const stageLabel = s => labels[s] || (s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' '));

  container.innerHTML = `<button class="pill active" data-stage="all">${t('filter.all_stages')}</button>` +
    stages.map(s => `<button class="pill" data-stage="${escHtml(s)}">${escHtml(stageLabel(s))}</button>`).join('');

  container.querySelectorAll('[data-stage]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filterStage = btn.dataset.stage;
      container.querySelectorAll('[data-stage]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      saveFilterState();
      render();
    });
    if (btn.dataset.stage === state.filterStage) btn.classList.add('active');
  });
}

document.querySelectorAll('[data-status]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.filterStatus = btn.dataset.status;
    document.querySelectorAll('[data-status]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    saveFilterState();
    render();
  });
});

document.querySelector('.nav-logo')?.addEventListener('click', e => {
  e.preventDefault();
  closePanel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function updateNavFestival() {
  const btn = $('nav-festival');
  if (!btn) return;
  const f = state.festivals.find(f => f.id === state.activeFestivalId);
  if (!f) { btn.style.display = 'none'; return; }
  btn.textContent = f.name;
  btn.style.display = '';
}

async function switchFestival(festivalId) {
  if (festivalId === state.activeFestivalId) { closeFestivalPanel(); return; }
  stopListeners();
  state.activeFestivalId = festivalId;
  state.filterStage  = 'all';
  state.filterStatus = 'all';
  state.searchQuery  = '';
  state.sortBy       = 'name-asc';
  state.artists      = [];
  state.ratings      = [];
  saveFilterState();
  // saveActiveFestival() ist ein Firestore-Write — offline würde ein ungeprüftes await
  // hier für immer hängen (oder werfen und den Rest der Funktion nie erreichen), genau
  // wie der ensureUserProfile-Bug beim Login. Die Präferenz wird dann einfach erst beim
  // nächsten Online-Sein nachgetragen; der Wechsel selbst funktioniert auch ohne das.
  if (isOnline()) {
    try {
      await saveActiveFestival(state.user.uid, festivalId);
    } catch (err) {
      console.warn('[app] saveActiveFestival fehlgeschlagen, Wechsel läuft trotzdem weiter:', err);
    }
  }
  startListeners();
  render();
  closeFestivalPanel();
  const f = state.festivals.find(f => f.id === festivalId);
  showToast(`${t('toast.festival_switched')} ${f?.name || festivalId}`);
}

const festivalBackdrop = $('festival-backdrop');
const festivalPanel    = $('festival-panel');

function openFestivalPanel() {
  closeProfileModal();
  renderFestivalList();
  festivalBackdrop?.classList.add('open');
  festivalPanel?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeFestivalPanel() {
  festivalBackdrop?.classList.remove('open');
  festivalPanel?.classList.remove('open');
  document.body.style.overflow = '';
}

festivalBackdrop?.addEventListener('click', closeFestivalPanel);
$('nav-festival')?.addEventListener('click', openFestivalPanel);

function renderFestivalList() {
  $('festival-content').innerHTML = `
    <div class="panel-header" style="margin-bottom:1rem">
      <div class="panel-artist-name" style="font-size:1.1rem">${t('festival.switch_title')}</div>
    </div>
    <div class="festival-list">
      ${state.festivals.map(f => `
        <button class="festival-list-item ${f.id === state.activeFestivalId ? 'active' : ''}"
                data-fid="${escHtml(f.id)}">
          <div class="festival-list-name">${escHtml(f.name)}</div>
          <div class="festival-list-loc">${escHtml(f.location || '')}</div>
          ${f.id === state.activeFestivalId ? '<span class="festival-active-check">✓</span>' : ''}
        </button>`).join('')}
    </div>
    <button class="festival-create-btn" id="btn-festival-create">${t('festival.create_btn')}</button>
  `;

  $('festival-content').querySelectorAll('.festival-list-item').forEach(btn => {
    btn.addEventListener('click', () => switchFestival(btn.dataset.fid));
  });

  $('btn-festival-create')?.addEventListener('click', renderFestivalCreate);
}

function renderFestivalCreate() {
  const year = new Date().getFullYear();
  $('festival-content').innerHTML = `
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem">
      <button id="btn-festival-back" style="color:var(--text-muted);font-size:1.1rem;background:none;padding:0.25rem">←</button>
      <div class="panel-artist-name" style="font-size:1.1rem">${t('festival.new_title')}</div>
    </div>
    <div class="input-group">
      <label>${t('festival.template')}</label>
      <select id="festival-template-select" class="select-input">
        ${FESTIVAL_TEMPLATES.map((tmpl,i) => `<option value="${i}">${escHtml(tmpl.name)}</option>`).join('')}
      </select>
    </div>
    <div class="input-group">
      <label>${t('festival.name_label')}</label>
      <input type="text" id="festival-name-input" class="text-input" placeholder="${t('festival.name_placeholder')}" maxlength="60">
    </div>
    <div class="input-group">
      <label>${t('festival.location_label')}</label>
      <input type="text" id="festival-location-input" class="text-input" placeholder="${t('festival.loc_placeholder')}" maxlength="60">
    </div>
    <div class="input-group">
      <label>${t('festival.year_label')}</label>
      <input type="number" id="festival-year-input" class="text-input" value="${year}" min="2020" max="2099">
    </div>
    <button class="btn-save" id="btn-festival-save">${t('festival.create')}</button>
    <p id="festival-create-error" style="color:var(--danger);font-size:0.85rem;display:none;margin-top:0.5rem"></p>
  `;

  const templateSel  = $('festival-template-select');
  const nameInput    = $('festival-name-input');
  const locInput     = $('festival-location-input');

  const applyTemplate = () => {
    const tmpl = FESTIVAL_TEMPLATES[parseInt(templateSel.value)];
    if (tmpl.name !== 'Manuell eingeben') {
      nameInput.value = tmpl.name;
      locInput.value  = tmpl.location;
    }
  };
  templateSel?.addEventListener('change', applyTemplate);
  applyTemplate();

  $('btn-festival-back')?.addEventListener('click', renderFestivalList);

  $('btn-festival-save')?.addEventListener('click', async () => {
    const name     = nameInput?.value.trim();
    const location = locInput?.value.trim();
    const year     = parseInt($('festival-year-input')?.value) || new Date().getFullYear();
    const errEl    = $('festival-create-error');

    if (!name) {
      errEl.textContent = t('festival.name_required');
      errEl.style.display = '';
      return;
    }

    const tpl    = FESTIVAL_TEMPLATES[parseInt(templateSel.value)];
    const stages = tpl.stages.length ? tpl.stages : ['main'];
    const btn    = $('btn-festival-save');
    btn.disabled = true;
    btn.textContent = t('festival.creating');

    try {
      const festivalId = await saveFestival(null, {
        name, location, stages, year,
        created_by: state.user.uid
      });
      await switchFestival(festivalId);
    } catch (err) {
      errEl.textContent = 'Fehler: ' + err.message;
      errEl.style.display = '';
      btn.disabled = false;
      btn.textContent = t('festival.create');
    }
  });
}

document.querySelectorAll('[data-sort]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.sortBy = btn.dataset.sort;
    document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    saveFilterState();
    render();
  });
});

// ── Render ──

function getMyRating(artistId) {
  if (!state.user) return null;
  return state.ratings.find(r => r.user_id === state.user.uid && r.artist_id === artistId) || null;
}

function getArtistRatings(artistId) {
  return state.ratings.filter(r => r.artist_id === artistId);
}

function hasCrewComment(artistId) {
  return state.ratings.some(r =>
    r.artist_id === artistId && r.user_id !== state.user?.uid && r.comment?.trim()
  );
}

function filteredArtists() {
  const filtered = state.artists.filter(a => {
    if (state.filterStage !== 'all' && a.stage !== state.filterStage) return false;

    if (state.filterStatus !== 'all') {
      const r = getMyRating(a.id);
      if (state.filterStatus === 'unrated'    && r?.rating > 0)    return false;
      if (state.filterStatus === 'rated'      && !(r?.rating > 0)) return false;
      if (state.filterStatus === 'favorites'  && !r?.want_to_see)  return false;
      if (state.filterStatus === 'listened'   && !r?.listened)     return false;
      if (state.filterStatus === 'seen'       && !r?.seen)         return false;
      if (state.filterStatus === 'crew_commented' && !hasCrewComment(a.id)) return false;
    }

    if (state.searchQuery) {
      return a.name.toLowerCase().includes(state.searchQuery);
    }

    return true;
  });

  return sortArtists(filtered);
}

function sortArtists(artists) {
  const copy = [...artists];
  switch (state.sortBy) {
    case 'name-asc':    return copy.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    case 'name-desc':   return copy.sort((a, b) => b.name.localeCompare(a.name, 'de'));
    case 'rating-desc': return copy.sort((a, b) => (getMyRating(b.id)?.rating || 0) - (getMyRating(a.id)?.rating || 0));
    case 'rating-asc':  return copy.sort((a, b) => (getMyRating(a.id)?.rating || 0) - (getMyRating(b.id)?.rating || 0));
    default:            return copy;
  }
}

// Wrapper: ein Fehler in renderArtistList() darf die Liste nie stumm einfrieren lassen
// (z.B. so gewirkt hätte der Auth-Hänger aus Punkt 1: Klicks auf Filter-Pills änderten
// den State sichtbar per Klasse, aber die Liste darunter aktualisierte sich nie, weil
// render() irgendwo unbehandelt geworfen hat). Jetzt zumindest sichtbar statt unsichtbar.
function render() {
  try {
    renderArtistList();
  } catch (err) {
    console.error('[app] render() Fehler:', err);
    showToast(t('toast.render_error'), 'error');
  }
}

function renderArtistList() {
  const artists  = filteredArtists();
  const countEl  = document.getElementById('artist-count-text');
  if (countEl) countEl.textContent = `${artists.length} Artists`;

  if (artists.length === 0) {
    const quote = state.artists.length === 0 ? randomQuote('emptyOffline') : '';
    artistList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎵</div>
        <p>${state.artists.length === 0
          ? t('empty.no_artists_admin')
          : t('empty.no_artists_filter')}</p>
        ${quote ? `<p class="quote-hint" style="margin-top:0.5rem">${escHtml(quote)}</p>` : ''}
      </div>`;
    return;
  }

  artistList.innerHTML = artists.map(a => renderArtistCard(a)).join('');

  artistList.querySelectorAll('.artist-card').forEach(card => {
    card.addEventListener('click', () => openPanel(card.dataset.id));
  });
}

function renderArtistCard(artist) {
  const r          = getMyRating(artist.id);
  const rating     = r?.rating || 0;
  const listened   = r?.listened || false;
  const favorite   = r?.want_to_see || false;
  const stageLabel = stageDisplayName(artist.stage);

  const othersRatings = state.ratings.filter(
    rt => rt.artist_id === artist.id &&
          rt.user_id   !== state.user?.uid &&
          (rt.rating > 0 || rt.want_to_see)
  );

  const chipsHtml = othersRatings.length > 0
    ? `<div class="card-chips">
        <span class="card-chips-label">Crew</span>
        ${othersRatings.map(rt => {
          const u     = state.users.find(u => u.uid === rt.user_id);
          const name  = u?.display_name || '?';
          const photo = u?.photo_url || '';
          const ini   = getInitials(name);
          return `<div class="card-chip" title="${escHtml(name)}">
            ${photo
              ? `<img src="${escHtml(photo)}" alt="">`
              : `<span class="chip-initials">${escHtml(ini)}</span>`}
            ${rt.rating > 0  ? `<span class="chip-stars">${rt.rating}★</span>` : ''}
            ${rt.want_to_see ? `<span class="chip-fav">♥</span>`               : ''}
          </div>`;
        }).join('')}
      </div>`
    : '';

  const ownComment = r?.comment?.trim() || '';
  let commentHtml = '';
  if (ownComment) {
    commentHtml = `<div class="card-comment own">${escHtml(ownComment)}</div>`;
  } else {
    const crewWithComment = othersRatings.find(rt => rt.comment?.trim());
    if (crewWithComment) {
      const u    = state.users.find(u => u.uid === crewWithComment.user_id);
      const name = u?.display_name?.split(' ')[0] || '?';
      commentHtml = `<div class="card-comment">${escHtml(name)}: ${escHtml(crewWithComment.comment.trim())}</div>`;
    }
  }

  return `
    <div class="artist-card" data-id="${artist.id}">
      <div class="artist-name">${escHtml(artist.name)}</div>
      <div class="artist-meta">
        <span class="stage-badge ${artist.stage}">${stageLabel}</span>
        <span class="listened-dot ${listened ? '' : 'hidden'}"></span>
      </div>
      ${commentHtml}
      <div class="card-right">
        <div class="stars-mini">${renderStarsMini(rating)}</div>
        <span class="favorite-icon ${favorite ? 'visible' : ''}">♥</span>
      </div>
      ${chipsHtml}
    </div>`;
}

function renderStarsMini(rating) {
  return [1,2,3,4,5].map(i =>
    `<span class="star ${i <= rating ? 'filled' : ''}">★</span>`
  ).join('');
}

// ── Panel ──

function openPanel(artistId) {
  const artist = state.artists.find(a => a.id === artistId);
  if (!artist) return;
  state.openArtist = artist;
  renderPanel(artist);
  panelBackdrop.classList.add('open');
  panel.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// ── Deep-Link: ?artist=<id> (z.B. Klick auf einen Artist im Timetable) ──

let deepLinkHandled = false;

function openArtistFromDeepLink() {
  if (deepLinkHandled) return;
  deepLinkHandled = true;
  const artistId = new URLSearchParams(location.search).get('artist');
  if (!artistId) return;
  openPanel(artistId);
  const url = new URL(location.href);
  url.searchParams.delete('artist');
  history.replaceState({}, '', url);
}

function closePanel() {
  panelBackdrop.classList.remove('open');
  panel.classList.remove('open');
  document.body.style.overflow = '';
  state.openArtist = null;
}

panelBackdrop?.addEventListener('click', closePanel);

function renderPanel(artist) {
  const myRating        = getMyRating(artist.id);
  const crewRatings     = getArtistRatings(artist.id).filter(r => r.user_id !== state.user?.uid);
  const currentRating   = myRating?.rating    || 0;
  const currentListened = myRating?.listened  || false;
  const currentFavorite = myRating?.want_to_see || false;
  const currentComment  = myRating?.comment   || '';
  const currentSeen     = myRating?.seen      || false;
  const currentPostRating  = myRating?.post_rating  || 0;
  const currentPostComment = myRating?.post_comment || '';

  const commentPlaceholder = randomQuote('commentPlaceholders');

  const scBtn = artist.soundcloud_url
    ? `<a href="${escHtml(artist.soundcloud_url)}" target="_blank" rel="noopener" class="btn-soundcloud">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.175 12.225c-.015.128-.026.257-.026.389 0 .132.011.261.026.389-.015-.128-.026-.257-.026-.389 0-.132.011-.261.026-.389zm.93-2.02a2.94 2.94 0 0 0-.385.026 4.394 4.394 0 0 1 3.863-2.308c.18 0 .357.012.531.033a6.44 6.44 0 0 1 5.15-2.582 6.44 6.44 0 0 1 6.44 6.44c0 .09-.002.18-.006.27H18a2 2 0 0 1 0 4H3.105a2.94 2.94 0 0 1 0-5.879z"/></svg>
        ${t('panel.soundcloud')}
       </a>`
    : `<span style="color:var(--text-muted);font-size:0.85rem">${t('panel.no_soundcloud')}</span>`;

  const crewHtml = crewRatings.length > 0
    ? crewRatings.map(r => {
        const u        = state.users.find(u => u.uid === r.user_id);
        const name     = u?.display_name?.split(' ')[0] || '?';
        const photoUrl = u?.photo_url || '';
        return `
          <div class="crew-rating-row">
            <div class="crew-avatar">${photoUrl ? `<img src="${escHtml(photoUrl)}" alt="">` : name[0]}</div>
            <span class="crew-name">${escHtml(name)}</span>
            <div class="crew-stars">${renderStarsMini(r.rating || 0)}</div>
            ${r.comment    ? `<span class="crew-comment">${escHtml(r.comment)}</span>` : ''}
            ${r.want_to_see ? '<span style="color:var(--seed)">♥</span>' : ''}
          </div>`;
      }).join('')
    : `<p style="color:var(--text-muted);font-size:0.85rem">${t('panel.no_crew_ratings')}</p>`;

  document.getElementById('panel-content').innerHTML = `
    <div class="panel-header">
      <div class="panel-artist-name">${escHtml(artist.name)}</div>
      <div class="panel-artist-meta">
        <span class="stage-badge ${artist.stage}">${stageDisplayName(artist.stage)}</span>
        ${artist.day ? `<span style="color:var(--text-muted);font-size:0.8rem">${artist.day}</span>` : ''}
      </div>
    </div>

    <div>${scBtn}</div>

    <div class="rating-section">
      <label>${t('panel.my_rating')}</label>
      <div class="stars-input" id="stars-input">
        ${[1,2,3,4,5].map(i =>
          `<button class="star-btn ${i <= currentRating ? 'filled' : ''}" data-star="${i}" aria-label="${i} star${i>1?'s':''}">★</button>`
        ).join('')}
      </div>
    </div>

    <div class="toggle-section">
      <div class="toggle-context-label">${t('panel.before_festival')}</div>
      <div class="toggle-row">
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-listened" ${currentListened ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-label">${t('panel.listened')}</span>
      </div>
      <div class="toggle-row">
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-favorite" ${currentFavorite ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-label">${t('panel.favorite')}</span>
      </div>
    </div>

    <div class="toggle-section on-festival">
      <div class="toggle-context-label festival">${t('panel.on_festival')}</div>
      <div class="toggle-row">
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-seen" ${currentSeen ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-label">${t('panel.seen')}</span>
      </div>
    </div>

    <div class="rating-section after-festival" id="after-festival-section" style="display:${currentSeen ? '' : 'none'}">
      <div class="toggle-context-label festival">${t('panel.after_festival')}</div>
      <label>${t('panel.post_rating')}</label>
      <div class="stars-input" id="post-stars-input">
        ${[1,2,3,4,5].map(i =>
          `<button class="star-btn ${i <= currentPostRating ? 'filled' : ''}" data-star="${i}" aria-label="${i} star${i>1?'s':''}">★</button>`
        ).join('')}
      </div>
      <label>${t('panel.post_comment')}</label>
      <textarea class="comment-textarea" id="post-comment-input" placeholder="${escHtml(commentPlaceholder)}">${escHtml(currentPostComment)}</textarea>
    </div>

    <div class="comment-section">
      <label>${t('panel.comment')}</label>
      <textarea class="comment-textarea" id="comment-input" placeholder="${escHtml(commentPlaceholder)}">${escHtml(currentComment)}</textarea>
    </div>

    <button class="btn-save" id="btn-save">${t('panel.save')}</button>

    <div>
      <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:0.75rem">${t('panel.crew')}</div>
      <div class="crew-ratings">${crewHtml}</div>
    </div>
  `;

  // Sterne-Reihe an einen Container gebunden statt global auf alle .star-btn im Panel
  // zu lauschen — mit einer zweiten Reihe (Nachbewertung) würden sich sonst Klicks in
  // beiden Reihen gegenseitig überschreiben (der Index lief vorher über ALLE Buttons).
  function wireStars(containerId, initial) {
    let selected = initial;
    const container = document.getElementById(containerId);
    if (!container) return { get: () => selected };
    container.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.star);
        selected = selected === val ? 0 : val;
        container.querySelectorAll('.star-btn').forEach((b, idx) => {
          b.classList.toggle('filled', idx < selected);
        });
      });
    });
    return { get: () => selected };
  }

  const ratingStars     = wireStars('stars-input', currentRating);
  const postRatingStars = wireStars('post-stars-input', currentPostRating);

  // "Nach dem Festival"-Block live ein-/ausblenden, sobald "Gesehen" angehakt wird —
  // ohne dafür erst speichern + neu öffnen zu müssen.
  document.getElementById('toggle-seen')?.addEventListener('change', e => {
    const section = document.getElementById('after-festival-section');
    if (section) section.style.display = e.target.checked ? '' : 'none';
  });

  document.getElementById('btn-save')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    btn.textContent = t('panel.saving');

    const data = {
      userId:       state.user.uid,
      artistId:     artist.id,
      festivalId:   state.activeFestivalId,
      rating:       ratingStars.get(),
      comment:      document.getElementById('comment-input')?.value || '',
      listened:     document.getElementById('toggle-listened')?.checked || false,
      want_to_see:  document.getElementById('toggle-favorite')?.checked || false,
      seen:         document.getElementById('toggle-seen')?.checked || false,
      post_rating:  postRatingStars.get(),
      post_comment: document.getElementById('post-comment-input')?.value || ''
    };

    try {
      if (isOnline()) {
        await saveRating(data);
      } else {
        addPendingRating(data);
        const cached = getCachedRatings();
        const id     = ratingId(data.userId, data.artistId);
        const idx    = cached.findIndex(r => r.id === id);
        const entry  = { id, user_id: data.userId, artist_id: data.artistId, festival_id: data.festivalId, rating: data.rating, comment: data.comment, listened: data.listened, want_to_see: data.want_to_see, seen: data.seen ?? false, post_rating: data.post_rating ?? 0, post_comment: data.post_comment ?? '' };
        if (idx >= 0) cached[idx] = entry; else cached.push(entry);
        state.ratings = cached;
        cacheRatings(cached);
        showToast(t('toast.offline_saved'), 'success');
      }

      btn.textContent = t('panel.saved');
      btn.classList.add('saved');

      // 80er-Quote als Toast je nach Rating
      if (data.rating === 5) showToast(randomQuote('fiveStars'));
      if (data.rating === 1) showToast(randomQuote('oneStar'));

      render();
      setTimeout(closePanel, 800);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'Speichern';
      showToast(t('toast.save_error'), 'error');
    }
  });
}

// ── Toast ──

function showToast(msg, type = '') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  });
}

// ── Hilfsfunktionen ──

function stageDisplayName(stage) {
  const labels = FESTIVAL_STAGE_LABELS[state.activeFestivalId] || {};
  return labels[stage] || (stage.charAt(0).toUpperCase() + stage.slice(1).replace(/-/g, ' '));
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Profil-Modal ──

const profileBackdrop = $('profile-backdrop');
const profilePanel    = $('profile-panel');

function openProfileModal() {
  const user = state.user;
  if (!user) return;

  const avatarHtml = user.photoURL
    ? `<img src="${escHtml(user.photoURL)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;color:var(--text-muted)">${getInitials(user.displayName)}</div>`;

  const passphraseStatus = hasOfflineHash()
    ? `<span style="color:var(--success);font-size:0.8rem">${t('profile.passphrase_ok')}</span>`
    : `<span style="color:var(--warning);font-size:0.8rem">${t('profile.passphrase_missing')}</span>`;

  const activeFestival = state.festivals.find(f => f.id === state.activeFestivalId);

  $('profile-content').innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${avatarHtml}</div>
      <div>
        <div class="profile-name">${escHtml(user.displayName || '—')}</div>
        <div class="profile-email">${escHtml(user.email || '')}</div>
      </div>
    </div>
    <div class="profile-festival-row">
      <div>
        <div class="profile-festival-name">${escHtml(activeFestival?.name || state.activeFestivalId)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">${escHtml(activeFestival?.location || '')}</div>
      </div>
      <button id="btn-switch-festival" style="color:var(--accent-light);font-size:0.85rem;background:none;padding:0.25rem 0.5rem;flex-shrink:0">${t('profile.switch')}</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
      ${passphraseStatus}
      <button id="btn-change-passphrase" style="color:var(--accent-light);font-size:0.85rem;background:none;padding:0.25rem 0.5rem">
        ${hasOfflineHash() ? t('profile.passphrase_change') : t('profile.passphrase_setup')}
      </button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 0;border-bottom:1px solid var(--border);font-size:0.8rem;color:var(--text-muted)">
      <span>${t('profile.app_version')} ${APP_VERSION}</span>
      <button id="btn-force-update" style="color:var(--accent-light);font-size:0.8rem;background:none;padding:0.25rem 0.5rem">${t('profile.force_update')}</button>
    </div>
    <button class="btn-logout-modal" id="btn-logout-modal">${t('profile.logout')}</button>
  `;

  $('btn-switch-festival')?.addEventListener('click', openFestivalPanel);

  $('btn-change-passphrase')?.addEventListener('click', () => {
    closeProfileModal();
    setTimeout(() => showPassphraseSetup(), 200);
  });

  $('btn-force-update')?.addEventListener('click', () => {
    // Garantierter Reset — siehe sw-register.js:forceUpdate(). Kein Bestätigungsdialog
    // nötig, das Schlimmste was passiert ist ein Reload; Ratings/Offline-Queue liegen in
    // localStorage und sind davon nicht betroffen (nur Firestore-/Datei-Caches werden geleert).
    forceUpdate();
  });

  $('btn-logout-modal')?.addEventListener('click', async () => {
    closeProfileModal();
    await logout();
  });

  profileBackdrop?.classList.add('open');
  profilePanel?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProfileModal() {
  profileBackdrop?.classList.remove('open');
  profilePanel?.classList.remove('open');
  document.body.style.overflow = '';
}

profileBackdrop?.addEventListener('click', closeProfileModal);

// ── Init ──

applyTranslations();
setupLangToggle();
render();
