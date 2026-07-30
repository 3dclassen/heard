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
    navigator.serviceWorker.register('./sw.js').then(reg => {
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
