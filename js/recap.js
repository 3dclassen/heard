// ── HEARD — Recap-Seite (recap.html) ──
// Persönliche Statistik (gesehen/bewertet/Stunden/Vorher-Nachher) + Crew-Leaderboard.
// Struktur bewusst 1:1 nach dem Vorbild von crew.js (Auth/Nav/Profil/Offline-Handling).

import {
  auth, onAuthChange, logout,
  onArtistsChange, onRatingsChange, onUsersChange,
  onCrewChange, onFestivalsChange, saveActiveFestival
} from './firebase.js';
import {
  isOnline,
  getCachedArtists, getCachedRatings, getCachedUsers, getCachedCrew
} from './sync.js';
import { personalRecap, crewRecap } from './rating.js';
import { hasOfflineHash, ensureUserProfileOffline } from './offline-auth.js';
import { forceUpdate } from './sw-register.js';
import { setupNavMenu } from './nav-menu.js';
import { t, applyTranslations, setupLangToggle } from './i18n.js';

const DAY_LABELS = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
};

let state = {
  user:             null,
  userProfile:      null,
  crew:             null,
  users:            [],
  artists:          [],
  ratings:          [],
  festivals:        [],
  activeFestivalId: 'modem-2026',
  unsubscribers:    []
};

const $ = id => document.getElementById(id);

// ── Auth ──

onAuthChange(async user => {
  state.user = user;
  if (!user) { window.location.href = './index.html'; return; }

  try {
    state.userProfile = await ensureUserProfileOffline(user);
    state.activeFestivalId = state.userProfile?.active_festival_id || 'modem-2026';
  } catch (err) {
    console.error('[recap] onAuthChange Fehler:', err);
  }
  setupNav();
  startListeners();
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

// ── Firestore Listener ──

function startListeners() {
  if (!isOnline()) {
    state.crew    = getCachedCrew();
    state.artists = getCachedArtists(state.activeFestivalId);
    state.ratings = getCachedRatings(state.activeFestivalId);
    state.users   = getCachedUsers();
    render();
    return;
  }

  const u1 = onCrewChange(state.user.uid, crew => {
    state.crew = crew;
    render();
  });
  const u2 = onUsersChange(users => {
    state.users = users;
    render();
  });
  const u3 = onArtistsChange(state.activeFestivalId, artists => {
    state.artists = artists;
    render();
  });
  const u4 = onRatingsChange(state.activeFestivalId, ratings => {
    state.ratings = ratings;
    render();
  });
  const u5 = onFestivalsChange(festivals => {
    state.festivals = festivals;
    updateNavFestival();
  });
  state.unsubscribers = [u1, u2, u3, u4, u5];
}

// ── Render ──

function isCrewViewAvailable() {
  return (state.crew?.members?.length || 0) > 1;
}

function render() {
  const container = $('recap-content');
  if (!container || !state.user) return;

  if (state.artists.length === 0) {
    container.innerHTML = `<div class="loader"><div class="spinner"></div> <span data-i18n="loading.generic">${t('loading.generic')}</span></div>`;
    return;
  }

  const my = personalRecap(state.ratings, state.artists, state.user.uid);

  const leaderboardHtml = isCrewViewAvailable() ? renderLeaderboards() : '';

  container.innerHTML = `
    ${renderStatTiles(my)}
    ${my.hasTimeData ? renderByDay(my) : ''}
    ${my.hasTimeData ? renderByStage(my) : ''}
    ${renderBeforeAfter(my)}
    ${!my.hasTimeData ? `<p class="recap-hint">${t('recap.no_time_data')}</p>` : ''}
    ${leaderboardHtml}
  `;

  container.querySelectorAll('.artist-card.clickable').forEach(card => {
    card.addEventListener('click', () => goToArtist(card.dataset.id));
  });
}

function goToArtist(artistId) {
  if (!artistId) return;
  window.location.href = `./index.html?artist=${encodeURIComponent(artistId)}`;
}

function renderStatTiles(my) {
  const tiles = [
    [my.seenCount, `${t('recap.seen')} (${my.seenCount}/${my.totalCount})`],
    [my.ratedCount, t('recap.rated')],
    [my.favoritesCount, t('recap.favorites')],
    [my.postRatedCount, t('recap.post_rated')],
  ];
  if (my.hasTimeData) {
    tiles.splice(1, 0, [`${my.totalHours.toFixed(1)}h`, t('recap.hours_total')]);
  }
  return `
    <div class="stat-tile-grid">
      ${tiles.map(([value, label]) => `
        <div class="stat-tile">
          <div class="stat-tile-value">${value}</div>
          <div class="stat-tile-label">${escHtml(label)}</div>
        </div>`).join('')}
    </div>`;
}

function renderByDay(my) {
  const days = Object.entries(my.byDay).sort((a, b) => b[1] - a[1]);
  if (days.length === 0) return '';
  return `
    <h2 class="section-title">${t('recap.by_day')}</h2>
    <div class="recap-list">
      ${days.map(([day, count]) => `
        <div class="recap-list-row">
          <span>${DAY_LABELS[day] || escHtml(day)}</span>
          <span>${count}</span>
        </div>`).join('')}
    </div>`;
}

function renderByStage(my) {
  const stages = Object.entries(my.hoursByStage).sort((a, b) => b[1] - a[1]);
  if (stages.length === 0) return '';
  const maxHours = Math.max(...stages.map(([, h]) => h));
  return `
    <h2 class="section-title">${t('recap.by_stage')}</h2>
    <div class="stage-bars">
      ${stages.map(([stage, hours]) => `
        <div class="stage-bar-row">
          <span class="stage-badge ${stage}">${stageLabel(stage)}</span>
          <div class="stage-bar-track">
            <div class="stage-bar-fill ${stage}" style="width:${maxHours > 0 ? (hours / maxHours) * 100 : 0}%"></div>
          </div>
          <span class="stage-bar-value">${hours.toFixed(1)}h</span>
        </div>`).join('')}
    </div>`;
}

function renderBeforeAfter(my) {
  if (my.postRatedCount === 0) {
    return `
      <h2 class="section-title">${t('recap.surprises')}</h2>
      <p style="color:var(--text-muted);font-size:0.85rem">${t('recap.no_surprises')}</p>`;
  }

  const avgRow = `
    <div class="recap-avg-row">
      <div>
        <div class="recap-avg-label">${t('recap.rating_before')}</div>
        <div class="stars-mini">${renderStarsMini(Math.round(my.avgRatingBefore))}</div>
      </div>
      <span class="recap-avg-arrow">→</span>
      <div>
        <div class="recap-avg-label">${t('recap.rating_after')}</div>
        <div class="stars-mini">${renderStarsMini(Math.round(my.avgRatingAfter))}</div>
      </div>
    </div>`;

  const surprisesHtml = my.surprises.map(s => {
    const artist = state.artists.find(a => a.id === s.artistId);
    if (!artist) return '';
    return `
      <div class="artist-card clickable" data-id="${escHtml(artist.id)}" style="display:flex;flex-direction:column;gap:0.4rem">
        <span class="artist-name">${escHtml(artist.name)}</span>
        <div class="recap-avg-row" style="justify-content:flex-start;gap:1rem">
          <div class="stars-mini">${renderStarsMini(s.before)}</div>
          <span class="recap-avg-arrow">→</span>
          <div class="stars-mini">${renderStarsMini(s.after)}</div>
        </div>
      </div>`;
  }).join('');

  return `
    <h2 class="section-title">${t('recap.rating_before')} / ${t('recap.rating_after')}</h2>
    ${avgRow}
    <h2 class="section-title">${t('recap.surprises')}</h2>
    <div class="artist-list">${surprisesHtml}</div>`;
}

function renderLeaderboards() {
  const members = crewRecap(state.ratings, state.artists, state.crew.members);
  const nameFor = uid => uid === state.user.uid
    ? t('recap.you')
    : (state.users.find(u => u.uid === uid)?.display_name?.split(' ')[0] || '?');
  const photoFor = uid => state.users.find(u => u.uid === uid)?.photo_url || '';

  const seenBoard = [...members].sort((a, b) => b.seenCount - a.seenCount);
  const hasAnyTime = members.some(m => m.hasTimeData);
  const hoursBoard = hasAnyTime ? [...members].sort((a, b) => b.totalHours - a.totalHours) : null;

  const boardHtml = (board, valueFn) => `
    <div class="recap-leaderboard">
      ${board.map((m, i) => `
        <div class="recap-leaderboard-row ${i === 0 ? 'first' : ''}">
          <span class="recap-rank">${i + 1}</span>
          <div class="crew-avatar">
            ${photoFor(m.userId)
              ? `<img src="${escHtml(photoFor(m.userId))}" alt="">`
              : `<span style="font-size:0.6rem">${escHtml(getInitials(nameFor(m.userId)))}</span>`}
          </div>
          <span class="crew-name" style="width:auto;flex:1">${escHtml(nameFor(m.userId))}</span>
          <span class="recap-leaderboard-value">${valueFn(m)}</span>
        </div>`).join('')}
    </div>`;

  return `
    <h2 class="section-title">${t('recap.leaderboard_seen')}</h2>
    ${boardHtml(seenBoard, m => m.seenCount)}
    ${hoursBoard ? `
      <h2 class="section-title">${t('recap.leaderboard_hours')}</h2>
      ${boardHtml(hoursBoard, m => `${m.totalHours.toFixed(1)}h`)}
    ` : ''}`;
}

function renderStarsMini(rating) {
  return [1,2,3,4,5].map(i =>
    `<span class="star ${i <= rating ? 'filled' : ''}">★</span>`
  ).join('');
}

// ── Festival-Nav ──

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
  state.crew     = null;
  state.artists  = [];
  state.ratings  = [];

  await saveActiveFestival(state.user.uid, festivalId);
  startListeners();
  render();
  closeFestivalPanel();
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

// ── Hilfsfunktionen ──

function stageLabel(stage) {
  return { hive: 'The Hive', swamp: 'The Swamp', seed: 'The Seed' }[stage] || stage;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

applyTranslations();
setupLangToggle();
setupNavMenu();
