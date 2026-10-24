/* Browser entry gate for public GitHub Pages; assets and source remain public. */
(() => {
  'use strict';
  const root = new URL('./', document.currentScript.src);
  const expected = 'a9323a348c0296b51050ebce24358f843d0f4db57f57ebbf51a4376932776ef7';
  const key = 'prescot-pages-access-v1';
  const login = new URL('access.html', root);
  const isLogin = location.pathname === login.pathname;
  const unlocked = () => { try { return sessionStorage.getItem(key) === expected; } catch { return false; } };
  function destination() {
    const next = new URLSearchParams(location.search).get('next') || './';
    const url = new URL(next, root);
    return url.origin === root.origin && url.pathname.startsWith(root.pathname) && url.pathname !== login.pathname ? url.href : root.href;
  }
  if (!isLogin) {
    if (unlocked()) return;
    document.documentElement.style.visibility = 'hidden';
    login.searchParams.set('next', location.pathname + location.search + location.hash);
    location.replace(login.href);
    return;
  }
  if (unlocked()) { location.replace(destination()); return; }
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form');
    const field = document.querySelector('#site-password');
    const status = document.querySelector('#access-status');
    const button = form.querySelector('button');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      button.disabled = true;
      status.textContent = '';
      try {
        const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(field.value), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode('prescot-pages-access-20261024'), iterations: 210000, hash: 'SHA-256' }, material, 256);
        const actual = Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
        if (actual !== expected) {
          status.textContent = 'Nieprawidłowe hasło. Spróbuj ponownie.';
          field.setAttribute('aria-invalid', 'true');
          field.focus(); field.select();
          return;
        }
        field.removeAttribute('aria-invalid');
        try {
          sessionStorage.setItem(key, actual);
          if (!unlocked()) throw new Error('storage');
        } catch {
          status.textContent = 'Włącz pamięć sesji w przeglądarce, aby otworzyć stronę.';
          return;
        }
        field.value = '';
        location.replace(destination());
      } catch {
        status.textContent = 'Nie udało się sprawdzić hasła. Otwórz stronę przez HTTPS i spróbuj ponownie.';
      } finally { button.disabled = false; }
    });
  }, { once: true });
})();
