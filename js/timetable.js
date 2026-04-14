// ── HEARD — Timetable-Logik & UI (timetable.html) ──

import {
  auth, onAuthChange, ensureUserProfile,
  onArtistsChange, onRatingsChange, logout
} from './firebase.js';
import { getCachedArtists, getCachedRatings, isOnline } from './sync.js';
import { myFavorites, sharedFavorites, getMyRating } from './rating.js';

const FESTIVAL_ID = 'modem-2026';

const DAY_ORDER = ['wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = {
  wednesday: 'Mi',
  thursday:  'Do',
  friday:    'Fr',
  saturday:  'Sa',
  sunday:    'So'
};

let state = {
  user:        null,
  userProfile: null,
  artists:     [],
  ratings:     [],
  activeDay:   null,
  unsubscribers: []
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
  setupNav();
  startListeners();
});

function setupNav() {
  const img = $('nav-avatar-img');
  if (img && state.user?.photoURL) img.src = state.user.photoURL;
  $('btn-logout')?.addEventListener('click', logout);
}

function startListeners() {
  if (!isOnline()) {
    state.artists = getCachedArtists();
    state.ratings = getCachedRatings();
    render();
    return;
  }

  const u1 = onArtistsChange(FESTIVAL_ID, artists => {
    state.artists = artists;
    render();
  });
  const u2 = onRatingsChange(FESTIVAL_ID, ratings => {
    state.ratings = ratings;
    render();
  });
  state.unsubscribers = [u1, u2];
}

// ── Render ──

function render() {
  if (!state.user) return;

  const favorites = myFavorites(state.ratings, state.artists, state.user.uid);
  const hasTimestamps = favorites.some(a => a.time_start != null);

  if (!hasTimestamps) {
    renderFavoritesList(favorites);
    return;
  }

  renderTimetableView(favorites);
}

// ── Favoritenliste (noch kein Timetable) ──

function renderFavoritesList(favorites) {
  const container = $('timetable-content');
  if (!container) return;

  if (favorites.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <p>Noch keine Favoriten — geh zurück zur Artist-Liste und bewerte ein paar Acts!</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1rem">
      Timetable (Zeiten) noch nicht verfügbar. Hier sind deine Favoriten:
    </p>
    <div class="artist-list">
      ${favorites.map(a => {
        const r = getMyRating(state.ratings, state.user.uid, a.id);
        return `
          <div class="timetable-slot">
            <div class="slot-artist">${escHtml(a.name)}</div>
            <div style="display:flex;gap:0.5rem;margin-top:0.25rem;align-items:center">
              <span class="stage-badge ${a.stage}">${stageLabel(a.stage)}</span>
              ${r?.rating ? `<span style="color:var(--star);font-size:0.8rem">${'★'.repeat(r.rating)}</span>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;
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
    ? '<p style="color:var(--text-muted);padding:1rem 0">Keine Favoriten an diesem Tag.</p>'
    : dayArtists.map(a => {
        const isConflict = conflicts.has(a.id);
        const r = getMyRating(state.ratings, state.user.uid, a.id);
        return `
          <div class="timetable-slot ${isConflict ? 'conflict' : ''}">
            <div class="slot-time">
              ${formatTime(a.time_start)} – ${formatTime(a.time_end)}
              ${isConflict ? '<span class="conflict-badge">Zeitkonflikt ⚡</span>' : ''}
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem">
              <span class="slot-artist">${escHtml(a.name)}</span>
            </div>
            <div style="display:flex;gap:0.5rem;margin-top:0.25rem;align-items:center">
              <span class="stage-badge ${a.stage}">${stageLabel(a.stage)}</span>
              ${r?.rating ? `<span style="color:var(--star);font-size:0.75rem">${'★'.repeat(r.rating)}</span>` : ''}
            </div>
          </div>`;
      }).join('');

  container.innerHTML = tabsHtml + slotsHtml;

  // Tab-Klick
  container.querySelectorAll('.day-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeDay = btn.dataset.day;
      render();
    });
  });
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
