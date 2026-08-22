'use strict';

const ORDER_PAGE = 'order-voucher.html';
const BUY_PAGE = 'buy.html';
const STATUS_PAGE = 'status-order.html';
let voucherOrderAccessToken = new URLSearchParams(window.location.search).get('access_token') || '';

let storefront = null;
let pollTimer = null;
const voucherCheckoutCache = new Map();
const voucherCheckoutRequests = new Map();
const voucherCheckoutFailures = new Map();
let voucherAutoLoginTimer = null;
const VOUCHER_CHECKOUT_CACHE_TTL_MS = 10 * 60 * 1000;
const VOUCHER_CHECKOUT_CACHE_MAX_ENTRIES = 50;

function pruneVoucherCheckoutMaps(now = Date.now()) {
  for (const [reference, entry] of voucherCheckoutCache.entries()) {
    if (!entry || now - Number(entry.time || 0) >= VOUCHER_CHECKOUT_CACHE_TTL_MS) {
      voucherCheckoutCache.delete(reference);
    }
  }
  for (const [reference, entry] of voucherCheckoutFailures.entries()) {
    if (!entry || now - Number(entry.time || 0) >= VOUCHER_CHECKOUT_CACHE_TTL_MS) {
      voucherCheckoutFailures.delete(reference);
    }
  }
  while (voucherCheckoutCache.size > VOUCHER_CHECKOUT_CACHE_MAX_ENTRIES) {
    voucherCheckoutCache.delete(voucherCheckoutCache.keys().next().value);
  }
  while (voucherCheckoutFailures.size > VOUCHER_CHECKOUT_CACHE_MAX_ENTRIES) {
    voucherCheckoutFailures.delete(voucherCheckoutFailures.keys().next().value);
  }
}

function cachedVoucherCheckout(reference = '') {
  pruneVoucherCheckoutMaps();
  const entry = reference ? voucherCheckoutCache.get(reference) : null;
  return entry ? entry.value : null;
}

function cachedVoucherCheckoutFailure(reference = '') {
  pruneVoucherCheckoutMaps();
  const entry = reference ? voucherCheckoutFailures.get(reference) : null;
  return entry ? entry.message : '';
}

function currentNasValue() {
  const params = new URLSearchParams(window.location.search);
  return params.get('nas') || params.get('nasId') || params.get('site') || params.get('siteId') || params.get('router') || '';
}

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function rupiah(value) {
  return `Rp ${Math.round(Number(value || 0)).toLocaleString('id-ID')}`;
}

function voucherPhoneDigits(value = '') {
  return String(value || '').trim().replace(/^'/, '').replace(/\D/g, '');
}

function validVoucherWhatsapp(value = '') {
  const digits = voucherPhoneDigits(value);
  if (!digits) return false;
  const normalized = digits.startsWith('62')
    ? digits
    : digits.startsWith('0')
      ? `62${digits.slice(1)}`
      : digits.startsWith('8')
        ? `62${digits}`
        : digits;
  return /^628\d{7,12}$/.test(normalized);
}

function pageUrl(file, params = {}) {
  const url = new URL(file, window.location.href);
  const current = new URLSearchParams(window.location.search);
  const context = {
    nas: currentNasValue(),
    return: current.get('return') || current.get('returnUrl') || ''
  };
  Object.entries({ ...context, ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  return `${url.pathname}${url.search}`;
}

function safeHttpUrl(value = '') {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function safeQrImageUrl(value = '') {
  const raw = String(value || '').trim();
  if (/^data:image\/(?:png|gif|jpe?g|webp|svg\+xml);base64,/i.test(raw)) return raw;
  return safeHttpUrl(raw);
}

function voucherReturnStorageKey() {
  const nas = currentNasValue() || 'default';
  return `fakenet-voucher-return:${nas}`;
}

function voucherAutoLoginStorageKey(reference = '') {
  return `fakenet-voucher-autologin:${String(reference || '').trim()}`;
}

function markVoucherAutoLogin(reference = '') {
  if (!reference) return;
  try {
    window.sessionStorage?.setItem(voucherAutoLoginStorageKey(reference), 'pending');
  } catch {
    // Browser privacy mode can disable session storage; manual login remains available.
  }
}

function voucherAutoLoginState(reference = '') {
  try {
    return window.sessionStorage?.getItem(voucherAutoLoginStorageKey(reference)) || '';
  } catch {
    return '';
  }
}

function setVoucherAutoLoginState(reference = '', state = '') {
  try {
    window.sessionStorage?.setItem(voucherAutoLoginStorageKey(reference), state);
  } catch {
    // Manual login remains available.
  }
}

function hotspotVoucherLoginUrl(baseUrl = '', voucher = {}) {
  const username = String(voucher.username || '').trim();
  const password = String(voucher.password || voucher.voucherPassword || username).trim();
  const safeUrl = safeHttpUrl(baseUrl);
  if (!safeUrl || !username) return '';
  try {
    const url = new URL(safeUrl);
    if (!url.pathname || url.pathname === '/') url.pathname = '/login';
    url.search = '';
    url.hash = new URLSearchParams({ fnb_autologin: '1', username, password }).toString();
    return url.toString();
  } catch {
    return '';
  }
}

function hotspotLoginReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  const explicit = safeHttpUrl(params.get('return') || params.get('returnUrl') || '');
  if (explicit) {
    window.sessionStorage?.setItem(voucherReturnStorageKey(), explicit);
    return explicit;
  }
  const stored = safeHttpUrl(window.sessionStorage?.getItem(voucherReturnStorageKey()) || '');
  if (stored) return stored;
  const referrer = safeHttpUrl(document.referrer || '');
  if (referrer && new URL(referrer).origin !== window.location.origin && currentPage() === 'order') {
    window.sessionStorage?.setItem(voucherReturnStorageKey(), referrer);
    return referrer;
  }
  return safeHttpUrl(storefront?.loginUrl || '');
}

function configureVoucherNavigation() {
  const pages = { order: ORDER_PAGE, status: STATUS_PAGE, buy: BUY_PAGE };
  document.querySelectorAll('[data-voucher-nav]').forEach((link) => {
    const target = pages[link.dataset.voucherNav];
    if (target) link.href = pageUrl(target);
  });
  const loginUrl = hotspotLoginReturnUrl();
  document.querySelectorAll('[data-voucher-login]').forEach((link) => {
    link.href = loginUrl || '#';
    link.onclick = loginUrl ? null : (event) => {
      event.preventDefault();
      window.history.back();
    };
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Request gagal diproses');
  }
  return data;
}

function setTitle(value = 'Beli Voucher Online') {
  const title = value || 'Beli Voucher Online';
  document.title = title;
  if (byId('title')) byId('title').textContent = title;
  if (byId('pageTitle')) byId('pageTitle').textContent = title;
}

function applyStorefrontBranding() {
  if (storefront?.logoUrl && byId('appFavicon')) {
    byId('appFavicon').href = storefront.logoUrl;
  }
}

function setResponse(message = '', tone = '') {
  const el = byId('info_response') || byId('buy_response');
  if (!el) return;
  el.hidden = !message;
  el.className = `response-box ${tone}`.trim();
  el.textContent = message;
}

function show(id, visible) {
  const el = byId(id);
  if (el) el.hidden = !visible;
}

async function loadStorefront() {
  if (storefront) return storefront;
  const nas = currentNasValue();
  storefront = await api(`/api/public/hotspot-voucher-online${nas ? `?nas=${encodeURIComponent(nas)}` : ''}`);
  return storefront;
}

function renderStorefrontSiteContext() {
  const list = byId('list_paket');
  if (!list) return;
  let panel = byId('voucher_site_context');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'voucher_site_context';
    list.before(panel);
  }
  const context = storefront?.nasContext;
  const sites = Array.isArray(storefront?.sites) ? storefront.sites : [];
  if (context) {
    panel.className = 'voucher-site-context is-selected';
    panel.innerHTML = `<span>Site Hotspot</span><strong>${escapeHtml(context.name || context.id || '-')}</strong>`;
    panel.hidden = false;
    return;
  }
  if (!sites.length) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.className = 'voucher-site-context';
  panel.innerHTML = `
    <label for="voucher_site_select">Pilih site hotspot</label>
    <select id="voucher_site_select" class="form-control">
      <option value="">Pilih site</option>
      ${sites.map((site) => `<option value="${escapeHtml(site.id || '')}">${escapeHtml(site.name || site.id || '-')}</option>`).join('')}
    </select>
  `;
  panel.hidden = false;
  byId('voucher_site_select')?.addEventListener('change', (event) => {
    const nas = event.target.value || '';
    if (nas) window.location.href = pageUrl(ORDER_PAGE, { nas });
  });
}

function packageInfo(item = {}) {
  return [item.validity, item.quota].filter(Boolean).join(' / ') || 'Voucher Hotspot';
}

function packagePrice(item = {}) {
  if (storefront?.showPrice === false) return '';
  return item.priceText || rupiah(item.price);
}

function renderOrderPackages() {
  const list = byId('list_paket');
  if (!list) return;
  const packages = storefront?.packages || [];
  renderStorefrontSiteContext();
  if (!storefront?.enabled) {
    list.innerHTML = '';
    setResponse('Channel voucher online belum aktif.', 'warning');
    return;
  }
  if (storefront?.nasRequired) {
    list.innerHTML = '';
    setResponse(
      storefront.invalidNas
        ? 'Site hotspot pada tautan tidak dikenali. Pilih site yang tersedia.'
        : 'Pilih site hotspot untuk melihat paket voucher yang tersedia.',
      'warning'
    );
    return;
  }
  if (!packages.length) {
    list.innerHTML = '';
    setResponse('Belum ada paket voucher yang dijual online.', 'warning');
    return;
  }
  setResponse(storefront.paymentGatewayEnabled ? '' : 'Payment Gateway QRIS belum aktif. Hubungi admin.', storefront.paymentGatewayEnabled ? '' : 'warning');
  list.innerHTML = packages.map((item) => `
    <div class="col-6 package-col">
      <a class="voucher-product-card" href="${escapeHtml(pageUrl(BUY_PAGE, {
        paket: item.id,
        nas: item.nasId || storefront?.nasContext?.id || ''
      }))}">
        <span class="voucher-product-name">${escapeHtml(item.label || item.name || 'Voucher')}</span>
        <span class="voucher-product-info">${escapeHtml(packageInfo(item))}</span>
        ${packagePrice(item) ? `<strong>${escapeHtml(packagePrice(item))}</strong>` : ''}
        <em>Beli</em>
      </a>
    </div>
  `).join('');
}

async function initOrderPage() {
  try {
    await loadStorefront();
    applyStorefrontBranding();
    configureVoucherNavigation();
    setTitle(storefront.title || 'Beli Voucher Online');
    renderOrderPackages();
  } catch (error) {
    setResponse(error.message, 'error');
  }
}

function selectedPackageFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const profileId = params.get('paket') || params.get('profile') || params.get('profileId') || params.get('id') || '';
  return (storefront?.packages || []).find((item) => String(item.id) === String(profileId));
}

function renderPaymentMethods() {
  const select = byId('v_rek');
  if (!select) return;
  const methods = storefront?.paymentMethods?.length ? storefront.paymentMethods : [{ id: 'qris', label: 'QRIS' }];
  select.innerHTML = methods.map((method) => `
    <option value="${escapeHtml(method.id || 'qris')}">${escapeHtml(method.label || method.name || 'QRIS')}</option>
  `).join('');
}

function renderBuyPackage(item = {}) {
  if (byId('v_paket')) byId('v_paket').value = item.id || '';
  if (byId('produk_info_name')) byId('produk_info_name').textContent = item.label || item.name || '-';
  if (byId('produk_info_validity')) byId('produk_info_validity').textContent = packageInfo(item);
  if (byId('produk_info_price')) byId('produk_info_price').textContent = packagePrice(item) || '-';
}

async function initBuyPage() {
  try {
    await loadStorefront();
    applyStorefrontBranding();
    configureVoucherNavigation();
    setTitle('Order Voucher');
    renderPaymentMethods();
    const item = selectedPackageFromQuery();
    if (!storefront.enabled) {
      show('paket_detail', false);
      setResponse('Channel voucher online belum aktif.', 'warning');
      return;
    }
    if (!item) {
      show('paket_detail', false);
      setResponse('Paket voucher tidak ditemukan. Silakan pilih ulang paket voucher.', 'error');
      return;
    }
    renderBuyPackage(item);
    const form = byId('form_order');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = byId('btn_beli');
      if (button) button.disabled = true;
      setResponse('');
      try {
        const whatsapp = byId('v_whatsapp')?.value || '';
        if (!validVoucherWhatsapp(whatsapp)) {
          throw new Error('Nomor WhatsApp tidak valid. Gunakan format 08xxxxxxxxxx.');
        }
        const result = await api('/api/public/hotspot-voucher-orders', {
          method: 'POST',
          body: JSON.stringify({
            profileId: item.id,
            buyerName: byId('v_nama')?.value || '',
            whatsapp,
            paymentMethod: byId('v_rek')?.value || 'qris',
            nasId: item.nasId || storefront?.nasContext?.id || '',
            quantity: 1
          })
        });
        const orderNo = result.order?.id || result.order?.reference || '';
        voucherOrderAccessToken = result.order?.accessToken || '';
        markVoucherAutoLogin(orderNo);
        window.location.href = pageUrl(STATUS_PAGE, {
          id: orderNo,
          auto: '1',
          ...(voucherOrderAccessToken ? { access_token: voucherOrderAccessToken } : {})
        });
      } catch (error) {
        setResponse(error.message, 'error');
      } finally {
        if (button) button.disabled = false;
      }
    });
  } catch (error) {
    setResponse(error.message, 'error');
  }
}

function voucherOrderExpired(order = {}) {
  const params = new URLSearchParams(window.location.search);
  if (['expired', '1', 'true'].includes(String(params.get('status') || params.get('expired') || '').toLowerCase())) return true;
  if (order.expired === true || order.voucherExpired === true) return true;
  const value = String(order.status || '').toLowerCase();
  if (value === 'expired') return true;
  const vouchers = Array.isArray(order.vouchers) ? order.vouchers : [];
  return value === 'paid' && vouchers.length > 0 && vouchers.every((voucher) => {
    const status = String(voucher.status || '').toLowerCase();
    if (['expired', 'terminate', 'terminated', 'removed'].includes(status)) return true;
    if (voucher.voucherExpiredAt || voucher.expiredAt) return true;
    const validUntil = Date.parse(voucher.validUntil || '');
    return Number.isFinite(validUntil) && validUntil <= Date.now();
  });
}

function orderStatusLabel(status = '', order = {}) {
  const value = String(status || '').toLowerCase();
  if (voucherOrderExpired(order)) return 'EXPIRED';
  if (value === 'paid') return 'PAID';
  if (value === 'cancelled' || value === 'canceled') return 'CANCELLED';
  if (value === 'expired') return 'EXPIRED';
  return 'PENDING';
}

function setField(id, value = '') {
  const el = byId(id);
  if (el) el.textContent = value || '-';
}

function voucherOrderIsPayable(order = {}) {
  return !voucherOrderExpired(order) && String(order.status || '').toLowerCase() === 'pending';
}

function renderVoucherCheckout(order = {}, checkout = {}) {
  const qrBox = byId('os_qris_img');
  const instruction = byId('os_instruksi_pembayaran');
  const qrUrl = safeQrImageUrl(checkout.qrUrl || '');
  const checkoutUrl = safeHttpUrl(checkout.checkoutUrl || checkout.paymentUrl || '');
  const baseText = order.amountText || rupiah(order.amount);
  const feeText = order.adminFeeText || rupiah(order.adminFee || 0);
  const totalText = order.gatewayAmountText || rupiah(order.gatewayAmount || order.totalAmount || order.amount);
  if (qrBox) {
    qrBox.innerHTML = qrUrl
      ? `<div class="qris-box voucher-qris-box">
          <img class="voucher-qris-code" src="${escapeHtml(qrUrl)}" alt="QRIS ${escapeHtml(order.reference || order.id || '')}">
          <strong>${escapeHtml(totalText)}</strong>
          <small>No. Order ${escapeHtml(order.reference || order.id || '-')}</small>
        </div>`
      : `<div class="qris-box voucher-qris-box is-fallback">
          <strong>QRIS</strong>
          <span>${escapeHtml(totalText)}</span>
          <small>Buka halaman pembayaran untuk menampilkan QRIS.</small>
        </div>`;
  }
  if (instruction) {
    instruction.innerHTML = `
      Biaya: <b>${escapeHtml(baseText)}</b><br>
      Fee: <b>${escapeHtml(feeText)}</b><br>
      Total bayar: <b>${escapeHtml(totalText)}</b><br>
      Scan QRIS di atas. Voucher dibuat otomatis setelah pembayaran berhasil.
      ${checkoutUrl ? `<br><br><a class="w-12 btn-md bg-success" href="${escapeHtml(checkoutUrl)}">Buka Pembayaran</a>` : ''}
    `;
  }
}

function renderVoucherCheckoutError(order = {}, message = '') {
  const qrBox = byId('os_qris_img');
  const instruction = byId('os_instruksi_pembayaran');
  if (qrBox) {
    qrBox.innerHTML = `<div class="qris-box voucher-qris-box is-error"><strong>QRIS belum tersedia</strong><small>${escapeHtml(message || 'Checkout gagal disiapkan')}</small></div>`;
  }
  if (instruction) {
    instruction.innerHTML = '<button class="w-12 btn-md bg-success" type="button" id="os_retry_checkout">Coba Lagi</button>';
    byId('os_retry_checkout')?.addEventListener('click', () => ensureVoucherCheckout(order, true));
  }
}

async function voucherCheckout(order = {}, force = false) {
  const reference = order.reference || order.id || '';
  if (!reference) throw new Error('Nomor order tidak tersedia');
  if (force) {
    voucherCheckoutCache.delete(reference);
    voucherCheckoutRequests.delete(reference);
    voucherCheckoutFailures.delete(reference);
  }
  const cached = cachedVoucherCheckout(reference);
  if (cached) return cached;
  if (voucherCheckoutRequests.has(reference)) return voucherCheckoutRequests.get(reference);
  const accessQuery = voucherOrderAccessToken ? `?access_token=${encodeURIComponent(voucherOrderAccessToken)}` : '';
  const request = api(`/api/public/hotspot-voucher-orders/${encodeURIComponent(reference)}/checkout${accessQuery}`, {
    method: 'POST',
    body: JSON.stringify({})
  }).then((payload) => {
    if (payload.paid) return { paid: true };
    const checkout = payload.checkout || {};
    if (!(checkout.qrUrl || checkout.qrString || checkout.checkoutUrl || checkout.paymentUrl)) {
      throw new Error('Payment Gateway belum mengembalikan QRIS');
    }
    voucherCheckoutCache.set(reference, { time: Date.now(), value: checkout });
    voucherCheckoutFailures.delete(reference);
    pruneVoucherCheckoutMaps();
    return checkout;
  }).finally(() => voucherCheckoutRequests.delete(reference));
  voucherCheckoutRequests.set(reference, request);
  return request;
}

async function ensureVoucherCheckout(order = {}, force = false) {
  if (!voucherOrderIsPayable(order)) return;
  try {
    const checkout = await voucherCheckout(order, force);
    if (checkout.paid) {
      await loadOrderStatus(order.reference || order.id || '', true);
      return;
    }
    renderVoucherCheckout(order, checkout);
  } catch (error) {
    voucherCheckoutFailures.set(order.reference || order.id || '', {
      time: Date.now(),
      message: error.message || 'Checkout QRIS gagal disiapkan'
    });
    pruneVoucherCheckoutMaps();
    renderVoucherCheckoutError(order, error.message);
  }
}

function renderPaymentInfo(order = {}) {
  const payable = voucherOrderIsPayable(order);
  show('info_pembayaran', payable);
  if (!payable) return;
  setField('os_metode_pembayaran', order.paymentMethod || 'QRIS');
  const totalText = order.gatewayAmountText || rupiah(order.gatewayAmount || order.totalAmount || order.amount);
  const qrBox = byId('os_qris_img');
  if (qrBox) {
    qrBox.innerHTML = `
      <div class="qris-box voucher-qris-box is-loading">
        <strong>Menyiapkan QRIS</strong>
        <span>${escapeHtml(totalText)}</span>
        <small>No. Order ${escapeHtml(order.reference || order.id || '-')}</small>
      </div>
    `;
  }
  const instruction = byId('os_instruksi_pembayaran');
  if (instruction) instruction.textContent = 'QRIS sedang disiapkan...';
  const reference = order.reference || order.id || '';
  const cached = cachedVoucherCheckout(reference);
  const failure = cachedVoucherCheckoutFailure(reference);
  if (cached) renderVoucherCheckout(order, cached);
  else if (failure) renderVoucherCheckoutError(order, failure);
  else ensureVoucherCheckout(order);
}

function voucherLoginDestination(order = {}) {
  const voucher = Array.isArray(order.vouchers) ? order.vouchers[0] : null;
  return voucher ? hotspotVoucherLoginUrl(order.hotspotLoginUrl, voucher) : '';
}

function tryVoucherAutoLogin(order = {}) {
  const reference = order.reference || order.id || '';
  const destination = voucherLoginDestination(order);
  const params = new URLSearchParams(window.location.search);
  const autoRequested = params.get('auto') === '1' || params.get('login') === '1';
  if (!reference || !destination || voucherOrderExpired(order)) return;
  if (voucherAutoLoginState(reference) !== 'pending' && !autoRequested) return;
  setVoucherAutoLoginState(reference, 'started');
  window.clearTimeout(voucherAutoLoginTimer);
  setResponse('Pembayaran berhasil. Voucher siap, menghubungkan ke Hotspot...', 'success');
  voucherAutoLoginTimer = window.setTimeout(() => {
    window.location.replace(destination);
  }, 1200);
}

function renderVoucherInfo(order = {}) {
  const paid = String(order.status || '').toLowerCase() === 'paid';
  const expired = voucherOrderExpired(order);
  const vouchers = Array.isArray(order.vouchers) ? order.vouchers : [];
  show('info_voucher', (paid || expired) && vouchers.length > 0);
  if ((!paid && !expired) || !vouchers.length) return;
  const code = byId('os_voucher_kode');
  const password = byId('os_voucher_password');
  if (code) {
    code.innerHTML = vouchers.map((voucher) => `<div class="voucher-line"><b>${escapeHtml(voucher.username || '-')}</b></div>`).join('');
  }
  if (password) {
    password.innerHTML = vouchers.map((voucher) => `<div class="voucher-line"><b>${escapeHtml(voucher.password || '-')}</b></div>`).join('');
  }
  const login = byId('os_link_login');
  if (login) {
    const destination = voucherLoginDestination(order);
    login.href = destination || '#';
    login.hidden = expired || !destination;
    login.onclick = destination ? null : (event) => event.preventDefault();
  }
  if (expired) {
    setResponse('Voucher sudah expired. Silakan beli voucher baru bila masa aktif sudah habis.', 'warning');
    return;
  }
  tryVoucherAutoLogin(order);
}

function renderOrderStatus(order = {}) {
  show('info_status_check', false);
  show('info_status', true);
  setField('os_nomor', order.reference || order.id || '-');
  setField('os_pelanggan', order.buyerName || '-');
  setField('os_whatsapp', order.whatsapp || '-');
  setField('os_paket', `${order.packageLabel || '-'}${order.quantity ? ` x${order.quantity}` : ''}`);
  setField('os_status', orderStatusLabel(order.status, order));
  renderPaymentInfo(order);
  renderVoucherInfo(order);
  const copy = byId('os_nomor_click');
  copy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(order.reference || order.id || '');
      setResponse('No. Order berhasil disalin.');
    } catch {
      setResponse('No. Order: ' + (order.reference || order.id || ''));
    }
  }, { once: true });
}

async function loadOrderStatus(orderNo, silent = false) {
  window.clearTimeout(pollTimer);
  if (!orderNo) {
    show('info_status_check', true);
    show('info_status', false);
    show('info_pembayaran', false);
    show('info_voucher', false);
    return;
  }
  try {
    const accessQuery = voucherOrderAccessToken ? `?access_token=${encodeURIComponent(voucherOrderAccessToken)}` : '';
    const result = await api(`/api/public/hotspot-voucher-orders/${encodeURIComponent(orderNo)}${accessQuery}`);
    setResponse('');
    renderOrderStatus(result.order);
    if (voucherOrderIsPayable(result.order)) {
      pollTimer = window.setTimeout(() => loadOrderStatus(orderNo, true), 5000);
    }
  } catch (error) {
    if (!silent) setResponse(error.message, 'error');
    show('info_status_check', true);
    show('info_status', false);
    show('info_pembayaran', false);
    show('info_voucher', false);
  }
}

async function initStatusPage() {
  setTitle('Cek Status Pemesanan');
  await loadStorefront().then(applyStorefrontBranding).catch(() => null);
  configureVoucherNavigation();
  const params = new URLSearchParams(window.location.search);
  const orderNo = params.get('id') || params.get('order') || params.get('reference') || '';
  const form = byId('statusCheckForm');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = byId('statusOrderInput')?.value?.trim() || '';
    if (value) window.location.href = pageUrl(STATUS_PAGE, { id: value });
  });
  if (byId('statusOrderInput')) byId('statusOrderInput').value = orderNo;
  await loadOrderStatus(orderNo);
}

function currentPage() {
  const explicit = document.body?.dataset?.page;
  if (explicit) return explicit;
  const path = window.location.pathname;
  if (path.endsWith('/buy.html') || path.endsWith('buy.html')) return 'buy';
  if (path.endsWith('/status-order.html') || path.endsWith('status-order.html')) return 'status';
  return 'order';
}

document.addEventListener('DOMContentLoaded', () => {
  configureVoucherNavigation();
  const page = currentPage();
  if (page === 'buy') initBuyPage();
  else if (page === 'status') initStatusPage();
  else initOrderPage();
});
