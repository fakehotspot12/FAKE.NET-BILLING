(() => {
  'use strict';

  let scriptPromise = null;
  function loadTurnstile() {
    if (window.turnstile?.render) return Promise.resolve(window.turnstile);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      const timeout = window.setTimeout(() => finish(false), 12000);
      let settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (ok && window.turnstile?.render) resolve(window.turnstile);
        else {
          script.remove();
          reject(new Error('Verifikasi Cloudflare gagal dimuat. Periksa koneksi lalu refresh.'));
        }
      }
      script.addEventListener('load', () => finish(true), { once: true });
      script.addEventListener('error', () => finish(false), { once: true });
      document.head.appendChild(script);
    }).catch(error => { scriptPromise = null; throw error; });
    return scriptPromise;
  }

  function create({ form, imageBox, codeInput, idInput, refreshButton, fetchPayload, onMessage = () => {} }) {
    let provider = 'loading';
    let widget = null;
    let widgetSize = '';
    let generation = 0;
    let destroyed = false;
    let refreshing = null;
    const row = imageBox.parentElement;
    const field = row.closest('label');
    const tokenInput = document.createElement('input');
    tokenInput.type = 'hidden';
    tokenInput.name = 'turnstileToken';
    form.appendChild(tokenInput);
    const submitButton = form.querySelector('button[type="submit"]');
    function ready(value) { if (submitButton && form.isConnected) submitButton.disabled = !value; }
    function removeWidget() {
      if (widget !== null) {
        try { window.turnstile?.remove(widget); } catch {}
        widget = null;
      }
      tokenInput.value = '';
    }
    function live(current) { return !destroyed && current === generation && form.isConnected; }
    async function refresh() {
      if (refreshing) return refreshing;
      const current = ++generation;
      refreshing = (async () => {
        removeWidget();
        provider = 'loading';
        ready(false);
        codeInput.disabled = true;
        codeInput.required = false;
        codeInput.hidden = true;
        codeInput.value = '';
        idInput.value = '';
        imageBox.textContent = 'Menyiapkan verifikasi...';
        try {
          const payload = await fetchPayload();
          if (!live(current)) return;
          provider = payload.enabled === false ? 'disabled' : payload.provider || 'code';
          const turnstile = provider === 'turnstile';
          if (refreshButton) refreshButton.hidden = turnstile || provider === 'disabled';
          row.classList.toggle('is-turnstile', turnstile);
          imageBox.classList.toggle('is-turnstile', turnstile);
          imageBox.classList.remove('is-loading');
          if (field) field.hidden = provider === 'disabled';
          tokenInput.disabled = !turnstile;
          idInput.disabled = turnstile || provider === 'disabled';
          const label = field?.querySelector(':scope > span');
          if (label) label.textContent = turnstile ? 'Verifikasi Keamanan' : 'Kode Verifikasi';
          if (provider === 'disabled') { ready(true); return; }
          if (provider === 'code') {
            const verification = payload.verification || {};
            if (!verification.id || !verification.image) throw new Error('Kode verifikasi belum tersedia. Refresh lalu coba lagi.');
            idInput.value = verification.id;
            codeInput.disabled = false;
            codeInput.required = true;
            codeInput.hidden = false;
            const image = document.createElement('img');
            image.src = verification.image;
            image.alt = 'Kode verifikasi';
            imageBox.replaceChildren(image);
            ready(true);
            return;
          }
          if (provider !== 'turnstile' || !payload.siteKey || payload.configured === false) {
            throw new Error('Verifikasi Cloudflare belum dikonfigurasi. Hubungi admin.');
          }
          const api = await loadTurnstile();
          if (!live(current)) return;
          imageBox.replaceChildren();
          const size = imageBox.getBoundingClientRect().width < 300 ? 'compact' : 'flexible';
          widgetSize = size;
          imageBox.dataset.widgetSize = size;
          widget = api.render(imageBox, {
            sitekey: payload.siteKey,
            action: payload.action || 'billing_login',
            theme: 'dark',
            size,
            language: 'id',
            retry: 'auto',
            'refresh-expired': 'auto',
            'refresh-timeout': 'auto',
            'response-field': false,
            callback: token => {
              if (!live(current)) return;
              tokenInput.value = token;
              ready(Boolean(token));
            },
            'expired-callback': () => {
              if (!live(current)) return;
              tokenInput.value = '';
              ready(false);
              onMessage('Verifikasi kedaluwarsa. Silakan verifikasi kembali.', true);
            },
            'error-callback': () => {
              if (!live(current)) return;
              tokenInput.value = '';
              ready(false);
              onMessage('Verifikasi Cloudflare gagal. Periksa koneksi atau muat ulang halaman.', true);
            }
          });
        } catch (error) {
          if (!live(current)) return;
          provider = 'error';
          imageBox.textContent = 'Verifikasi belum tersedia';
          onMessage(error.message || 'Verifikasi gagal dimuat', true);
          ready(false);
        }
      })().finally(() => { refreshing = null; });
      return refreshing;
    }
    const onRefresh = () => refresh();
    refreshButton?.addEventListener('click', onRefresh);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      const size = imageBox.getBoundingClientRect().width < 300 ? 'compact' : 'flexible';
      if (!destroyed && provider === 'turnstile' && widget !== null && size !== widgetSize) refresh();
    }) : null;
    resizeObserver?.observe(imageBox);
    return {
      refresh,
      assertReady() {
        if (provider === 'disabled') return;
        if (provider === 'turnstile' && tokenInput.value) return;
        if (provider === 'code' && idInput.value && codeInput.value.trim()) return;
        throw new Error(provider === 'turnstile' ? 'Selesaikan verifikasi Cloudflare terlebih dahulu.' : 'Verifikasi belum siap atau belum diisi.');
      },
      destroy() {
        destroyed = true;
        generation++;
        removeWidget();
        refreshButton?.removeEventListener('click', onRefresh);
        resizeObserver?.disconnect();
        tokenInput.remove();
      }
    };
  }

  window.BillingLoginVerification = { create };
})();
