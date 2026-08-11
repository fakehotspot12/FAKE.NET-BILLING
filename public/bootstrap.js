(() => {
  'use strict';

  const app = document.getElementById('app');
  if (!app) return;

  const authHintKey = 'fakenetAuthHint';
  const appVersion = '__FAKENET_APP_VERSION__';
  const assetRevision = 'compact-mobile-rows-20260811';
  const appScriptUrl = `/app.js?v=fakenet-billing-${appVersion}&ui=${assetRevision}`;
  const appStyleUrl = `/styles.css?v=fakenet-billing-${appVersion}&ui=${assetRevision}`;
  const defaultBranding = {
    businessName: document.title || 'FAKE.NET',
    appSubtitle: 'Internet Murah Dirumah',
    logoUrl: document.getElementById('appFavicon')?.getAttribute('href') || '/fakenet-logo.png',
    copyrightYear: new Date().getFullYear(),
    copyrightName: document.title || 'FAKE.NET',
    appVersion,
    releaseDate: '__FAKENET_RELEASE_DATE__',
    loginVerificationEnabled: false
  };
  let branding = { ...defaultBranding };
  let applicationLoading = false;

  function escapeHtml(value = '') {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function errorText(payload = {}, fallback = 'Request gagal') {
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
    return fallback;
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      cache: 'no-store',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(errorText(payload, `HTTP ${response.status}`));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function normalizedBranding(payload = {}) {
    const source = payload.branding && typeof payload.branding === 'object'
      ? payload.branding
      : (payload.settings && typeof payload.settings === 'object' ? payload.settings : payload);
    return {
      ...branding,
      ...source,
      logoUrl: source.logoUrl || branding.logoUrl,
      businessName: source.businessName || branding.businessName,
      appSubtitle: source.appSubtitle || branding.appSubtitle,
      appVersion: source.appVersion || source.appInfo?.version || branding.appVersion,
      releaseDate: source.releaseDate || source.appInfo?.releaseDate || branding.releaseDate,
      loginVerificationEnabled: source.loginVerificationEnabled !== false
    };
  }

  function applyBranding(payload = {}) {
    branding = normalizedBranding(payload);
    document.title = branding.businessName;
    const favicon = document.getElementById('appFavicon');
    const appleIcon = document.getElementById('appleTouchIcon');
    if (favicon) favicon.href = branding.logoUrl;
    if (appleIcon) appleIcon.href = branding.logoUrl;
  }

  function brandMarkup() {
    return `<div class="boot-brand">
      <img src="${escapeHtml(branding.logoUrl)}" alt="Logo ${escapeHtml(branding.businessName)}">
      <div>
        <strong>${escapeHtml(branding.businessName)}</strong>
        <span>${escapeHtml(branding.appSubtitle)}</span>
      </div>
    </div>`;
  }

  function showDashboardSkeleton() {
    document.body.classList.add('is-loading-auth');
    document.body.classList.remove('is-bootstrap-login', 'is-login');
    app.innerHTML = '<div class="boot-app-pending" aria-hidden="true"></div>';
  }

  function verificationMarkup() {
    if (!branding.loginVerificationEnabled) return '';
    return `<label class="boot-field">
      <span>Kode Verifikasi</span>
      <span class="boot-verification-row">
        <span class="boot-verification-image" id="bootVerificationImage">Memuat kode...</span>
        <button class="boot-secondary-button" id="bootRefreshVerification" type="button">Refresh</button>
      </span>
      <input name="verificationId" type="hidden">
      <input name="verificationCode" autocomplete="off" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Masukkan kode" required>
    </label>`;
  }

  function showLogin(message = '', error = false) {
    document.body.classList.remove('is-loading-auth');
    document.body.classList.add('is-bootstrap-login', 'is-login');
    app.innerHTML = `<section class="fakenet-boot boot-login-screen">
      <div class="boot-login-card">
        ${brandMarkup()}
        <form class="boot-login-form" id="bootLoginForm">
          <label class="boot-field">
            <span>Username</span>
            <input name="username" autocomplete="username" required autofocus>
          </label>
          <label class="boot-field">
            <span>Password</span>
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          ${verificationMarkup()}
          <p class="boot-message ${error ? 'is-error' : ''}" id="bootLoginMessage" role="status">${escapeHtml(message)}</p>
          <button class="boot-button" type="submit">Masuk</button>
          <div class="boot-release">
            <strong>Copyright ${escapeHtml(branding.copyrightYear)} - ${escapeHtml(branding.copyrightName || branding.businessName)}</strong>
            <span>Versi ${escapeHtml(branding.appVersion)}</span>
          </div>
        </form>
        <a class="boot-login-info" href="/public-info.html" target="_blank" rel="noopener">
          <strong>Informasi Layanan &amp; Pembelian</strong>
          <small>Produk, cara transaksi, S&amp;K, dan kontak CS</small>
        </a>
      </div>
    </section>`;

    document.getElementById('bootRefreshVerification')?.addEventListener('click', refreshVerification);
    document.getElementById('bootLoginForm')?.addEventListener('submit', submitLogin);
    if (branding.loginVerificationEnabled) refreshVerification();
  }

  function setLoginMessage(message = '', error = false) {
    const node = document.getElementById('bootLoginMessage');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-error', error);
  }

  async function refreshVerification() {
    const imageBox = document.getElementById('bootVerificationImage');
    const hidden = document.querySelector('#bootLoginForm input[name="verificationId"]');
    const codeInput = document.querySelector('#bootLoginForm input[name="verificationCode"]');
    if (imageBox) imageBox.textContent = 'Memuat kode...';
    try {
      const payload = await request('/api/auth/verification-code');
      const verification = payload.verification || {};
      if (hidden) hidden.value = verification.id || '';
      if (codeInput) codeInput.value = '';
      if (imageBox) {
        imageBox.replaceChildren();
        if (verification.image) {
          const image = document.createElement('img');
          image.src = verification.image;
          image.alt = 'Kode verifikasi';
          imageBox.appendChild(image);
        } else {
          imageBox.textContent = 'Kode tidak tersedia';
        }
      }
    } catch {
      if (hidden) hidden.value = '';
      if (imageBox) imageBox.textContent = 'Kode gagal dimuat';
    }
  }

  function formPayload(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function submitLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const payload = formPayload(form);
    if (branding.loginVerificationEnabled && !String(payload.verificationId || '').trim()) {
      await refreshVerification();
      setLoginMessage('Kode verifikasi belum siap. Masukkan kode yang baru tampil.', true);
      return;
    }
    if (payload.verificationCode) payload.verificationCode = String(payload.verificationCode).replace(/\s+/g, '');
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Memproses...';
      }
      setLoginMessage('Memverifikasi akun...');
      const authPayload = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      localStorage.setItem(authHintKey, '1');
      applyBranding(authPayload);
      await loadApplication(authPayload);
    } catch (error) {
      if (error.status === 423) {
        await loadApplication(null);
        return;
      }
      setLoginMessage(error.message || 'Login gagal', true);
      if (button) {
        button.disabled = false;
        button.textContent = 'Masuk';
      }
      if (branding.loginVerificationEnabled) refreshVerification();
    }
  }

  function preloadApplicationScript() {
    if (document.getElementById('fakenetAppPreload')) return;
    const preload = document.createElement('link');
    preload.id = 'fakenetAppPreload';
    preload.rel = 'preload';
    preload.as = 'script';
    preload.href = appScriptUrl;
    document.head.appendChild(preload);
  }

  function loadApplicationStyle() {
    return new Promise((resolve, reject) => {
      const existing = document.getElementById('fakenetAppStyle');
      if (existing) {
        if (existing.sheet) resolve();
        else existing.addEventListener('load', resolve, { once: true });
        return;
      }
      const stylesheet = document.createElement('link');
      stylesheet.id = 'fakenetAppStyle';
      stylesheet.rel = 'stylesheet';
      stylesheet.href = appStyleUrl;
      stylesheet.addEventListener('load', resolve, { once: true });
      stylesheet.addEventListener('error', () => reject(new Error('Stylesheet aplikasi gagal dimuat')), { once: true });
      document.head.appendChild(stylesheet);
    });
  }

  function loadApplicationScript() {
    return new Promise((resolve, reject) => {
      if (document.getElementById('fakenetAppScript')) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.id = 'fakenetAppScript';
      script.src = appScriptUrl;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('Aplikasi gagal dimuat')), { once: true });
      document.body.appendChild(script);
    });
  }

  async function loadApplication(authPayload = null) {
    if (applicationLoading) return;
    applicationLoading = true;
    if (authPayload?.user) window.__FAKENET_BOOTSTRAP_AUTH__ = authPayload;
    showDashboardSkeleton();
    preloadApplicationScript();
    try {
      await loadApplicationStyle();
      await loadApplicationScript();
    } catch (error) {
      applicationLoading = false;
      showLogin(error.message || 'Aplikasi gagal dimuat. Silakan muat ulang.', true);
    }
  }

  async function start() {
    const hintedAuthenticated = localStorage.getItem(authHintKey) === '1';
    if (hintedAuthenticated) showDashboardSkeleton();

    const brandingRequest = request('/api/branding')
      .then((payload) => {
        applyBranding(payload);
        if (!hintedAuthenticated && document.getElementById('bootLoginForm')) showLogin();
        return payload;
      })
      .catch(() => null);

    try {
      const authPayload = await request('/api/auth/me');
      localStorage.setItem(authHintKey, '1');
      applyBranding(authPayload);
      await loadApplication(authPayload);
    } catch (error) {
      if (error.status === 423) {
        await loadApplication(null);
        return;
      }
      localStorage.removeItem(authHintKey);
      await brandingRequest;
      showLogin(error.status && error.status !== 401 ? error.message : '');
    }
  }

  start();
})();
