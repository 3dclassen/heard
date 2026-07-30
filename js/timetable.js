// ── HEARD — Timetable-Logik & UI (timetable.html) ──

import {
  auth, onAuthChange, ensureUserProfile,
  onArtistsChange, onRatingsChange, onCrewChange, onUsersChange, logout
} from './firebase.js';
import { getCachedArtists, getCachedRatings, isOnline } from './sync.js';
import { myFavorites, crewFavorites, votersForArtist, getMyRating } from './rating.js';
import { t, applyTranslations, setupLangToggle } from './i18n.js';

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
const CREW_VIEW_KEY  = 'heard_timetable_crew_view';

function loadMinRating() {
  const v = parseInt(localStorage.getItem(MIN_RATING_KEY), 10);
  return Number.isInteger(v) && v >= 0 && v <= 5 ? v : 4;
}

function saveMinRating(v) {
  localStorage.setItem(MIN_RATING_KEY, String(v));
}

function loadCrewView() {
  return localStorage.getItem(CREW_VIEW_KEY) === '1';
}

function saveCrewView(v) {
  localStorage.setItem(CREW_VIEW_KEY, v ? '1' : '0');
}

let state = {
  user:             null,
  userProfile:      null,
  artists:          [],
  ratings:          [],
  crew:             null,
  users:            [],
  activeDay:        null,
  activeFestivalId: 'modem-2026',
  minRating:        loadMinRating(),
  crewView:         loadCrewView(),
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
  state.userProfile = await ensureUserProfile(user);
  state.activeFestivalId = state.userProfile?.active_festival_id || 'modem-2026';
  setupNav();
  startListeners();
});

function setupNav() {
  const img = $('nav-avatar-img');
  if (img && state.user?.photoURL) img.src = state.user.photoURL;
  $('btn-logout')?.addEventListener('click', logout);
  applyTranslations();
  setupLangToggle();
}

function startListeners() {
  if (!isOnline()) {
    state.artists = getCachedArtists();
    state.ratings = getCachedRatings();
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
    if (!isCrewViewAvailable()) state.crewView = false;
    render();
  });
  const u4 = onUsersChange(users => {
    state.users = users;
    render();
  });
  state.unsubscribers = [u1, u2, u3, u4];
}

// ── Render ──

function isCrewViewAvailable() {
  return (state.crew?.members?.length || 0) > 1;
}

function render() {
  if (!state.user) return;

  const favorites = (state.crewView && isCrewViewAvailable())
    ? crewFavorites(state.ratings, state.artists, state.crew.members, state.minRating)
    : myFavorites(state.ratings, state.artists, state.user.uid, state.minRating);
  const hasTimestamps = favorites.some(a => a.time_start != null);

  if (!hasTimestamps) {
    renderFavoritesList(favorites);
    return;
  }

  renderTimetableView(favorites);
}

// ── Sterne-Schwelle: welche Artists zusätzlich zu ♥-Favoriten aufgenommen werden ──

function renderMinRatingControl() {
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
  container.querySelectorAll('.rating-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.minRating = parseInt(btn.dataset.min, 10);
      saveMinRating(state.minRating);
      render();
    });
  });
}

// ── Ansicht: nur meine Auswahl oder + Crew-Picks ──

function renderViewControl() {
  if (!isCrewViewAvailable()) return '';
  return `
    <div class="rating-tabs">
      <span class="rating-tabs-label">${t('timetable.view_label')}</span>
      <button class="rating-tab ${!state.crewView ? 'active' : ''}" data-view="mine">${t('timetable.view_mine')}</button>
      <button class="rating-tab ${state.crewView ? 'active' : ''}" data-view="crew">${t('timetable.view_crew')}</button>
    </div>`;
}

function wireViewControl(container) {
  container.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.crewView = btn.dataset.view === 'crew';
      saveCrewView(state.crewView);
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
