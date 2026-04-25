// ── HEARD — Haupt-App (index.html) ──

import {
  auth, db,
  loginWithGoogle, loginWithMicrosoft, logout, onAuthChange, ensureUserProfile,
  onArtistsChange, onRatingsChange, onUsersChange, onFestivalsChange,
  saveRating, ratingId, saveOfflineAuthHash, saveActiveFestival, saveFestival
} from './firebase.js';

import {
  cacheArtists, getCachedArtists,
  cacheRatings, getCachedRatings,
  cacheUsers, getCachedUsers,
  addPendingRating, syncPendingToFirebase,
  isOnline, onOnline, onOffline
} from './sync.js';

import {
  setupPassphrase, verifyPassphrase,
  hasOfflineHash, hasCachedUser, getCachedUser, cacheUserForOffline,
  generatePassphraseSuggestion
} from './offline-auth.js';

// ── Konstante ──

const APP_VERSION = '0.10';

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
  { name: 'Manuell eingeben',     location: '',            stages: [] },
];

// ── 80er-Zitate ──

const QUOTES = {
  fiveStars: [
    "Ich liebe es wenn ein Plan funktioniert.",       // Hannibal — A-Team
    "Das war kein Zufall — das war Talent.",          // MacGyver
    "Schön. Sehr schön sogar.",                       // Derrick
  ],
  oneStar: [
    "Wissen Sie, ich hab heute schon 4 Touchdowns gemacht.",  // Al Bundy
    "Ich hab Schlimmeres überlebt, Murdock.",                 // A-Team
    "Ha! I kill me.",                                         // ALF
  ],
  offlineLoginSuccess: [
    "I'll be back. Aber erstmal: du bist drin.",   // Terminator
    "Turbo Boost, KITT. Wir fahren offline.",       // Knight Rider
    "Nobody puts Baby offline.",                    // Dirty Dancing
  ],
  passphraseSetup: [
    "Ha! I kill me. Und meine Passphrase.",              // ALF
    "Du hast 5 Sekunden. Okay, mehr. Aber denk nach.",   // MacGyver
    "Schreib sie auf. Wirklich. Al Bundy hätte es nicht getan — und schau wie es ihm geht.",
  ],
  timetableConflict: [
    "Turbo Boost, KITT — ich brauch eine andere Route!",  // Knight Rider
    "Murdock, wir können nicht an zwei Orten gleichzeitig sein.",
    "MacGyver hätte sich das besser eingeteilt.",
  ],
  commentPlaceholders: [
    "Ha! I kill me.",
    "Was sagst du wenn du nach Hause kommst?",
    "Sag's wie Al Bundy: kurz, ehrlich, unvergesslich.",
    "Drei Worte. Oder Emojis. Oder beides.",
    "Murdock würde hier etwas Verrücktes schreiben.",
    "Was hat dein Unterbewusstsein gehört?",
    "\"Ich komm' wieder.\" — und wie war's?",
    "MacGyver-Analyse: Potential vorhanden?",
  ],
  emptyOffline: [
    "Ich bin nicht hier um zu verlieren.",    // Colt Sievers
    "Ohne Daten kann auch Hannibal keinen Plan machen.",
  ],
};

function randomQuote(key) {
  const arr = QUOTES[key] || [];
  return arr[Math.floor(Math.random() * arr.length)] || '';
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('[sw] registriert:', reg.scope);
      setInterval(() => reg.update(), 60_000);
    });

    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SYNC_REQUESTED') syncOfflineRatings();
      if (e.data?.type === 'SW_UPDATED')     window.location.reload();
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  });
}

// ── Auth ──

btnLogin?.addEventListener('click', async () => {
  try {
    await loginWithGoogle();
  } catch (err) {
    showToast('Login fehlgeschlagen', 'error');
    console.error(err);
  }
});

$('btn-login-microsoft')?.addEventListener('click', async () => {
  try {
    await loginWithMicrosoft();
  } catch (err) {
    showToast('Microsoft-Login fehlgeschlagen', 'error');
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
  if (user) {
    cacheUserForOffline(user);
    state.userProfile = await ensureUserProfile(user);
    state.activeFestivalId = state.userProfile?.active_festival_id || 'modem-2026';
    showApp();
    startListeners();
    await syncOfflineRatings();
    // Passphrase-Setup nach kurzem Delay vorschlagen wenn noch nicht eingerichtet
    if (!hasOfflineHash()) {
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
});

function showLogin() {
  loginScreen.style.display = 'flex';
  offlineLoginScreen.style.display = 'none';
  appShell.classList.remove('visible');
}

function showApp() {
  loginScreen.style.display = 'none';
  offlineLoginScreen.style.display = 'none';
  appShell.classList.add('visible');

  if (state.user) {
    if (navAvatarImg) navAvatarImg.src = state.user.photoURL || '';
    const adminLink = $('nav-admin');
    if (adminLink && state.userProfile?.role === 'admin') {
      adminLink.style.display = '';
    }
  }

  document.title = `HEARD ${APP_VERSION} — Artists`;
  const versionEl = $('app-version');
  if (versionEl) versionEl.textContent = APP_VERSION;
}

// ── Offline Login ──

function showOfflineLogin() {
  const cached = getCachedUser();
  loginScreen.style.display = 'none';
  offlineLoginScreen.style.display = 'flex';
  appShell.classList.remove('visible');

  if (cached?.displayName) {
    const greeting = $('offline-user-greeting');
    if (greeting) greeting.textContent = `Hey ${cached.displayName.split(' ')[0]}. Du bist offline.`;
  }
}

// Offline ohne eingerichtete Passphrase — Daten trotzdem laden
function loadOfflineWithoutAuth() {
  const cached = getCachedUser();
  if (!cached) { showLogin(); return; }

  // Synthetisches User-Objekt aus Cache
  state.user = { uid: cached.uid, displayName: cached.displayName, email: cached.email, photoURL: cached.photoURL };
  state.artists = getCachedArtists();
  state.ratings = getCachedRatings();
  state.users   = getCachedUsers();
  showApp();
  if (navAvatarImg) navAvatarImg.src = state.user.photoURL || '';
  render();
  showToast('Offline — keine Passphrase eingerichtet. Daten aus Cache geladen.', 'error');
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
    state.artists = getCachedArtists();
    state.ratings = getCachedRatings();
    state.users   = getCachedUsers();
    showApp();
    if (navAvatarImg) navAvatarImg.src = state.user.photoURL || '';
    render();
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

passphraseBackdrop?.addEventListener('click', closePassphrasePanel);

function showPassphraseSetup() {
  const suggestion = generatePassphraseSuggestion(
    state.user?.displayName,
    state.artists,
    state.ratings,
    state.user?.uid
  );

  $('passphrase-content').innerHTML = `
    <div class="panel-header">
      <div class="panel-artist-name" style="font-size:1.1rem">Festival-Passphrase einrichten</div>
    </div>
    <div class="passphrase-setup-hint">
      Auf dem Festival gibt's kein Internet. Mit dieser Passphrase kannst du dich trotzdem einloggen.<br>
      <strong>Schreib sie auf — oder schick sie dir per WhatsApp.</strong>
    </div>
    <div>
      <div class="passphrase-suggestion-label">Vorschlag (tippen zum Übernehmen):</div>
      <div class="passphrase-suggestion-box" id="passphrase-suggestion">${escHtml(suggestion)}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:0.75rem">
      <input type="text" id="passphrase-input-1" class="passphrase-input" placeholder="Passphrase eingeben..." value="">
      <input type="text" id="passphrase-input-2" class="passphrase-input" placeholder="Passphrase bestätigen...">
      <p id="passphrase-match-error" style="color:var(--danger);font-size:0.85rem;display:none">Die Passphrases stimmen nicht überein.</p>
    </div>
    <p class="quote-hint">${escHtml(randomQuote('passphraseSetup'))}</p>
    <button class="btn-save" id="btn-save-passphrase">Passphrase speichern</button>
    <button id="btn-skip-passphrase" style="color:var(--text-muted);font-size:0.85rem;background:none;padding:0.25rem">Später einrichten</button>
  `;

  $('passphrase-suggestion')?.addEventListener('click', () => {
    const s = $('passphrase-suggestion')?.textContent || '';
    const i1 = $('passphrase-input-1');
    const i2 = $('passphrase-input-2');
    if (i1) i1.value = s;
    if (i2) i2.value = s;
  });

  $('btn-save-passphrase')?.addEventListener('click', async () => {
    const p1 = $('passphrase-input-1')?.value.trim();
    const p2 = $('passphrase-input-2')?.value.trim();
    const errEl = $('passphrase-match-error');

    if (!p1 || p1.length < 6) {
      showToast('Bitte mindestens 6 Zeichen eingeben', 'error'); return;
    }
    if (p1 !== p2) {
      if (errEl) errEl.style.display = '';
      return;
    }
    if (errEl) errEl.style.display = 'none';

    const btn = $('btn-save-passphrase');
    btn.disabled = true;
    btn.textContent = 'Wird gespeichert...';

    const hash = await setupPassphrase(p1);

    // Hash auch in Firebase speichern (damit bei neuem Gerät wiederherstellbar)
    try {
      if (isOnline() && state.user) await saveOfflineAuthHash(state.user.uid, hash);
    } catch (e) {
      console.warn('[offline-auth] Hash nicht in Firebase gespeichert:', e);
    }

    closePassphrasePanel();
    showToast('Passphrase gespeichert. I\'ll be back — auch offline.', 'success');
  });

  $('btn-skip-passphrase')?.addEventListener('click', closePassphrasePanel);

  openPassphrasePanel();
}

// ── Firestore Listeners ──

function startListeners() {
  const u1 = onArtistsChange(state.activeFestivalId, artists => {
    state.artists = artists;
    cacheArtists(artists);
    render();
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
  state.artists = getCachedArtists();
  state.ratings = getCachedRatings();
  state.users   = getCachedUsers();
  render();
}

async function syncOfflineRatings() {
  if (!isOnline() || !state.user) return;
  const result = await syncPendingToFirebase(data => saveRating(data));
  if (result?.synced > 0) showToast(`${result.synced} Bewertung(en) synchronisiert`);
}

// ── Filter ──

searchInput?.addEventListener('input', e => {
  state.searchQuery = e.target.value.toLowerCase();
  render();
});

function renderStagePills() {
  const container = $('stage-pills');
  if (!container) return;

  const festival = state.festivals.find(f => f.id === state.activeFestivalId);
  const stages   = festival?.stages || [];
  const labels   = FESTIVAL_STAGE_LABELS[state.activeFestivalId] || {};

  const stageLabel = s => labels[s] || (s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' '));

  container.innerHTML = `<button class="pill active" data-stage="all">Alle Stages</button>` +
    stages.map(s => `<button class="pill" data-stage="${escHtml(s)}">${escHtml(stageLabel(s))}</button>`).join('');

  container.querySelectorAll('[data-stage]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filterStage = btn.dataset.stage;
      container.querySelectorAll('[data-stage]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
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
    render();
  });
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
  state.artists      = [];
  state.ratings      = [];
  await saveActiveFestival(state.user.uid, festivalId);
  startListeners();
  render();
  closeFestivalPanel();
  const f = state.festivals.find(f => f.id === festivalId);
  showToast(`Festival gewechselt: ${f?.name || festivalId}`);
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
      <div class="panel-artist-name" style="font-size:1.1rem">Festival wechseln</div>
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
    <button class="festival-create-btn" id="btn-festival-create">+ Neues Festival anlegen</button>
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
      <div class="panel-artist-name" style="font-size:1.1rem">Neues Festival</div>
    </div>
    <div class="input-group">
      <label>Vorlage</label>
      <select id="festival-template-select" class="select-input">
        ${FESTIVAL_TEMPLATES.map((t,i) => `<option value="${i}">${escHtml(t.name)}</option>`).join('')}
      </select>
    </div>
    <div class="input-group">
      <label>Name</label>
      <input type="text" id="festival-name-input" class="text-input" placeholder="Festival-Name..." maxlength="60">
    </div>
    <div class="input-group">
      <label>Ort / Land</label>
      <input type="text" id="festival-location-input" class="text-input" placeholder="z.B. Kroatien" maxlength="60">
    </div>
    <div class="input-group">
      <label>Jahr</label>
      <input type="number" id="festival-year-input" class="text-input" value="${year}" min="2020" max="2099">
    </div>
    <button class="btn-save" id="btn-festival-save">Festival anlegen</button>
    <p id="festival-create-error" style="color:var(--danger);font-size:0.85rem;display:none;margin-top:0.5rem"></p>
  `;

  const templateSel  = $('festival-template-select');
  const nameInput    = $('festival-name-input');
  const locInput     = $('festival-location-input');

  const applyTemplate = () => {
    const t = FESTIVAL_TEMPLATES[parseInt(templateSel.value)];
    if (t.name !== 'Manuell eingeben') {
      nameInput.value = t.name;
      locInput.value  = t.location;
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
      errEl.textContent = 'Bitte einen Festival-Namen eingeben.';
      errEl.style.display = '';
      return;
    }

    const tpl    = FESTIVAL_TEMPLATES[parseInt(templateSel.value)];
    const stages = tpl.stages.length ? tpl.stages : ['main'];
    const btn    = $('btn-festival-save');
    btn.disabled = true;
    btn.textContent = 'Wird angelegt...';

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
      btn.textContent = 'Festival anlegen';
    }
  });
}

document.querySelectorAll('[data-sort]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.sortBy = btn.dataset.sort;
    document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
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

function filteredArtists() {
  const filtered = state.artists.filter(a => {
    if (state.filterStage !== 'all' && a.stage !== state.filterStage) return false;

    if (state.filterStatus !== 'all') {
      const r = getMyRating(a.id);
      if (state.filterStatus === 'unrated'    && r?.rating > 0)    return false;
      if (state.filterStatus === 'rated'      && !(r?.rating > 0)) return false;
      if (state.filterStatus === 'favorites'  && !r?.want_to_see)  return false;
      if (state.filterStatus === 'listened'   && !r?.listened)     return false;
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

function render() {
  const artists  = filteredArtists();
  const countEl  = document.getElementById('artist-count-text');
  if (countEl) countEl.textContent = `${artists.length} Artists`;

  if (artists.length === 0) {
    const quote = state.artists.length === 0 ? randomQuote('emptyOffline') : '';
    artistList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎵</div>
        <p>${state.artists.length === 0
          ? `Noch keine Artists geladen. Ein Admin muss zuerst den Scraper ausführen.`
          : 'Keine Artists für diesen Filter.'}</p>
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

  const commentPlaceholder = randomQuote('commentPlaceholders');

  const scBtn = artist.soundcloud_url
    ? `<a href="${escHtml(artist.soundcloud_url)}" target="_blank" rel="noopener" class="btn-soundcloud">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.175 12.225c-.015.128-.026.257-.026.389 0 .132.011.261.026.389-.015-.128-.026-.257-.026-.389 0-.132.011-.261.026-.389zm.93-2.02a2.94 2.94 0 0 0-.385.026 4.394 4.394 0 0 1 3.863-2.308c.18 0 .357.012.531.033a6.44 6.44 0 0 1 5.15-2.582 6.44 6.44 0 0 1 6.44 6.44c0 .09-.002.18-.006.27H18a2 2 0 0 1 0 4H3.105a2.94 2.94 0 0 1 0-5.879z"/></svg>
        Auf SoundCloud anhören
       </a>`
    : `<span style="color:var(--text-muted);font-size:0.85rem">Kein SoundCloud-Link vorhanden</span>`;

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
    : '<p style="color:var(--text-muted);font-size:0.85rem">Noch keine Crew-Bewertungen</p>';

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
      <label>Meine Bewertung</label>
      <div class="stars-input" id="stars-input">
        ${[1,2,3,4,5].map(i =>
          `<button class="star-btn ${i <= currentRating ? 'filled' : ''}" data-star="${i}" aria-label="${i} Stern${i>1?'e':''}">★</button>`
        ).join('')}
      </div>
    </div>

    <div class="toggle-section">
      <div class="toggle-context-label">Vor dem Festival</div>
      <div class="toggle-row">
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-listened" ${currentListened ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-label">Reingehört</span>
      </div>
      <div class="toggle-row">
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-favorite" ${currentFavorite ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-label">Favorit — will ich sehen ♥</span>
      </div>
    </div>

    <div class="toggle-section on-festival">
      <div class="toggle-context-label festival">Auf dem Festival</div>
      <div class="toggle-row">
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-seen" ${currentSeen ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-label">Gesehen ✓</span>
      </div>
    </div>

    <div class="comment-section">
      <label>Kommentar</label>
      <textarea class="comment-textarea" id="comment-input" placeholder="${escHtml(commentPlaceholder)}">${escHtml(currentComment)}</textarea>
    </div>

    <button class="btn-save" id="btn-save">Speichern</button>

    <div>
      <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:0.75rem">Crew</div>
      <div class="crew-ratings">${crewHtml}</div>
    </div>
  `;

  let selectedRating = currentRating;
  document.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.star);
      selectedRating = selectedRating === val ? 0 : val;
      document.querySelectorAll('.star-btn').forEach((b, idx) => {
        b.classList.toggle('filled', idx < selectedRating);
      });
    });
  });

  document.getElementById('btn-save')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    btn.textContent = 'Speichern...';

    const data = {
      userId:      state.user.uid,
      artistId:    artist.id,
      festivalId:  state.activeFestivalId,
      rating:      selectedRating,
      comment:     document.getElementById('comment-input')?.value || '',
      listened:    document.getElementById('toggle-listened')?.checked || false,
      want_to_see: document.getElementById('toggle-favorite')?.checked || false,
      seen:        document.getElementById('toggle-seen')?.checked || false
    };

    try {
      if (isOnline()) {
        await saveRating(data);
      } else {
        addPendingRating(data);
        const cached = getCachedRatings();
        const id     = ratingId(data.userId, data.artistId);
        const idx    = cached.findIndex(r => r.id === id);
        const entry  = { id, user_id: data.userId, artist_id: data.artistId, festival_id: data.festivalId, rating: data.rating, comment: data.comment, listened: data.listened, want_to_see: data.want_to_see, seen: data.seen ?? false };
        if (idx >= 0) cached[idx] = entry; else cached.push(entry);
        state.ratings = cached;
        cacheRatings(cached);
        showToast('Offline gespeichert — wird synchronisiert wenn du wieder online bist', 'success');
      }

      btn.textContent = 'Gespeichert ✓';
      btn.classList.add('saved');

      // 80er-Quote als Toast je nach Rating
      if (selectedRating === 5) showToast(randomQuote('fiveStars'));
      if (selectedRating === 1) showToast(randomQuote('oneStar'));

      render();
      setTimeout(closePanel, 800);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'Speichern';
      showToast('Fehler beim Speichern', 'error');
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
    ? `<span style="color:var(--success);font-size:0.8rem">✓ Offline-Passphrase eingerichtet</span>`
    : `<span style="color:var(--warning);font-size:0.8rem">⚠ Noch keine Offline-Passphrase</span>`;

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
      <button id="btn-switch-festival" style="color:var(--accent-light);font-size:0.85rem;background:none;padding:0.25rem 0.5rem;flex-shrink:0">Wechseln</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
      ${passphraseStatus}
      <button id="btn-change-passphrase" style="color:var(--accent-light);font-size:0.85rem;background:none;padding:0.25rem 0.5rem">
        ${hasOfflineHash() ? 'Ändern' : 'Einrichten'}
      </button>
    </div>
    <button class="btn-logout-modal" id="btn-logout-modal">Ausloggen</button>
  `;

  $('btn-switch-festival')?.addEventListener('click', openFestivalPanel);

  $('btn-change-passphrase')?.addEventListener('click', () => {
    closeProfileModal();
    setTimeout(() => showPassphraseSetup(), 200);
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

render();
