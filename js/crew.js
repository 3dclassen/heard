// ── HEARD — Crew-Seite (crew.html) ──

import {
  auth, onAuthChange, ensureUserProfile, logout,
  onArtistsChange, onRatingsChange, onUsersChange,
  createInviteCode, acceptInviteCode, onCrewChange
} from './firebase.js';
import { isOnline } from './sync.js';
import { sharedFavorites, ratingProgress } from './rating.js';

const FESTIVAL_ID = 'modem-2026';

let state = {
  user:            null,
  userProfile:     null,
  crewConnections: [],   // [{id, members: [uid1, uid2]}, ...]
  users:           [],   // alle User-Profile (für Lookup)
  artists:         [],
  ratings:         [],
  unsubscribers:   []
};

const $ = id => document.getElementById(id);

// ── Abgeleitete Helfer ──

function crewMemberIds() {
  if (!state.user) return [];
  return state.crewConnections
    .flatMap(c => c.members)
    .filter(uid => uid !== state.user.uid);
}

function myCrewUserIds() {
  return [state.user?.uid, ...crewMemberIds()].filter(Boolean);
}

function crewUsers() {
  const ids = crewMemberIds();
  return state.users.filter(u => ids.includes(u.uid));
}

function crewRatings() {
  const ids = myCrewUserIds();
  return state.ratings.filter(r => ids.includes(r.user_id));
}

// ── Auth ──

onAuthChange(async user => {
  state.user = user;
  if (!user) { window.location.href = './index.html'; return; }

  state.userProfile = await ensureUserProfile(user);
  setupNav();
  startListeners();
});

function setupNav() {
  const img = $('nav-avatar-img');
  if (img && state.user?.photoURL) img.src = state.user.photoURL;
  $('nav-avatar')?.addEventListener('click', logout);
  $('btn-logout')?.addEventListener('click', logout);

  if (state.userProfile?.role === 'admin') {
    const adminLink = $('nav-admin');
    if (adminLink) adminLink.style.display = '';
  }
}

// ── Firestore Listener ──

function startListeners() {
  const u1 = onCrewChange(state.user.uid, connections => {
    state.crewConnections = connections;
    render();
  });

  const u2 = onUsersChange(users => {
    state.users = users;
    render();
  });

  const u3 = onArtistsChange(FESTIVAL_ID, artists => {
    state.artists = artists;
    render();
  });

  const u4 = onRatingsChange(FESTIVAL_ID, ratings => {
    state.ratings = ratings;
    render();
  });

  state.unsubscribers = [u1, u2, u3, u4];
}

// ── Render ──

function render() {
  renderCrewMembers();
  renderSharedFavorites();
  renderCrewArtistList();
}

function renderCrewMembers() {
  const el = $('crew-members');
  if (!el) return;

  const myUser  = state.users.find(u => u.uid === state.user?.uid);
  const members = crewUsers();
  const all     = [myUser, ...members].filter(Boolean);

  if (all.length === 0) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = all.map(u => {
    const prog   = ratingProgress(state.ratings, state.artists, u.uid);
    const isSelf = u.uid === state.user?.uid;
    const ini    = getInitials(u.display_name);
    return `
      <div class="crew-member-card ${isSelf ? 'self' : ''}">
        ${u.photo_url
          ? `<img class="crew-member-avatar" src="${esc(u.photo_url)}" alt="">`
          : `<div class="crew-member-avatar initials">${esc(ini)}</div>`}
        <div class="crew-member-name">${esc(u.display_name?.split(' ')[0] || '?')}${isSelf ? ' (Du)' : ''}</div>
        <div class="crew-member-stats">${prog.rated}/${prog.total} bewertet</div>
        <div class="crew-member-stats">${prog.heard} reingehört</div>
      </div>`;
  }).join('');
}

function renderSharedFavorites() {
  const section = $('shared-section');
  const el      = $('shared-favorites');
  if (!el || !section) return;

  // Nur anzeigen wenn es echte Crew-Mitglieder gibt
  if (crewMemberIds().length === 0) { section.style.display = 'none'; return; }

  const ids    = myCrewUserIds();
  const shared = sharedFavorites(state.ratings, state.artists, ids);

  if (shared.length === 0) { section.style.display = 'none'; return; }
  section.style.display = '';

  el.innerHTML = shared.map(a => `
    <div class="artist-card" style="cursor:default">
      <div class="artist-name">${esc(a.name)}</div>
      <div class="artist-meta">
        <span class="stage-badge ${a.stage}">${stageLabel(a.stage)}</span>
      </div>
      <div class="card-right">
        <span style="color:var(--seed);font-size:1rem">♥</span>
      </div>
    </div>`).join('');
}

function renderCrewArtistList() {
  const el = $('crew-artist-list');
  if (!el) return;

  if (state.artists.length === 0) {
    el.innerHTML = '<div class="loader"><div class="spinner"></div> Lade...</div>';
    return;
  }

  const filtered     = crewRatings();
  const crewVisible  = [
    state.users.find(u => u.uid === state.user?.uid),
    ...crewUsers()
  ].filter(Boolean);

  // Nur Artists mit mind. einer Crew-Bewertung anzeigen, alphabetisch sortiert
  const ratedArtists = state.artists
    .filter(a => filtered.some(r => r.artist_id === a.id && (r.rating > 0 || r.want_to_see)))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  if (ratedArtists.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎵</div>
        <p>Noch keine Bewertungen. Geh zur Artist-Liste und bewerte ein paar Acts!</p>
      </div>`;
    return;
  }

  el.innerHTML = ratedArtists.map(a => {
    const artistRatings = filtered.filter(r => r.artist_id === a.id);

    const crewHtml = crewVisible.map(u => {
      const r = artistRatings.find(r => r.user_id === u.uid);
      if (!r || (r.rating === 0 && !r.want_to_see)) return '';
      const name = (u.display_name || '?').split(' ')[0];
      return `
        <div class="crew-rating-row">
          <div class="crew-avatar">
            ${u.photo_url
              ? `<img src="${esc(u.photo_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
              : `<span style="font-size:0.6rem">${esc(getInitials(u.display_name))}</span>`}
          </div>
          <span class="crew-name">${esc(name)}</span>
          <div class="crew-stars">
            ${[1,2,3,4,5].map(i =>
              `<span class="star ${i <= (r.rating || 0) ? 'filled' : ''}">★</span>`
            ).join('')}
          </div>
          ${r.want_to_see ? '<span style="color:var(--seed);font-size:0.8rem">♥</span>' : ''}
        </div>`;
    }).join('');

    if (!crewHtml.trim()) return '';

    return `
      <div class="artist-card" style="cursor:default;flex-direction:column;align-items:flex-start;gap:0.75rem">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
          <span class="artist-name">${esc(a.name)}</span>
          <span class="stage-badge ${a.stage}">${stageLabel(a.stage)}</span>
        </div>
        <div class="crew-ratings">${crewHtml}</div>
      </div>`;
  }).join('');

  // Falls nach dem Filter nichts übrig bleibt
  if (!el.innerHTML.trim()) {
    el.innerHTML = `
      <div class="empty-state">
        <p>Noch keine Crew-Bewertungen vorhanden.</p>
      </div>`;
  }
}

// ── Invite: Code generieren ──

$('btn-generate-code')?.addEventListener('click', async () => {
  const btn = $('btn-generate-code');
  btn.disabled = true;
  btn.textContent = 'Generiere...';

  try {
    const code    = await createInviteCode(state.user.uid);
    const codeEl  = $('invite-code-text');
    const codeBox = $('invite-code-box');
    if (codeEl)  codeEl.textContent = code;
    if (codeBox) codeBox.style.display = '';
    btn.textContent = 'Neuen Code generieren';
  } catch (err) {
    console.error(err);
    btn.textContent = 'Fehler — nochmal versuchen';
  }
  btn.disabled = false;
});

// ── Invite: Code kopieren ──

$('btn-copy-code')?.addEventListener('click', () => {
  const code = $('invite-code-text')?.textContent?.trim();
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    const btn = $('btn-copy-code');
    btn.textContent = 'Kopiert ✓';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Kopieren';
      btn.classList.remove('copied');
    }, 2000);
  });
});

// ── Invite: Code annehmen ──

$('btn-accept-code')?.addEventListener('click', async () => {
  const input    = $('invite-input');
  const feedback = $('invite-feedback');
  const code     = input?.value?.trim();

  if (!code) {
    setFeedback('Bitte einen Code eingeben.', 'error');
    return;
  }

  const btn = $('btn-accept-code');
  btn.disabled = true;
  btn.textContent = 'Verbinde...';

  try {
    await acceptInviteCode(code, state.user.uid);
    if (input) input.value = '';
    setFeedback('Verbunden! Willkommen in der Crew 🎉', 'success');
  } catch (err) {
    const messages = {
      CODE_NOT_FOUND:      'Code nicht gefunden. Bitte prüfen.',
      CODE_USED:           'Dieser Code wurde bereits verwendet.',
      CODE_OWN:            'Du kannst deinen eigenen Code nicht einlösen.',
      ALREADY_CONNECTED:   'Ihr seid bereits verbunden.'
    };
    setFeedback(messages[err.message] || 'Fehler — bitte nochmal versuchen.', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Verbinden';
});

function setFeedback(msg, type) {
  const el = $('invite-feedback');
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'error' ? 'var(--danger)' : 'var(--success)';
}

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

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
