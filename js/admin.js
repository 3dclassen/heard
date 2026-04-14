// ── HEARD — Admin-Bereich (admin.html) ──

import {
  auth, db,
  onAuthChange, ensureUserProfile, logout,
  onArtistsChange, addArtist, updateArtist, deleteArtist,
  onFestivalsChange, saveFestival,
  onUsersChange, setUserRole,
  importArtists
} from './firebase.js';

const FESTIVAL_ID = 'modem-2026';

let state = {
  user:        null,
  userProfile: null,
  artists:     [],
  festivals:   [],
  users:       [],
  unsubscribers: []
};

const $ = id => document.getElementById(id);

// ── Auth + Admin-Guard ──

onAuthChange(async user => {
  state.user = user;
  if (!user) { window.location.href = './index.html'; return; }

  state.userProfile = await ensureUserProfile(user);

  if (state.userProfile?.role !== 'admin') {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100dvh;color:#6b6b8a;text-align:center;padding:2rem">
        <div>
          <div style="font-size:2rem;margin-bottom:1rem">🔒</div>
          <p>Kein Zugriff. Nur Admins dürfen diese Seite sehen.</p>
          <a href="./index.html" style="color:#7c3aed;margin-top:1rem;display:block">← Zurück zur App</a>
        </div>
      </div>`;
    return;
  }

  setupNav();
  startListeners();
  setupForms();
});

function setupNav() {
  const img = $('nav-avatar-img');
  if (img && state.user?.photoURL) img.src = state.user.photoURL;
  $('btn-logout')?.addEventListener('click', logout);
}

function startListeners() {
  const u1 = onArtistsChange(FESTIVAL_ID, artists => {
    state.artists = artists;
    renderArtistTable();
  });
  const u2 = onFestivalsChange(festivals => {
    state.festivals = festivals;
    renderFestivalInfo();
  });
  const u3 = onUsersChange(users => {
    state.users = users;
    renderUserTable();
  });
  state.unsubscribers = [u1, u2, u3];
}

// ── Festival-Info ──

function renderFestivalInfo() {
  const el = $('festival-info');
  if (!el) return;
  const f = state.festivals.find(f => f.id === FESTIVAL_ID);
  el.textContent = f ? `${f.name} — ${state.artists.length} Artists geladen` : 'Kein Festival gefunden';
}

// ── Artist-Tabelle ──

function renderArtistTable() {
  const el = $('artist-table-body');
  if (!el) return;

  $('artist-count-admin').textContent = `${state.artists.length} Artists`;

  if (state.artists.length === 0) {
    el.innerHTML = `<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:2rem">
      Noch keine Artists. Importiere sie über den Scraper oder füge sie manuell hinzu.
    </td></tr>`;
    return;
  }

  el.innerHTML = state.artists.map(a => `
    <tr>
      <td>${escHtml(a.name)}</td>
      <td><span class="stage-badge ${a.stage}">${stageLabel(a.stage)}</span></td>
      <td>${a.soundcloud_url
        ? `<a href="${escHtml(a.soundcloud_url)}" target="_blank" style="color:var(--accent-light);font-size:0.8rem">Link</a>`
        : '<span style="color:var(--text-muted);font-size:0.8rem">—</span>'}</td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${formatTime(a.time_start, a.time_end)}</td>
      <td>
        <button class="btn-danger" onclick="editArtist('${a.id}')">Bearbeiten</button>
      </td>
    </tr>`).join('');
}

// ── Artist hinzufügen / bearbeiten ──

function setupForms() {
  // Artist manuell hinzufügen
  $('form-add-artist')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name  = $('input-artist-name')?.value.trim();
    const stage = $('input-artist-stage')?.value;
    const sc    = $('input-artist-sc')?.value.trim();

    if (!name || !stage) { showToast('Name und Stage sind Pflicht', 'error'); return; }

    try {
      await addArtist({
        name,
        stage,
        soundcloud_url: sc || null,
        festival_id: FESTIVAL_ID
      });
      e.target.reset();
      showToast('Artist hinzugefügt');
    } catch (err) {
      showToast('Fehler: ' + err.message, 'error');
    }
  });

  // JSON-Import
  $('btn-import-json')?.addEventListener('click', async () => {
    const raw = $('json-import-input')?.value.trim();
    if (!raw) { showToast('Kein JSON eingegeben', 'error'); return; }
    try {
      const artists = JSON.parse(raw);
      if (!Array.isArray(artists)) throw new Error('Erwartet ein Array von Artists');
      const withFestival = artists.map(a => ({ ...a, festival_id: FESTIVAL_ID }));
      await importArtists(withFestival);
      $('json-import-input').value = '';
      showToast(`${artists.length} Artists importiert`);
    } catch (err) {
      showToast('JSON-Fehler: ' + err.message, 'error');
    }
  });

  // Festival anlegen / ID setzen
  $('btn-save-festival')?.addEventListener('click', async () => {
    const name = $('input-festival-name')?.value.trim();
    if (!name) { showToast('Festival-Name fehlt', 'error'); return; }
    try {
      await saveFestival(FESTIVAL_ID, {
        id: FESTIVAL_ID,
        name,
        location: $('input-festival-location')?.value.trim() || '',
        stages: ['hive', 'swamp', 'seed'],
        created_by: state.user.uid
      });
      showToast('Festival gespeichert');
    } catch (err) {
      showToast('Fehler: ' + err.message, 'error');
    }
  });
}

// Edit-Funktion muss global sein (onclick im HTML)
window.editArtist = function(id) {
  const a = state.artists.find(a => a.id === id);
  if (!a) return;
  const name  = prompt('Artistname:', a.name);
  if (name === null) return;
  const sc    = prompt('SoundCloud URL:', a.soundcloud_url || '');
  const day   = prompt('Tag (wednesday/thursday/friday/saturday/sunday):', a.day || '');
  const start = prompt('Startzeit (Dezimal, z.B. 23.5 für 23:30):', a.time_start ?? '');
  const end   = prompt('Endzeit (Dezimal, z.B. 1.0 für 01:00):', a.time_end ?? '');

  updateArtist(id, {
    name:          name.trim() || a.name,
    soundcloud_url: sc?.trim() || null,
    day:           day?.trim() || null,
    time_start:    start !== '' ? parseFloat(start) : null,
    time_end:      end   !== '' ? parseFloat(end)   : null
  }).then(() => showToast('Artist aktualisiert'))
    .catch(err => showToast('Fehler: ' + err.message, 'error'));
};

// ── User-Tabelle ──

function renderUserTable() {
  const el = $('user-table-body');
  if (!el) return;

  el.innerHTML = state.users.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:0.5rem">
          ${u.photo_url ? `<img src="${escHtml(u.photo_url)}" style="width:24px;height:24px;border-radius:50%">` : ''}
          ${escHtml(u.display_name || '?')}
        </div>
      </td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${escHtml(u.email || '')}</td>
      <td>
        <select onchange="changeRole('${u.uid}', this.value)" style="background:var(--bg-surface);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:0.25rem 0.5rem;font-size:0.8rem">
          <option value="viewer"  ${u.role === 'viewer'  ? 'selected' : ''}>viewer</option>
          <option value="admin"   ${u.role === 'admin'   ? 'selected' : ''}>admin</option>
        </select>
      </td>
    </tr>`).join('');
}

window.changeRole = function(uid, role) {
  setUserRole(uid, role)
    .then(() => showToast(`Rolle auf "${role}" gesetzt`))
    .catch(err => showToast('Fehler: ' + err.message, 'error'));
};

// ── Hilfsfunktionen ──

function formatTime(start, end) {
  if (start == null) return '—';
  const fmt = d => {
    const h = Math.floor(d), m = Math.round((d - h) * 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  };
  return `${fmt(start)} – ${end != null ? fmt(end) : '?'}`;
}

function stageLabel(stage) {
  return { hive: 'The Hive', swamp: 'The Swamp', seed: 'The Seed' }[stage] || stage;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, type = '') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => {
    t.classList.add('show');
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
  });
}
