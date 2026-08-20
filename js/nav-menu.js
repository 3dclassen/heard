// ── HEARD — Hamburger-Navigation für schmale Bildschirme (auf jeder Seite eingebunden) ──
// Ab einer bestimmten Breite (siehe @media in style.css) wird .nav-links zu einem
// Dropdown, das per Hamburger-Button auf-/zugeklappt wird, statt die Nav-Leiste
// horizontal über den Bildschirmrand hinauswachsen zu lassen (6 Links + Lang-Toggle +
// Avatar passen auf schmalen Handys sonst nicht nebeneinander).

export function setupNavMenu() {
  const nav    = document.querySelector('.nav');
  const toggle = document.getElementById('nav-menu-toggle');
  if (!nav || !toggle) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    nav.classList.toggle('menu-open');
  });

  // Klick auf einen Link (Seitenwechsel) oder irgendwo außerhalb schließt das Menü.
  nav.querySelectorAll('.nav-links .nav-link').forEach((link) => {
    link.addEventListener('click', () => nav.classList.remove('menu-open'));
  });

  document.addEventListener('click', (e) => {
    if (nav.classList.contains('menu-open') && !nav.contains(e.target)) {
      nav.classList.remove('menu-open');
    }
  });
}
