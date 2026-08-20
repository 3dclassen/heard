// ── HEARD — Crew-Seite (crew.html) ──

import {
  auth, onAuthChange, logout,
  onArtistsChange, onRatingsChange, onUsersChange,
  createCrew, joinCrewByCode, leaveCrew,
  onCrewChange, saveCrewName,
  onFestivalsChange, saveActiveFestival,
  onAllCrewsChange, getOrCreateMyInviteCode
} from './firebase.js';
import {
  isOnline,
  getCachedArtists, getCachedRatings, getCachedUsers,
  cacheCrew, getCachedCrew
} from './sync.js';
import { sharedFavorites, ratingProgress } from './rating.js';
import { hasOfflineHash, ensureUserProfileOffline } from './offline-auth.js';
import { t, applyTranslations, setupLangToggle } from './i18n.js';
import { forceUpdate } from './sw-register.js';
import { setupNavMenu } from './nav-menu.js';

let state = {
  user:             null,
  userProfile:      null,
  crew:             null,
  myInviteCode:     null,
  users:            [],
  artists:          [],
  ratings:          [],
  festivals:        [],
  allCrews:         [],
  filterMember:     null,
  activeFestivalId: 'modem-2026',
  unsubscribers:    []
};

const $ = id => document.getElementById(id);

// ── Abgeleitete Helfer ──

function crewMemberIds() {
  if (!state.crew || !state.user) return [];
  return state.crew.members.filter(uid => uid !== state.user.uid);
}

function myCrewUserIds() {
  if (!state.crew) return [state.user?.uid].filter(Boolean);
  return state.crew.members;
}

function crewUsers() {
  const ids = crewMemberIds();
  return state.users.filter(u => ids.includes(u.uid));
}

function crewRatings() {
  const ids = myCrewUserIds();
  return state.ratings.filter(r => ids.includes(r.user_id));
}

function isAdmin() {
  if (!state.crew?.created_by) return true; // Altdaten ohne created_by: alle dürfen bearbeiten
  return state.crew.created_by === state.user?.uid;
}

// ── Auth ──

onAuthChange(async user => {
  state.user = user;
  if (!user) { window.location.href = './index.html'; return; }

  try {
    // Offline-sicher: siehe offline-auth.js — kein hängender Firestore-Roundtrip
    // wenn dieses users/{uid}-Doc lokal noch nicht gecacht ist.
    state.userProfile = await ensureUserProfileOffline(user);
    state.activeFestivalId = state.userProfile?.active_festival_id || 'modem-2026';
    // getOrCreateMyInviteCode() macht eine zusammengesetzte Query — hat offline ohne
    // warmen Cache dasselbe Hänge-Risiko, daher hier ebenfalls überspringen.
    state.myInviteCode = isOnline() ? await getOrCreateMyInviteCode(user.uid) : null;
  } catch (err) {
    console.error('[crew] onAuthChange Fehler:', err);
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
  $('btn-logout')?.addEventListener('click', logout);

  if (state.userProfile?.role === 'admin') {
    const adminLink = $('nav-admin');
    if (adminLink) adminLink.style.display = '';
  }

  applyTranslations();
  setupLangToggle();
}

// ── Crew-Name bearbeiten ──

$('btn-edit-crew-name')?.addEventListener('click', () => {
  const row   = $('crew-name-edit-row');
  const input = $('crew-name-input');
  if (!row || !input) return;
  input.value = state.crew?.name || '';
  row.style.display = 'flex';
  input.focus();
  $('crew-name-header').style.display = 'none';
});

$('btn-save-crew-name')?.addEventListener('click', async () => {
  const input = $('crew-name-input');
  const name  = input?.value.trim();
  if (!name || !state.crew) return;

  await saveCrewName(state.crew.id, name);
  $('crew-name-edit-row').style.display = 'none';
  $('crew-name-header').style.display = '';
  // name wird via onCrewChange-Listener aktualisiert
});

$('crew-name-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter')  $('btn-save-crew-name')?.click();
  if (e.key === 'Escape') {
    $('crew-name-edit-row').style.display = 'none';
    $('crew-name-header').style.display = '';
  }
});

// ── Crew erstellen ──

$('btn-create-crew')?.addEventListener('click', async () => {
  const input = $('crew-create-name-input');
  const name  = input?.value.trim();
  if (!name) { setFeedback(t('crew.name_required'), 'error'); return; }

  const btn = $('btn-create-crew');
  btn.disabled    = true;
  btn.textContent = t('crew.creating');

  try {
    await createCrew(state.user.uid, name);
    if (input) input.value = '';
    setFeedback('', '');
  } catch (err) {
    setFeedback(
      err.message === 'ALREADY_IN_CREW'
        ? t('crew.already_in_crew')
        : t('crew.error'),
      'error'
    );
  }

  btn.disabled    = false;
  btn.textContent = t('crew.create_btn');
});

$('crew-create-name-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-create-crew')?.click();
});

// ── Crew beitreten ──

$('btn-accept-code')?.addEventListener('click', async () => {
  const input = $('invite-input');
  const code  = input?.value?.trim();

  if (!code) { setFeedback(t('crew.code_required'), 'error'); return; }

  const btn = $('btn-accept-code');
  btn.disabled    = true;
  btn.textContent = t('crew.joining');

  try {
    await joinCrewByCode(code, state.user.uid);
    if (input) input.value = '';
    setFeedback('', '');
  } catch (err) {
    const messages = {
      CODE_NOT_FOUND:  t('crew.code_not_found'),
      CODE_OWN:        t('crew.code_own'),
      CODE_USED:       t('crew.code_used'),
      ALREADY_MEMBER:  t('crew.already_member'),
      ALREADY_IN_CREW: t('crew.already_in_another')
    };
    setFeedback(messages[err.message] || t('crew.error'), 'error');
  }

  btn.disabled    = false;
  btn.textContent = t('crew.join_btn');
});

$('invite-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-accept-code')?.click();
});

function setFeedback(msg, type) {
  const el = $('invite-feedback');
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'error' ? 'var(--danger)' : 'var(--success)';
}

// ── Crew verlassen ──

$('btn-leave-crew')?.addEventListener('click', async () => {
  if (!state.crew) return;
  if (!confirm(`${state.crew.name} — ${t('crew.leave_confirm')}`)) return;

  const btn = $('btn-leave-crew');
  btn.disabled    = true;
  btn.textContent = t('crew.leaving');

  try {
    await leaveCrew(state.crew.id, state.user.uid);
  } catch (err) {
    console.error('[crew] leaveCrew Fehler:', err);
    btn.disabled    = false;
    btn.textContent = t('crew.leave');
  }
});

// ── Code kopieren ──

$('btn-copy-code')?.addEventListener('click', () => {
  const code = state.myInviteCode;
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    const btn = $('btn-copy-code');
    btn.textContent = t('crew.copied');
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = t('crew.copy');
      btn.classList.remove('copied');
    }, 2000);
  });
});

// ── Code neu generieren (nur Admin) ──

$('btn-regen-code')?.addEventListener('click', async () => {
  if (!state.crew || !isAdmin()) return;
  if (!confirm(t('crew.regen_confirm'))) return;

  const btn = $('btn-regen-code');
  btn.disabled = true;

  try {
    await regenerateCrewCode(state.crew.id);
    // Code wird via onCrewChange-Listener aktualisiert
  } catch (err) {
    console.error('[crew] regenerateCrewCode Fehler:', err);
  }

  btn.disabled = false;
});

// ── Firestore Listener ──

function startListeners() {
  if (!isOnline()) {
    // Ohne Live-Listener: gecachte Daten laden (Artists/Ratings/Users werden bereits
    // aus index.html heraus gecacht, siehe sync.js) — vorher gab es hier gar keinen
    // Offline-Zweig, wodurch Crew-Sterne/-Kommentare offline nie sichtbar wurden.
    state.crew    = getCachedCrew();
    state.artists = getCachedArtists(state.activeFestivalId);
    state.ratings = getCachedRatings(state.activeFestivalId);
    state.users   = getCachedUsers();
    render();
    return;
  }

  const u1 = onCrewChange(state.user.uid, crew => {
    state.crew         = crew;
    state.filterMember = null;
    cacheCrew(crew);
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

  const u6 = onAllCrewsChange(allCrews => {
    state.allCrews = allCrews;
    render();
  });

  state.unsubscribers = [u1, u2, u3, u4, u5, u6];
}

// ── Render ──

function render() {
  if (state.crew) {
    $('no-crew-section').style.display  = 'none';
    $('in-crew-section').style.display  = '';
    renderCrewHeader();
    renderCrewMembers();
    renderMemberFilterBanner();
    renderSharedFavorites();
    renderCrewMatch();
    renderCrewArtistList();
  } else {
    $('no-crew-section').style.display  = '';
    $('in-crew-section').style.display  = 'none';
  }
}

function renderCrewHeader() {
  const nameEl = $('crew-name-display');
  if (nameEl) nameEl.textContent = state.crew?.name || 'Meine Crew';

  const codeEl = $('invite-code-text');
  if (codeEl) codeEl.textContent = state.myInviteCode || '…';

  const regenBtn = $('btn-regen-code');
  if (regenBtn) regenBtn.style.display = 'none';

  const ctxEl = $('crew-festival-context');
  if (ctxEl) {
    const f = state.festivals.find(f => f.id === state.activeFestivalId);
    const name = f?.name || state.activeFestivalId;
    ctxEl.textContent = `${name} · ${t('crew.context_hint')}`;
  }
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
    const isCrewAdmin = state.crew?.created_by === u.uid;

    return `
      <div class="crew-member-card ${isSelf ? 'self' : 'clickable'} ${isFiltered ? 'filtered' : ''}"
           data-uid="${esc(u.uid)}">
        ${u.photo_url
          ? `<img class="crew-member-avatar" src="${esc(u.photo_url)}" alt="">`
          : `<div class="crew-member-avatar initials">${esc(ini)}</div>`}
        <div class="crew-member-name">${esc(u.display_name?.split(' ')[0] || '?')}${isSelf ? ` (${t('crew.self')})` : ''}${isCrewAdmin ? ' ★' : ''}</div>
        <div class="crew-member-stats">${prog.rated}/${prog.total} ${t('crew.rated')}</div>
        <div class="crew-member-stats">${prog.heard} ${t('crew.heard')}</div>
      </div>`;
  }).join('');

  el.querySelectorAll('.crew-member-card.clickable').forEach(card => {
    card.addEventListener('click', () => {
      const uid       = card.dataset.uid;
      const setting   = state.filterMember !== uid;
      state.filterMember = setting ? uid : null;
      render();
      if (setting) {
        setTimeout(() => {
          $('crew-list-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    });
  });
}

function renderMemberFilterBanner() {
  const el = $('member-filter-banner');
  if (!el) return;
  if (!state.filterMember) {
    el.style.display = 'none';
    const title = $('crew-list-title');
    if (title) title.textContent = t('crew.ratings_title');
    return;
  }
  const u    = state.users.find(u => u.uid === state.filterMember);
  const name = u?.display_name?.split(' ')[0] || '?';
  el.style.display = 'flex';
  el.innerHTML = `
    <span>${t('crew.filter_view')} <strong>${esc(name)}'s</strong></span>
    <button class="member-filter-close" title="${esc(t('crew.filter_back'))}">✕</button>
  `;
  const title = $('crew-list-title');
  if (title) title.textContent = `${name}'s`;
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
    <div class="artist-card clickable" data-id="${esc(a.id)}">
      <div class="artist-name">${esc(a.name)}</div>
      <div class="artist-meta">
        ${a.time_start != null ? `<span style="font-size:0.75rem;color:var(--text-muted)">${formatTime(a.time_start)}${a.time_end != null ? ` – ${formatTime(a.time_end)}` : ''}</span>` : ''}
        <span class="stage-badge ${a.stage}">${stageLabel(a.stage)}</span>
      </div>
      <div class="card-right">
        <span style="color:var(--seed);font-size:1rem">♥</span>
      </div>
    </div>`).join('');

  el.querySelectorAll('.artist-card.clickable').forEach(card => {
    card.addEventListener('click', () => goToArtist(card.dataset.id));
  });
}

// Wie viele der Artists hat IRGENDEIN Mitglied der Crew bewertet/gehört (Aktivität der Crew als Ganzes).
function crewActivity(memberIds) {
  const rated = state.artists.filter(a =>
    memberIds.some(uid => state.ratings.some(r => r.artist_id === a.id && r.user_id === uid && r.rating > 0))
  ).length;
  const heard = state.artists.filter(a =>
    memberIds.some(uid => state.ratings.some(r => r.artist_id === a.id && r.user_id === uid && r.listened))
  ).length;
  return { rated, heard };
}

function jaccardScore(myIds, otherIds, ratings) {
  const mySet    = new Set(ratings.filter(r => myIds.includes(r.user_id) && r.want_to_see).map(r => r.artist_id));
  const otherSet = new Set(ratings.filter(r => otherIds.includes(r.user_id) && r.want_to_see).map(r => r.artist_id));
  if (mySet.size === 0 && otherSet.size === 0) return 0;
  const intersection = [...mySet].filter(id => otherSet.has(id)).length;
  const union = new Set([...mySet, ...otherSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function scoreQuote(score) {
  const pct = Math.round(score * 100);
  let quote;
  if (score <= 0.20)      quote = t('crew.score_q1');
  else if (score <= 0.40) quote = t('crew.score_q2');
  else if (score <= 0.60) quote = t('crew.score_q3');
  else if (score <= 0.80) quote = t('crew.score_q4');
  else                    quote = t('crew.score_q5');
  return { quote, pct };
}

function renderCrewMatch() {
  const section = $('crew-match-section');
  const el      = $('crew-match-list');
  if (!el || !section) return;

  const myIds = myCrewUserIds();
  // Zusätzlich zur state.crew.id auch Crews ausschließen, die den eigenen User
  // enthalten (Sicherheitsnetz gegen Mehrfach-Mitgliedschaften in alten/fehlerhaften Daten).
  const otherCrews = state.allCrews.filter(c =>
    c.id !== state.crew?.id && !(c.members || []).includes(state.user?.uid)
  );

  if (otherCrews.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:1rem 0">
        <p style="color:var(--text-dim);font-size:0.85rem">${t('crew.no_other_crews')}</p>
      </div>`;
    section.style.display = '';
    return;
  }

  const scored = otherCrews
    .map(c => {
      const score = jaccardScore(myIds, c.members || [], state.ratings);
      return { crew: c, score };
    })
    .sort((a, b) => b.score - a.score);

  el.innerHTML = scored.map(({ crew, score }) => {
    const { quote, pct } = scoreQuote(score);
    const members = crew.members || [];
    const n = members.length;
    const memberLabel = n !== 1 ? t('crew.members') : t('crew.member');

    const memberUsers = members.map(uid => state.users.find(u => u.uid === uid)).filter(Boolean);
    const { rated: crewRated, heard: crewHeard } = crewActivity(members);

    const membersHtml = memberUsers.map(u => {
      const prog = ratingProgress(state.ratings, state.artists, u.uid);
      return `
        <div class="crew-rating-row">
          <div class="crew-avatar">
            ${u.photo_url
              ? `<img src="${esc(u.photo_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
              : `<span style="font-size:0.6rem">${esc(getInitials(u.display_name))}</span>`}
          </div>
          <span class="crew-name">${esc(u.display_name?.split(' ')[0] || '?')}</span>
          <span style="font-size:0.75rem;color:var(--text-dim)">${prog.rated}/${prog.total} ${t('crew.rated')} · ${prog.heard} ${t('crew.heard')}</span>
        </div>`;
    }).join('');

    return `
      <div class="artist-card" style="cursor:default;display:flex;flex-direction:column;gap:0.5rem">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="artist-name">${esc(crew.name || 'Unbekannte Crew')}</span>
          <span style="font-size:0.75rem;color:var(--text-dim)">${n} ${memberLabel}</span>
        </div>
        <div style="font-size:0.82rem;color:var(--text-muted);font-style:italic">
          „${esc(quote)}" <span style="color:var(--accent-light);font-style:normal;font-weight:600">(${pct}%)</span>
        </div>
        <div style="font-size:0.75rem;color:var(--text-dim)">
          ${crewRated}/${state.artists.length} ${t('crew.rated')} · ${crewHeard}/${state.artists.length} ${t('crew.heard')} (${t('crew.crew_total')})
        </div>
        ${membersHtml ? `<div class="crew-ratings" style="gap:0.5rem">${membersHtml}</div>` : ''}
      </div>`;
  }).join('');

  section.style.display = '';
}

function renderCrewArtistList() {
  const el = $('crew-artist-list');
  if (!el) return;

  if (state.artists.length === 0) {
    el.innerHTML = `<div class="loader"><div class="spinner"></div> ${t('crew.loading')}</div>`;
    return;
  }

  const filtered     = crewRatings();
  const memberFilter = state.filterMember;
  const crewVisible  = memberFilter
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
        <p>${t('crew.no_ratings')}</p>
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
      <div class="artist-card clickable" data-id="${esc(a.id)}" style="display:flex;flex-direction:column;align-items:flex-start;gap:0.75rem">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
          <span class="artist-name">${esc(a.name)}</span>
          <div style="display:flex;gap:0.5rem;align-items:center">
            ${a.time_start != null ? `<span style="font-size:0.75rem;color:var(--text-muted)">${formatTime(a.time_start)}${a.time_end != null ? ` – ${formatTime(a.time_end)}` : ''}</span>` : ''}
            <span class="stage-badge ${a.stage}">${stageLabel(a.stage)}</span>
          </div>
        </div>
        <div class="crew-ratings">${crewHtml}</div>
      </div>`;
  }).join('');

  if (!el.innerHTML.trim()) {
    el.innerHTML = `<div class="empty-state"><p>${t('crew.no_crew_ratings')}</p></div>`;
  }

  el.querySelectorAll('.artist-card.clickable').forEach(card => {
    card.addEventListener('click', () => goToArtist(card.dataset.id));
  });
}

function goToArtist(artistId) {
  if (!artistId) return;
  window.location.href = `./index.html?artist=${encodeURIComponent(artistId)}`;
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

// ── Festival-Panel ──

const festivalBackdrop = $('festival-backdrop');
const festivalPanel    = $('festival-panel');

function openFestivalPanel() {
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
                data-fid="${esc(f.id)}">
          <div class="festival-list-name">${esc(f.name)}</div>
          <div class="festival-list-loc">${esc(f.location || '')}</div>
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
  state.crew             = null;
  state.artists          = [];
  state.ratings          = [];
  state.allCrews         = [];
  state.filterMember     = null;

  await saveActiveFestival(state.user.uid, festivalId);
  startListeners();
  render();
  closeFestivalPanel();
}

// ── Profil-Modal ──

const profileBackdrop = $('profile-backdrop');
const profilePanel    = $('profile-panel');

function openProfileModal() {
  const user = state.user;
  if (!user) return;

  const avatarHtml = user.photoURL
    ? `<img src="${esc(user.photoURL)}" alt="" style="width:100%;height:100%;object-fit:cover">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;color:var(--text-muted)">${getInitials(user.displayName)}</div>`;

  const passphraseStatus = hasOfflineHash()
    ? `<span style="color:var(--success);font-size:0.8rem">${t('profile.passphrase_ok')}</span>`
    : `<span style="color:var(--warning);font-size:0.8rem">${t('crew.passphrase_missing_crew')}</span>`;

  const activeFestival = state.festivals.find(f => f.id === state.activeFestivalId);

  $('profile-content').innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${avatarHtml}</div>
      <div>
        <div class="profile-name">${esc(user.displayName || '—')}</div>
        <div class="profile-email">${esc(user.email || '')}</div>
      </div>
    </div>
    <div class="profile-festival-row">
      <div>
        <div class="profile-festival-name">${esc(activeFestival?.name || state.activeFestivalId)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">${esc(activeFestival?.location || '')}</div>
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

// ── Hilfsfunktionen ──

function stageLabel(stage) {
  return { hive: 'The Hive', swamp: 'The Swamp', seed: 'The Seed' }[stage] || stage;
}

function formatTime(decimal) {
  if (decimal == null) return '?';
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

applyTranslations();
setupLangToggle();
setupNavMenu();
