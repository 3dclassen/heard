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
      setInterval(() => reg.update(), 60_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });
      window.addEventListener('focus', () => reg.update());
    });

    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SYNC_REQUESTED') {
        window.dispatchEvent(new CustomEvent('sw:sync-requested'));
      }
    });
  });
}
