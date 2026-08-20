// ── HEARD — Hilfe-Seite (help.html) ──

import { getLang, setLang, applyTranslations, setupLangToggle } from './i18n.js';
import { setupNavMenu } from './nav-menu.js';

const FAQ_EN = {
  'faq-q1':  'How do I switch the active festival?',
  'faq-a1':  '<p>Tap your <strong>avatar</strong> in the top right → Profile overlay opens → tap <strong>"Switch"</strong> → festival list appears → tap the desired festival.</p><p>The active festival applies to Artists, Timetable, and Crew simultaneously.</p>',
  'faq-q2':  'How do I create a new festival?',
  'faq-a2':  '<p>Same path as "Switch Festival": Avatar → Profile → "Switch" → scroll to the bottom and tap <strong>"+ Create New Festival"</strong>.</p><p>Choose a template (e.g. MOYN, MODEM, Fusion …) — name, location, and stages are pre-filled. You can adjust everything.</p>',
  'faq-q3':  'How do I edit an existing festival (name, location, artists)?',
  'faq-a3':  '<p>This requires <strong>Admin</strong> access: the <strong>"Admin"</strong> link appears in the navigation for admins. There you can change the festival name and location, add, edit, or delete artists, and import JSON from the scraper.</p>',
  'faq-q4':  'How do I become an admin?',
  'faq-a4':  '<p>Admin rights must be granted manually in the <strong>Firebase/Firestore Console</strong>. The field <code>role</code> in the document <code>users/{your-uid}</code> needs to be set to <code>"admin"</code>. This can only be done by someone who already has access to the Firebase project.</p>',
  'faq-q5':  'How do I create a crew?',
  'faq-a5':  '<p>Go to <a href="./crew.html">Crew</a> → section <strong>"Create a new crew"</strong> → enter a crew name → click <strong>"Create Crew"</strong>.</p><p>You\'ll receive a permanent invite code you can share with friends.</p>',
  'faq-q6':  'How do I join an existing crew?',
  'faq-a6':  '<p>Go to <a href="./crew.html">Crew</a> → section <strong>"Join a crew"</strong> → enter the 6-character code you received from a crew member → click <strong>"Join"</strong>.</p>',
  'faq-q7':  'What does the crew view show?',
  'faq-a7':  '<p>The crew page compares your ratings and shows:</p><ul><li><strong>Shared favorites</strong> – artists that all members rated ≥ 4 stars.</li><li><strong>Crew ratings</strong> – artist list with all members\' ratings side by side.</li><li><strong>Similarity score</strong> with other crews at the festival (Jaccard index).</li></ul><p>You can tap individual crew members to see only their ratings.</p>',
  'faq-q8':  'What is the offline login / passphrase?',
  'faq-a8':  '<p>HEARD works without internet too. To let you log in offline, a <strong>passphrase</strong> is suggested on first login (based on your top favorites). It\'s stored locally.</p><p>At the festival: no WiFi → open HEARD → enter passphrase → done.</p><p><strong>Forgotten your passphrase?</strong> Connect to WiFi → Google login → Avatar → Profile → set a new passphrase.</p>',
  'faq-q9':  'How do I rate an artist?',
  'faq-a9':  '<p>On the <a href="./index.html">Artists page</a>, tap an artist → detail panel opens → give stars (1–5), write a comment, mark "Listened" or "Want to see".</p><p>All changes are saved immediately to Firestore — even offline (synced next time you\'re online).</p>',
  'faq-q10': 'What does my personal timetable show?',
  'faq-a10': '<p>The <a href="./timetable.html">Timetable</a> lists all artists you rated <strong>4 or 5 stars</strong> <em>and</em> that have a scheduled time.</p><p>It automatically detects <strong>conflicts</strong> (two favorites at the same time on different stages) and highlights them.</p>',
  'faq-q11': 'Can I install HEARD as an app on my phone?',
  'faq-a11': '<p>Yes — HEARD is a <strong>Progressive Web App (PWA)</strong>.</p><ul><li><strong>iPhone/iPad:</strong> Safari → Share icon → "Add to Home Screen".</li><li><strong>Android:</strong> Chrome → Menu (⋮) → "Install app" or "Add to Home Screen".</li></ul><p>Once installed, HEARD behaves like a native app — including offline support.</p>',
};

function applyFaqLang() {
  const lang = getLang();
  const isEn = lang === 'en';

  document.getElementById('hero-desc-de').style.display = isEn ? 'none' : '';
  document.getElementById('hero-desc-en').style.display = isEn ? '' : 'none';
  document.getElementById('hero-features-de').style.display = isEn ? 'none' : '';
  document.getElementById('hero-features-en').style.display = isEn ? '' : 'none';

  for (let i = 1; i <= 11; i++) {
    const q = document.getElementById(`faq-q${i}-de`);
    const a = document.getElementById(`faq-a${i}-de`);
    if (!q || !a) continue;

    if (isEn) {
      q.textContent = FAQ_EN[`faq-q${i}`] || q.textContent;
      a.innerHTML   = FAQ_EN[`faq-a${i}`] || a.innerHTML;
    } else {
      // German content is baked into the HTML — reload forces reset.
      // On live toggle we rely on page reload for a clean DE state.
      // If already English, switching back reloads the page.
    }
  }
}

// Language toggle with reload for DE (to restore original HTML content)
document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const prev = getLang();
    setLang(btn.dataset.lang);
    applyTranslations();
    applyFaqLang();

    // If switching back to DE we need a reload to restore baked-in HTML
    if (prev !== 'de' && btn.dataset.lang === 'de') {
      window.location.reload();
    }
  });
});

applyTranslations();
applyFaqLang();
setupNavMenu();
