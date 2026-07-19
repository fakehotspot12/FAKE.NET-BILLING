'use strict';

const ORDER_PAGE = 'order-voucher.html';
const BUY_PAGE = 'buy.html';
const STATUS_PAGE = 'status-order.html';

let storefront = null;
let pollTimer = null;
const voucherCheckoutCache = new Map();
const voucherCheckoutRequests = new Map();
const voucherCheckoutFailures = new Map();
let voucherAutoLoginTimer = null;

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
        const result = await api('/api/public/hotspot-voucher-orders', {
          method: 'POST',
          body: JSON.stringify({
            profileId: item.id,
            buyerName: byId('v_nama')?.value || '',
            whatsapp: byId('v_whatsapp')?.value || '',
            paymentMethod: byId('v_rek')?.value || 'qris',
            nasId: item.nasId || storefront?.nasContext?.id || '',
            quantity: 1
          })
        });
        const orderNo = result.order?.reference || result.order?.id || '';
        markVoucherAutoLogin(orderNo);
        window.location.href = pageUrl(STATUS_PAGE, { id: orderNo });
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

function orderStatusLabel(status = '') {
  const value = String(status || '').toLowerCase();
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
  return String(order.status || '').toLowerCase() === 'pending';
}

function renderVoucherCheckout(order = {}, checkout = {}) {
  const qrBox = byId('os_qris_img');
  const instruction = byId('os_instruksi_pembayaran');
  const qrUrl = safeHttpUrl(checkout.qrUrl || '');
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
  if (voucherCheckoutCache.has(reference)) return voucherCheckoutCache.get(reference);
  if (voucherCheckoutRequests.has(reference)) return voucherCheckoutRequests.get(reference);
  const request = api(`/api/public/hotspot-voucher-orders/${encodeURIComponent(reference)}/checkout`, {
    method: 'POST',
    body: JSON.stringify({})
  }).then((payload) => {
    if (payload.paid) return { paid: true };
    const checkout = payload.checkout || {};
    if (!(checkout.qrUrl || checkout.qrString || checkout.checkoutUrl || checkout.paymentUrl)) {
      throw new Error('Payment Gateway belum mengembalikan QRIS');
    }
    voucherCheckoutCache.set(reference, checkout);
    voucherCheckoutFailures.delete(reference);
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
    voucherCheckoutFailures.set(order.reference || order.id || '', error.message || 'Checkout QRIS gagal disiapkan');
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
  const cached = voucherCheckoutCache.get(order.reference || order.id || '');
  const failure = voucherCheckoutFailures.get(order.reference || order.id || '');
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
  if (!reference || !destination || voucherAutoLoginState(reference) !== 'pending') return;
  setVoucherAutoLoginState(reference, 'started');
  window.clearTimeout(voucherAutoLoginTimer);
  setResponse('Pembayaran berhasil. Voucher siap, menghubungkan ke Hotspot...', 'success');
  voucherAutoLoginTimer = window.setTimeout(() => {
    window.location.replace(destination);
  }, 1200);
}

function renderVoucherInfo(order = {}) {
  const paid = String(order.status || '').toLowerCase() === 'paid';
  const vouchers = Array.isArray(order.vouchers) ? order.vouchers : [];
  show('info_voucher', paid && vouchers.length > 0);
  if (!paid || !vouchers.length) return;
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
    login.hidden = !destination;
    login.onclick = destination ? null : (event) => event.preventDefault();
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
  setField('os_status', orderStatusLabel(order.status));
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
    const result = await api(`/api/public/hotspot-voucher-orders/${encodeURIComponent(orderNo)}`);
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
