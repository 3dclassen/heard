// ── HEARD — Haupt-App (index.html) ──
// Artist-Liste, Filter, Auth-State, Rating-Panel

import {
  auth, db,
  loginWithGoogle, logout, onAuthChange, ensureUserProfile,
  onArtistsChange, onRatingsChange, onUsersChange,
  saveRating, ratingId
} from './firebase.js';

import {
  cacheArtists, getCachedArtists,
  cacheRatings, getCachedRatings,
  cacheUsers, getCachedUsers,
  cacheFestival, getCachedFestival,
  addPendingRating, syncPendingToFirebase,
  isOnline, onOnline, onOffline
} from './sync.js';

// ── Konstante ──

const FESTIVAL_ID = 'modem-2026';
const APP_VERSION = 'v0.3';

// ── State ──

let state = {
  user:        null,
  userProfile: null,
  artists:     [],
  ratings:     [],   // alle Ratings aller User
  users:       [],
  filterStage:  'all',
  filterStatus: 'all',
  searchQuery:  '',
  sortBy:       'name-asc',
  openArtist:   null,  // aktuell geöffneter Artist im Panel
  unsubscribers: []
};

// ── DOM-Refs ──

const $ = id => document.getElementById(id);

const loginScreen  = $('login-screen');
const appShell     = $('app-shell');
const btnLogin     = $('btn-login');
const btnLogout    = $('btn-logout');
const navAvatar    = $('nav-avatar');
const navAvatarImg = $('nav-avatar-img');
const offlineBanner = $('offline-banner');
const artistList   = $('artist-list');
const artistCount  = $('artist-count');
const searchInput  = $('search-input');
const panelBackdrop = $('panel-backdrop');
const panel        = $('panel');

// ── Service Worker registrieren ──

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('[sw] registriert:', reg.scope);
    });

    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SYNC_REQUESTED') syncOfflineRatings();
      if (e.data?.type === 'SW_UPDATED')     window.location.reload();
    });

    // Wenn ein neuer SW die Kontrolle übernimmt → Seite neu laden
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

btnLogout?.addEventListener('click', async () => {
  await logout();
});

navAvatar?.addEventListener('click', async () => {
  await logout();
});

onAuthChange(async user => {
  state.user = user;
  if (user) {
    state.userProfile = await ensureUserProfile(user);
    showApp();
    startListeners();
    await syncOfflineRatings();
  } else {
    stopListeners();
    showLogin();
  }
});

function showLogin() {
  loginScreen.style.display = 'flex';
  appShell.classList.remove('visible');
}

function showApp() {
  loginScreen.style.display = 'none';
  appShell.classList.add('visible');

  if (state.user) {
    if (navAvatarImg) navAvatarImg.src = state.user.photoURL || '';
    // Admin-Link anzeigen wenn nötig
    const adminLink = $('nav-admin');
    if (adminLink && state.userProfile?.role === 'admin') {
      adminLink.style.display = '';
    }
  }

  // Version im Titel setzen
  document.title = `HEARD ${APP_VERSION} — Artists`;
  const versionEl = $('app-version');
  if (versionEl) versionEl.textContent = APP_VERSION;
}

// ── Firestore Listeners ──

function startListeners() {
  const u1 = onArtistsChange(FESTIVAL_ID, artists => {
    state.artists = artists;
    cacheArtists(artists);
    render();
  });

  const u2 = onRatingsChange(FESTIVAL_ID, ratings => {
    state.ratings = ratings;
    cacheRatings(ratings);
    // Panel aktualisieren wenn offen
    if (state.openArtist) renderPanel(state.openArtist);
  });

  const u3 = onUsersChange(users => {
    state.users = users;
    cacheUsers(users);
  });

  state.unsubscribers = [u1, u2, u3];
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

// Beim Start: Offline-State prüfen
if (!isOnline()) {
  offlineBanner?.classList.add('visible');
  // Gecachte Daten laden
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

document.querySelectorAll('[data-stage]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.filterStage = btn.dataset.stage;
    document.querySelectorAll('[data-stage]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

document.querySelectorAll('[data-status]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.filterStatus = btn.dataset.status;
    document.querySelectorAll('[data-status]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

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
      if (state.filterStatus === 'unrated'    && r?.rating > 0)        return false;
      if (state.filterStatus === 'rated'      && !(r?.rating > 0))     return false;
      if (state.filterStatus === 'favorites'  && !r?.want_to_see)      return false;
      if (state.filterStatus === 'listened'   && !r?.listened)         return false;
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
    case 'name-asc':
      return copy.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    case 'name-desc':
      return copy.sort((a, b) => b.name.localeCompare(a.name, 'de'));
    case 'rating-desc':
      return copy.sort((a, b) => (getMyRating(b.id)?.rating || 0) - (getMyRating(a.id)?.rating || 0));
    case 'rating-asc':
      return copy.sort((a, b) => (getMyRating(a.id)?.rating || 0) - (getMyRating(b.id)?.rating || 0));
    default:
      return copy;
  }
}

function render() {
  const artists = filteredArtists();
  const countEl = document.getElementById('artist-count-text');
  if (countEl) countEl.textContent = `${artists.length} Artists`;

  if (artists.length === 0) {
    artistList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎵</div>
        <p>${state.artists.length === 0
          ? 'Noch keine Artists geladen. Ein Admin muss zuerst den Scraper ausführen.'
          : 'Keine Artists für diesen Filter.'}</p>
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

  // Andere User die diesen Artist bewertet oder als Favorit markiert haben
  const othersRatings = state.ratings.filter(
    rt => rt.artist_id === artist.id &&
          rt.user_id   !== state.user?.uid &&
          (rt.rating > 0 || rt.want_to_see)
  );

  const chipsHtml = othersRatings.length > 0
    ? `<div class="card-chips">${othersRatings.map(rt => {
        const u     = state.users.find(u => u.uid === rt.user_id);
        const name  = u?.display_name || '?';
        const photo = u?.photo_url || '';
        const ini   = getInitials(name);
        return `<div class="card-chip" title="${escHtml(name)}">
          ${photo
            ? `<img src="${escHtml(photo)}" alt="">`
            : `<span class="chip-initials">${escHtml(ini)}</span>`}
          ${rt.rating > 0   ? `<span class="chip-stars">${rt.rating}★</span>` : ''}
          ${rt.want_to_see  ? `<span class="chip-fav">♥</span>`               : ''}
        </div>`;
      }).join('')}</div>`
    : '';

  return `
    <div class="artist-card" data-id="${artist.id}">
      <div class="artist-name">${escHtml(artist.name)}</div>
      <div class="artist-meta">
        <span class="stage-badge ${artist.stage}">${stageLabel}</span>
        <span class="listened-dot ${listened ? '' : 'hidden'}"></span>
      </div>
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
  const myRating   = getMyRating(artist.id);
  const crewRatings = getArtistRatings(artist.id).filter(r => r.user_id !== state.user?.uid);
  const currentRating    = myRating?.rating    || 0;
  const currentListened  = myRating?.listened  || false;
  const currentFavorite  = myRating?.want_to_see || false;
  const currentComment   = myRating?.comment   || '';

  const scBtn = artist.soundcloud_url
    ? `<a href="${escHtml(artist.soundcloud_url)}" target="_blank" rel="noopener" class="btn-soundcloud">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.175 12.225c-.015.128-.026.257-.026.389 0 .132.011.261.026.389-.015-.128-.026-.257-.026-.389 0-.132.011-.261.026-.389zm.93-2.02a2.94 2.94 0 0 0-.385.026 4.394 4.394 0 0 1 3.863-2.308c.18 0 .357.012.531.033a6.44 6.44 0 0 1 5.15-2.582 6.44 6.44 0 0 1 6.44 6.44c0 .09-.002.18-.006.27H18a2 2 0 0 1 0 4H3.105a2.94 2.94 0 0 1 0-5.879z"/></svg>
        Auf SoundCloud anhören
       </a>`
    : `<span style="color:var(--text-muted);font-size:0.85rem">Kein SoundCloud-Link vorhanden</span>`;

  const crewHtml = crewRatings.length > 0
    ? crewRatings.map(r => {
        const u = state.users.find(u => u.uid === r.user_id);
        const name = u?.display_name?.split(' ')[0] || '?';
        const photoUrl = u?.photo_url || '';
        return `
          <div class="crew-rating-row">
            <div class="crew-avatar">${photoUrl ? `<img src="${escHtml(photoUrl)}" alt="">` : name[0]}</div>
            <span class="crew-name">${escHtml(name)}</span>
            <div class="crew-stars">${renderStarsMini(r.rating || 0)}</div>
            ${r.comment ? `<span class="crew-comment">${escHtml(r.comment)}</span>` : ''}
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
      <label>Status</label>
      <div class="toggle-row">
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-listened" ${currentListened ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-label">Reingehört</span>
      </div>
      <div class="toggle-row" style="margin-top:0.5rem">
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-favorite" ${currentFavorite ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-label">Favorit — will ich sehen ♥</span>
      </div>
    </div>

    <div class="comment-section">
      <label>Kommentar</label>
      <textarea class="comment-textarea" id="comment-input" placeholder="Was denkst du?">${escHtml(currentComment)}</textarea>
    </div>

    <button class="btn-save" id="btn-save">Speichern</button>

    <div>
      <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:0.75rem">Crew</div>
      <div class="crew-ratings">${crewHtml}</div>
    </div>
  `;

  // Star-Click
  let selectedRating = currentRating;
  document.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.star);
      // Zweimal klicken → deselektieren
      selectedRating = selectedRating === val ? 0 : val;
      document.querySelectorAll('.star-btn').forEach((b, idx) => {
        b.classList.toggle('filled', idx < selectedRating);
      });
    });
  });

  // Save
  document.getElementById('btn-save')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    btn.textContent = 'Speichern...';

    const data = {
      userId:      state.user.uid,
      artistId:    artist.id,
      festivalId:  FESTIVAL_ID,
      rating:      selectedRating,
      comment:     document.getElementById('comment-input')?.value || '',
      listened:    document.getElementById('toggle-listened')?.checked || false,
      want_to_see: document.getElementById('toggle-favorite')?.checked || false
    };

    try {
      if (isOnline()) {
        await saveRating(data);
      } else {
        addPendingRating(data);
        // Lokal sofort im Cache mergen
        const cached = getCachedRatings();
        const id = ratingId(data.userId, data.artistId);
        const idx = cached.findIndex(r => r.id === id);
        const entry = { id, user_id: data.userId, artist_id: data.artistId, festival_id: data.festivalId, ...data };
        if (idx >= 0) cached[idx] = entry; else cached.push(entry);
        state.ratings = cached;
        cacheRatings(cached);
        showToast('Offline gespeichert — wird synchronisiert wenn du wieder online bist', 'success');
      }
      btn.textContent = 'Gespeichert ✓';
      btn.classList.add('saved');
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
    }, 3000);
  });
}

// ── Hilfsfunktionen ──

function stageDisplayName(stage) {
  const map = { hive: 'The Hive', swamp: 'The Swamp', seed: 'The Seed' };
  return map[stage] || stage;
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

// Initial render (für den Fall dass Daten aus Cache kommen)
render();
