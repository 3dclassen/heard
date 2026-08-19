// ── HEARD — Service-Worker-Registrierung & Update-Handling (auf jeder Seite eingebunden) ──

import { t } from './i18n.js';

function showToast(msg, cls = '') {
  let toast = document.getElementById('sw-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sw-toast';
    document.body.appendChild(toast);
  }
  toast.className = `toast update-toast ${cls}`;
  toast.textContent = msg;
  requestAnimationFrame(() => toast.classList.add('show'));
  return toast;
}

function isUserBusy() {
  if (document.querySelector('.panel.open')) return true;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.value) return true;
  return false;
}

function reloadWhenReady() {
  if (isUserBusy()) {
    showToast(t('sw.update_waiting'));
    setTimeout(reloadWhenReady, 5000);
    return;
  }
  showToast(t('sw.updating'), 'show');
  setTimeout(() => window.location.reload(), 1500);
}

// ── Garantierter Reset ──
// unregister()/caches.delete() laufen nie über den Fetch-/Cache-Layer der Seite — können
// also NIE von einem kaputten/veralteten Service-Worker-Cache blockiert werden, anders als
// der reguläre update()-Mechanismus. Das ist die einzige wirklich narrensichere Methode.
// Wird von der Versions-Banner unten UND manuell aus dem Profil-Menü heraus aufgerufen
// (js/app.js, js/timetable.js, js/crew.js — "App-Cache leeren").
export async function forceUpdate() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } finally {
    window.location.reload();
  }
}

// ── Direkter Versions-Check, unabhängig vom SW-Update-Lifecycle ──
// Der reguläre Mechanismus (skipWaiting + clients.claim + controllerchange) ist über
// Browser/Plattformen hinweg unzuverlässig (v.a. iOS Safari) und kann sich bei einem
// bereits kaputten Cache sogar selbst blockieren. Dieser Check umgeht das komplett: er
// fragt version.js mit vollständig umgangenem Cache direkt vom Netz ab und vergleicht sie
// mit der aktuell geladenen Version. Bei Abweichung: unübersehbare Banner mit Reset-Button,
// statt still auf den automatischen Mechanismus zu hoffen.
async function checkVersionMismatch() {
  try {
    const res  = await fetch(`./version.js?t=${Date.now()}`, { cache: 'no-store' });
    const text = await res.text();
    const serverVersion = text.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
    if (serverVersion && window.APP_VERSION && serverVersion !== window.APP_VERSION) {
      showUpdateBanner(serverVersion);
    }
  } catch {
    // offline oder Netzwerkfehler — kein falscher Alarm
  }
}

function showUpdateBanner(newVersion) {
  if (document.getElementById('sw-update-banner')) return; // schon sichtbar
  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.className = 'sw-update-banner';
  banner.innerHTML = `
    <span>${t('sw.new_version')} ${newVersion}</span>
    <button id="sw-force-update-btn">${t('sw.update_now')}</button>
  `;
  document.body.appendChild(banner);
  document.getElementById('sw-force-update-btn')?.addEventListener('click', forceUpdate);
}

if ('serviceWorker' in navigator) {
  // controllerchange außerhalb des load-Events registrieren (Race Condition fix)
  let swUpdateHandled = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!swUpdateHandled) {
      swUpdateHandled = true;
      reloadWhenReady();
    }
  });

  window.addEventListener('load', () => {
    // Versionsnummer als Query-Param an die SW-URL hängen: garantiert, dass der Browser
    // bei jedem Release eine neue SW-Registrierung erkennt (unabhängig von HTTP-Caching
    // und davon, dass sw.js selbst textuell unverändert bleiben kann — importScripts()
    // in sw.js unterliegt normalem Caching und wird von der Browser-Update-Prüfung nicht
    // zuverlässig erfasst).
    const swUrl = './sw.js' + (window.APP_VERSION ? `?v=${window.APP_VERSION}` : '');
    navigator.serviceWorker.register(swUrl).then(reg => {
      const checkAll = () => { reg.update(); checkVersionMismatch(); };
      setInterval(checkAll, 60_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkAll();
      });
      window.addEventListener('focus', checkAll);
    });

    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SYNC_REQUESTED') {
        window.dispatchEvent(new CustomEvent('sw:sync-requested'));
      }
    });

    // Direkt beim Laden prüfen — nicht erst nach 60s. Der direkte Versions-Check läuft
    // absichtlich unabhängig vom SW-Update-Ergebnis (siehe Kommentar oben an der Funktion).
    checkVersionMismatch();
  });
}
