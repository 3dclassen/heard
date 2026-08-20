// ── HEARD — Timetable-Logik & UI (timetable.html) ──

import {
  auth, onAuthChange,
  onArtistsChange, onRatingsChange, onCrewChange, onUsersChange, logout,
  onFestivalsChange, saveActiveFestival
} from './firebase.js';
import { getCachedArtists, getCachedRatings, isOnline } from './sync.js';
import { myFavorites, crewFavorites, votersForArtist, getMyRating } from './rating.js';
import { hasOfflineHash, ensureUserProfileOffline } from './offline-auth.js';
import { t, applyTranslations, setupLangToggle } from './i18n.js';
import { forceUpdate } from './sw-register.js';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = {
  monday:    'Mon',
  tuesday:   'Tue',
  wednesday: 'Wed',
  thursday:  'Thu',
  friday:    'Fri',
  saturday:  'Sat',
  sunday:    'Sun'
};

const MIN_RATING_KEY = 'heard_timetable_min_rating';
const CREW_VIEW_KEY  = 'heard_timetable_crew_view'; // Legacy-Key (Boolean), für Migration
const VIEW_MODE_KEY  = 'heard_timetable_view_mode';

function loadMinRating() {
  const v = parseInt(localStorage.getItem(MIN_RATING_KEY), 10);
  return Number.isInteger(v) && v >= 0 && v <= 5 ? v : 4;
}

function saveMinRating(v) {
  localStorage.setItem(MIN_RATING_KEY, String(v));
}

// 'mine' | 'crew' | 'all' — migriert transparent vom alten Boolean-Flag (crewView).
function loadViewMode() {
  const v = localStorage.getItem(VIEW_MODE_KEY);
  if (v === 'mine' || v === 'crew' || v === 'all') return v;
  return localStorage.getItem(CREW_VIEW_KEY) === '1' ? 'crew' : 'mine';
}

function saveViewMode(v) {
  localStorage.setItem(VIEW_MODE_KEY, v);
}

let state = {
  user:             null,
  userProfile:      null,
  artists:          [],
  ratings:          [],
  crew:             null,
  users:            [],
  festivals:        [],
  activeDay:        null,
  availableDays:    [],
  activeFestivalId: 'modem-2026',
  minRating:        loadMinRating(),
  viewMode:         loadViewMode(),
  unsubscribers:    []
};

const $ = id => document.getElementById(id);

// ── Auth ──

onAuthChange(async user => {
  state.user = user;
  if (!user) {
    window.location.href = './index.html';
    return;
  }
  try {
    // Offline-sicher: siehe offline-auth.js — kein hängender Firestore-Roundtrip
    // wenn dieses users/{uid}-Doc lokal noch nicht gecacht ist.
    state.userProfile = await ensureUserProfileOffline(user);
    state.activeFestivalId = state.userProfile?.active_festival_id || 'modem-2026';
    setupNav();
    startListeners();
  } catch (err) {
    console.error('[timetable] onAuthChange Fehler:', err);
    setupNav();
    startListeners();
  }
});

// Nav-Avatar mit Initialen-Fallback: ohne photoURL (z.B. Microsoft-Login liefert oft
// keins) oder wenn das Foto-URL 404ed, zeigte <img src=""> vorher das kaputte-Bild-Icon.
function setNavAvatar(user) {
  const img = $('nav-avatar-img');
  if (!img) return;
  let fallback = document.getElementById('nav-avatar-fallback');
  if (!fallback) {
    fallback = document.createElement('div');
    fallback.id = 'nav-avatar-fallback';
    fallback.className = 'nav-avatar-fallback';
    img.insertAdjacentElement('afterend', fallback);
  }
  fallback.textContent = getInitials(user?.displayName);

  const showFallback = () => { img.style.display = 'none'; fallback.style.display = 'flex'; };
  const showImg      = () => { img.style.display = '';     fallback.style.display = 'none'; };

  if (user?.photoURL) {
    img.onerror = showFallback;
    img.src = user.photoURL;
    showImg();
  } else {
    img.removeAttribute('src');
    showFallback();
  }
}

function setupNav() {
  setNavAvatar(state.user);
  $('nav-avatar')?.addEventListener('click', openProfileModal);
  $('nav-festival')?.addEventListener('click', openFestivalPanel);
  $('btn-logout')?.addEventListener('click', logout);
  applyTranslations();
  setupLangToggle();
}

function startListeners() {
  if (!isOnline()) {
    state.artists = getCachedArtists(state.activeFestivalId);
    state.ratings = getCachedRatings(state.activeFestivalId);
    render();
    return;
  }

  const u1 = onArtistsChange(state.activeFestivalId, artists => {
    state.artists = artists;
    render();
  });
  const u2 = onRatingsChange(state.activeFestivalId, ratings => {
    state.ratings = ratings;
    render();
  });
  const u3 = onCrewChange(state.user.uid, crew => {
    state.crew = crew;
    if (state.viewMode === 'crew' && !isCrewViewAvailable()) state.viewMode = 'mine';
    render();
  });
  const u4 = onUsersChange(users => {
    state.users = users;
    render();
  });
  const u5 = onFestivalsChange(festivals => {
    state.festivals = festivals;
    updateNavFestival();
  });
  state.unsubscribers = [u1, u2, u3, u4, u5];
}

// ── Profil-Modal ──

function openProfileModal() {
  const user = state.user;
  if (!user) return;

  const avatarHtml = user.photoURL
    ? `<img src="${escHtml(user.photoURL)}" alt="" style="width:100%;height:100%;object-fit:cover">`
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
    <div style="padding:0.75rem 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
      ${passphraseStatus}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 0;border-bottom:1px solid var(--border);font-size:0.8rem;color:var(--text-muted)">
      <span>${t('profile.app_version')} ${self.APP_VERSION}</span>
      <button id="btn-force-update" style="color:var(--accent-light);font-size:0.8rem;background:none;padding:0.25rem 0.5rem">${t('profile.force_update')}</button>
    </div>
    <button class="btn-logout-modal" id="btn-logout-modal">${t('profile.logout')}</button>
  `;

  $('btn-switch-festival')?.addEventListener('click', () => {
    closeProfileModal();
    openFestivalPanel();
  });

  $('btn-force-update')?.addEventListener('click', () => forceUpdate());

  $('btn-logout-modal')?.addEventListener('click', async () => {
    closeProfileModal();
    await logout();
  });

  $('profile-backdrop')?.classList.add('open');
  $('profile-panel')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProfileModal() {
  $('profile-backdrop')?.classList.remove('open');
  $('profile-panel')?.classList.remove('open');
  document.body.style.overflow = '';
}

$('profile-backdrop')?.addEventListener('click', closeProfileModal);

// ── Festival-Panel ──

function updateNavFestival() {
  const btn = $('nav-festival');
  if (!btn) return;
  const f = state.festivals.find(f => f.id === state.activeFestivalId);
  if (!f) { btn.style.display = 'none'; return; }
  btn.textContent = f.name;
  btn.style.display = '';
}

function openFestivalPanel() {
  renderFestivalList();
  $('festival-backdrop')?.classList.add('open');
  $('festival-panel')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeFestivalPanel() {
  $('festival-backdrop')?.classList.remove('open');
  $('festival-panel')?.classList.remove('open');
  document.body.style.overflow = '';
}

$('festival-backdrop')?.addEventListener('click', closeFestivalPanel);

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
  `;
  $('festival-content').querySelectorAll('.festival-list-item').forEach(btn => {
    btn.addEventListener('click', () => switchFestival(btn.dataset.fid));
  });
}

async function switchFestival(festivalId) {
  if (festivalId === state.activeFestivalId) { closeFestivalPanel(); return; }

  state.unsubscribers.forEach(u => u?.());
  state.unsubscribers = [];

  state.activeFestivalId = festivalId;
  state.artists          = [];
  state.ratings          = [];
  state.crew              = null;
  state.viewMode           = 'mine';
  state.activeDay         = null;

  await saveActiveFestival(state.user.uid, festivalId);
  startListeners();
  render();
  closeFestivalPanel();
}

// ── Render ──

function isCrewViewAvailable() {
  return (state.crew?.members?.length || 0) > 1;
}

function render() {
  if (!state.user) return;

  let favorites;
  if (state.viewMode === 'all') {
    favorites = state.artists;
  } else if (state.viewMode === 'crew' && isCrewViewAvailable()) {
    favorites = crewFavorites(state.ratings, state.artists, state.crew.members, state.minRating);
  } else {
    favorites = myFavorites(state.ratings, state.artists, state.user.uid, state.minRating);
  }
  const hasTimestamps = favorites.some(a => a.time_start != null);

  if (!hasTimestamps) {
    renderFavoritesList(favorites);
    return;
  }

  renderTimetableView(favorites);
}

// ── Sterne-Schwelle: welche Artists zusätzlich zu ♥-Favoriten aufgenommen werden ──

function renderMinRatingControl() {
  if (state.viewMode === 'all') return ''; // Schwelle irrelevant, wenn eh alle Artists gezeigt werden
  const options = [0, 1, 2, 3, 4, 5];
  return `
    <div class="rating-tabs">
      <span class="rating-tabs-label">${t('timetable.min_rating')}</span>
      ${options.map(n => `
        <button class="rating-tab ${n === state.minRating ? 'active' : ''}" data-min="${n}">
          ${n === 0 ? t('timetable.only_hearts') : `≥${n}★`}
        </button>`).join('')}
    </div>`;
}

function wireMinRatingControl(container) {
  // Nur die "data-min"-Buttons — der Container teilt sich die .rating-tab-Klasse mit
  // dem View-Control darunter, ein zu breiter Selektor würde dessen Klicks hier auch
  // (fälschlich) als Rating-Schwelle interpretieren (dataset.min wäre dann undefined
  // -> NaN -> stiller Reset auf den Default).
  container.querySelectorAll('.rating-tab[data-min]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.minRating = parseInt(btn.dataset.min, 10);
      saveMinRating(state.minRating);
      render();
    });
  });
}

// ── Ansicht: nur meine Auswahl, + Crew-Picks, oder kompletter Timetable ──

function renderViewControl() {
  const showCrew = isCrewViewAvailable();
  return `
    <div class="rating-tabs">
      <span class="rating-tabs-label">${t('timetable.view_label')}</span>
      <button class="rating-tab" data-view="mine">${t('timetable.view_mine')}</button>
      ${showCrew ? `<button class="rating-tab" data-view="crew">${t('timetable.view_crew')}</button>` : ''}
      <button class="rating-tab" data-view="all">${t('timetable.view_all')}</button>
    </div>`;
}

function wireViewControl(container) {
  container.querySelectorAll('.rating-tab[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.viewMode);
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.view;
      saveViewMode(state.viewMode);
      render();
    });
  });
}

// ── Wer hat diesen Artist markiert? (Crew-Avatare zur Zuschreibung) ──

function renderVoterAvatars(artistId) {
  if (!isCrewViewAvailable()) return '';

  const voters = votersForArtist(state.ratings, artistId, state.crew.members, state.minRating);
  if (voters.length === 0) return '';

  return `
    <div class="slot-crew-avatars">
      ${voters.map(uid => {
        const isSelf = uid === state.user.uid;
        const u      = state.users.find(u => u.uid === uid);
        const name   = isSelf ? t('timetable.you') : (u?.display_name?.split(' ')[0] || '?');
        return `
          <div class="crew-avatar ${isSelf ? 'self' : ''}" title="${escHtml(name)}">
            ${u?.photo_url
              ? `<img src="${escHtml(u.photo_url)}" alt="">`
              : `<span style="font-size:0.6rem">${escHtml(getInitials(u?.display_name || name))}</span>`}
          </div>`;
      }).join('')}
    </div>`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Favoritenliste (noch kein Timetable) ──

function renderFavoritesList(favorites) {
  const container = $('timetable-content');
  if (!container) return;
  state.availableDays = []; // keine Day-Tabs hier -> Swipe soll nicht greifen

  if (favorites.length === 0) {
    container.innerHTML = `
      ${renderViewControl()}
      ${renderMinRatingControl()}
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <p>${t('timetable.no_favorites')}</p>
      </div>`;
    wireViewControl(container);
    wireMinRatingControl(container);
    return;
  }

  container.innerHTML = `
    ${renderViewControl()}
    ${renderMinRatingControl()}
    <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1rem">
      ${t('timetable.no_times')}
    </p>
    <div class="artist-list">
      ${favorites.map(a => {
        const r = getMyRating(state.ratings, state.user.uid, a.id);
        return `
          <div class="timetable-slot clickable" data-id="${a.id}">
            <div class="slot-artist">${escHtml(a.name)}</div>
            <div style="display:flex;gap:0.5rem;margin-top:0.25rem;align-items:center">
              <span class="stage-badge ${a.stage}">${stageLabel(a.stage)}</span>
              ${r?.rating ? `<span style="color:var(--star);font-size:0.8rem">${'★'.repeat(r.rating)}</span>` : ''}
            </div>
            ${renderVoterAvatars(a.id)}
          </div>`;
      }).join('')}
    </div>`;

  wireViewControl(container);
  wireMinRatingControl(container);
  container.querySelectorAll('.timetable-slot.clickable').forEach(el => {
    el.addEventListener('click', () => goToArtist(el.dataset.id));
  });
}

// ── Timetable-Ansicht (mit Zeiten) ──

function renderTimetableView(favorites) {
  const container = $('timetable-content');
  if (!container) return;

  // Tage ermitteln die Favoriten haben
  const availableDays = [...new Set(favorites.map(a => a.day).filter(Boolean))]
    .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  state.availableDays = availableDays; // für Swipe-Navigation (setupDaySwipe)

  if (availableDays.length === 0) {
    renderFavoritesList(favorites);
    return;
  }

  if (!state.activeDay || !availableDays.includes(state.activeDay)) {
    state.activeDay = availableDays[0];
  }

  // Day Tabs
  const tabsHtml = `
    <div class="day-tabs">
      ${availableDays.map(day => `
        <button class="day-tab ${day === state.activeDay ? 'active' : ''}" data-day="${day}">
          ${DAY_LABELS[day] || day}
        </button>`).join('')}
    </div>`;

  // Artists des aktiven Tages
  const dayArtists = favorites
    .filter(a => a.day === state.activeDay)
    .sort((a, b) => (a.time_start || 0) - (b.time_start || 0));

  // Konflikte erkennen (gleiche Zeit, verschiedene Stages)
  const conflicts = findConflicts(dayArtists);

  const slotsHtml = dayArtists.length === 0
    ? `<p style="color:var(--text-muted);padding:1rem 0">${t('timetable.no_day')}</p>`
    : dayArtists.map(a => {
        const isConflict = conflicts.has(a.id);
        const r = getMyRating(state.ratings, state.user.uid, a.id);
        return `
          <div class="timetable-slot clickable ${isConflict ? 'conflict' : ''}" data-id="${a.id}">
            <div class="slot-time">
              ${formatTime(a.time_start)} – ${formatTime(a.time_end)}
              ${isConflict ? `<span class="conflict-badge">${t('timetable.conflict')}</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem">
              <span class="slot-artist">${escHtml(a.name)}</span>
            </div>
            <div style="display:flex;gap:0.5rem;margin-top:0.25rem;align-items:center">
              <span class="stage-badge ${a.stage}">${stageLabel(a.stage)}</span>
              ${r?.rating ? `<span style="color:var(--star);font-size:0.75rem">${'★'.repeat(r.rating)}</span>` : ''}
            </div>
            ${renderVoterAvatars(a.id)}
          </div>`;
      }).join('');

  container.innerHTML = renderViewControl() + renderMinRatingControl() + tabsHtml + slotsHtml;

  wireViewControl(container);
  wireMinRatingControl(container);

  // Tab-Klick
  container.querySelectorAll('.day-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeDay = btn.dataset.day;
      render();
    });
  });

  // Artist-Klick -> Sprung in die Artists-Ansicht mit geöffnetem Detail-Panel
  container.querySelectorAll('.timetable-slot.clickable').forEach(el => {
    el.addEventListener('click', () => goToArtist(el.dataset.id));
  });
}

function goToArtist(artistId) {
  if (!artistId) return;
  window.location.href = `./index.html?artist=${encodeURIComponent(artistId)}`;
}

// ── Swipe-Navigation zwischen Tagen ──
// Einmalig auf den Container gebunden (der Node selbst überlebt render()-Aufrufe,
// nur sein innerHTML wird ersetzt) — kein Wrap-Around an den Rändern.

function setupDaySwipe() {
  const container = $('timetable-content');
  if (!container) return;

  const SWIPE_THRESHOLD = 50;
  let startX = 0, startY = 0, tracking = false;

  container.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  container.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;

    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    // Muss überwiegend horizontal sein, sonst normales vertikales Scrollen nicht stören
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (state.availableDays.length < 2) return;

    const idx = state.availableDays.indexOf(state.activeDay);
    if (idx === -1) return;
    const nextIdx = dx < 0 ? idx + 1 : idx - 1; // nach links wischen = nächster Tag
    if (nextIdx < 0 || nextIdx >= state.availableDays.length) return; // Ränder: kein Wrap-Around

    state.activeDay = state.availableDays[nextIdx];
    render();
  }, { passive: true });
}

// ── Konflikt-Erkennung ──

function findConflicts(artists) {
  const conflictIds = new Set();
  for (let i = 0; i < artists.length; i++) {
    for (let j = i + 1; j < artists.length; j++) {
      const a = artists[i], b = artists[j];
      if (a.stage === b.stage) continue;
      if (a.time_start == null || b.time_start == null) continue;
      // Zeitfenster überlappen sich
      if (a.time_start < b.time_end && a.time_end > b.time_start) {
        conflictIds.add(a.id);
        conflictIds.add(b.id);
      }
    }
  }
  return conflictIds;
}

// ── Hilfsfunktionen ──

function formatTime(decimal) {
  if (decimal == null) return '?';
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function stageLabel(stage) {
  return { hive: 'The Hive', swamp: 'The Swamp', seed: 'The Seed' }[stage] || stage;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

applyTranslations();
setupLangToggle();
setupDaySwipe();
