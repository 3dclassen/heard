// ── HEARD — Crew-Seite (crew.html) ──

import {
  auth, onAuthChange, ensureUserProfile, logout,
  onArtistsChange, onRatingsChange, onUsersChange,
  acceptInviteCode, onCrewChange,
  getOrCreatePersistentCode, saveCrewName
} from './firebase.js';
import { isOnline } from './sync.js';
import { sharedFavorites, ratingProgress } from './rating.js';

let state = {
  user:             null,
  userProfile:      null,
  crewConnections:  [],
  users:            [],
  artists:          [],
  ratings:          [],
  filterMember:     null,
  activeFestivalId: 'modem-2026',
  unsubscribers:    []
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
  state.activeFestivalId = state.userProfile?.active_festival_id || 'modem-2026';
  setupNav();
  loadPersistentCode();
  renderCrewName();
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

// ── Crew-Name ──

function renderCrewName() {
  const name = state.userProfile?.crew_name || 'Meine Crew';
  const el   = $('crew-name-display');
  if (el) el.textContent = name;
}

$('btn-edit-crew-name')?.addEventListener('click', () => {
  const row   = $('crew-name-edit-row');
  const input = $('crew-name-input');
  if (!row || !input) return;
  input.value = state.userProfile?.crew_name || '';
  row.style.display = 'flex';
  input.focus();
  $('crew-name-header').style.display = 'none';
});

$('btn-save-crew-name')?.addEventListener('click', async () => {
  const input = $('crew-name-input');
  const name  = input?.value.trim();
  if (!name) return;

  await saveCrewName(state.user.uid, name);
  if (state.userProfile) state.userProfile.crew_name = name;
  renderCrewName();

  $('crew-name-edit-row').style.display = 'none';
  $('crew-name-header').style.display = '';
});

$('crew-name-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-save-crew-name')?.click();
  if (e.key === 'Escape') {
    $('crew-name-edit-row').style.display = 'none';
    $('crew-name-header').style.display = '';
  }
});

// ── Persistenter Invite-Code ──

async function loadPersistentCode() {
  const codeEl = $('invite-code-text');
  if (!codeEl) return;
  try {
    const code = await getOrCreatePersistentCode(state.user.uid);
    codeEl.textContent = code;
  } catch (err) {
    console.error('[crew] Konnte Code nicht laden:', err);
    codeEl.textContent = '— Fehler —';
  }
}

$('btn-copy-code')?.addEventListener('click', () => {
  const code = $('invite-code-text')?.textContent?.trim();
  if (!code || code === 'Lade...' || code === '— Fehler —') return;
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

// ── Code annehmen ──

$('btn-accept-code')?.addEventListener('click', async () => {
  const input    = $('invite-input');
  const code     = input?.value?.trim();

  if (!code) { setFeedback('Bitte einen Code eingeben.', 'error'); return; }

  const btn = $('btn-accept-code');
  btn.disabled = true;
  btn.textContent = 'Verbinde...';

  try {
    await acceptInviteCode(code, state.user.uid);
    if (input) input.value = '';
    setFeedback('Verbunden! Willkommen in der Crew 🎉', 'success');
  } catch (err) {
    const messages = {
      CODE_NOT_FOUND:    'Code nicht gefunden. Bitte prüfen.',
      CODE_USED:         'Dieser Code wurde bereits verwendet.',
      CODE_OWN:          'Du kannst deinen eigenen Code nicht einlösen.',
      ALREADY_CONNECTED: 'Ihr seid bereits verbunden.'
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

  const u3 = onArtistsChange(state.activeFestivalId, artists => {
    state.artists = artists;
    render();
  });

  const u4 = onRatingsChange(state.activeFestivalId, ratings => {
    state.ratings = ratings;
    render();
  });

  state.unsubscribers = [u1, u2, u3, u4];
}

// ── Render ──

function render() {
  renderCrewMembers();
  renderMemberFilterBanner();
  renderSharedFavorites();
  renderCrewArtistList();
}

function renderCrewMembers() {
  const el = $('crew-members');
  if (!el) return;

  const myUser  = state.users.find(u => u.uid === state.user?.uid);
  const members = crewUsers();
  const all     = [myUser, ...members].filter(Boolean);

  if (all.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = all.map(u => {
    const prog       = ratingProgress(state.ratings, state.artists, u.uid);
    const isSelf     = u.uid === state.user?.uid;
    const isFiltered = state.filterMember === u.uid;
    const ini        = getInitials(u.display_name);
    const codeHtml   = u.invite_code
      ? `<div class="crew-member-code">
           <span class="crew-member-code-text">${esc(u.invite_code)}</span>
           <button class="btn-copy-mini" data-code="${esc(u.invite_code)}" title="Code kopieren">⧉</button>
         </div>`
      : '';
    return `
      <div class="crew-member-card ${isSelf ? 'self' : 'clickable'} ${isFiltered ? 'filtered' : ''}"
           data-uid="${esc(u.uid)}">
        ${u.photo_url
          ? `<img class="crew-member-avatar" src="${esc(u.photo_url)}" alt="">`
          : `<div class="crew-member-avatar initials">${esc(ini)}</div>`}
        <div class="crew-member-name">${esc(u.display_name?.split(' ')[0] || '?')}${isSelf ? ' (Du)' : ''}</div>
        <div class="crew-member-stats">${prog.rated}/${prog.total} bewertet</div>
        <div class="crew-member-stats">${prog.heard} reingehört</div>
        ${codeHtml}
      </div>`;
  }).join('');

  el.querySelectorAll('.crew-member-card.clickable').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('btn-copy-mini')) return;
      const uid = card.dataset.uid;
      state.filterMember = state.filterMember === uid ? null : uid;
      render();
    });
  });

  el.querySelectorAll('.btn-copy-mini').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.code).then(() => {
        const prev = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = prev; }, 2000);
      });
    });
  });
}

function renderMemberFilterBanner() {
  const el = $('member-filter-banner');
  if (!el) return;
  if (!state.filterMember) {
    el.style.display = 'none';
    const title = $('crew-list-title');
    if (title) title.textContent = 'Crew-Bewertungen';
    return;
  }
  const u    = state.users.find(u => u.uid === state.filterMember);
  const name = u?.display_name?.split(' ')[0] || '?';
  el.style.display = 'flex';
  el.innerHTML = `
    <span>Ansicht: <strong>${esc(name)}'s Bewertungen</strong></span>
    <button class="member-filter-close" title="Zurück zur Crew-Ansicht">✕</button>
  `;
  const title = $('crew-list-title');
  if (title) title.textContent = `${name}'s Bewertungen`;
  el.querySelector('.member-filter-close').onclick = () => {
    state.filterMember = null;
    render();
  };
}

function renderSharedFavorites() {
  const section = $('shared-section');
  const el      = $('shared-favorites');
  if (!el || !section) return;

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

  const filtered    = crewRatings();
  const memberFilter = state.filterMember;
  const crewVisible = memberFilter
    ? [state.users.find(u => u.uid === memberFilter)].filter(Boolean)
    : [
        state.users.find(u => u.uid === state.user?.uid),
        ...crewUsers()
      ].filter(Boolean);

  const ratedArtists = state.artists
    .filter(a => filtered.some(r =>
      r.artist_id === a.id &&
      (memberFilter ? r.user_id === memberFilter : true) &&
      (r.rating > 0 || r.want_to_see)
    ))
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
          ${r.comment?.trim() ? `<span class="crew-comment">${esc(r.comment.trim())}</span>` : ''}
        </div>`;
    }).join('');

    if (!crewHtml.trim()) return '';

    return `
      <div class="artist-card" style="cursor:default;display:flex;flex-direction:column;align-items:flex-start;gap:0.75rem">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
          <span class="artist-name">${esc(a.name)}</span>
          <span class="stage-badge ${a.stage}">${stageLabel(a.stage)}</span>
        </div>
        <div class="crew-ratings">${crewHtml}</div>
      </div>`;
  }).join('');

  if (!el.innerHTML.trim()) {
    el.innerHTML = `<div class="empty-state"><p>Noch keine Crew-Bewertungen vorhanden.</p></div>`;
  }
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
