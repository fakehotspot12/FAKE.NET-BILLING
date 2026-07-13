'use strict';

const ORDER_PAGE = 'order-voucher.html';
const BUY_PAGE = 'buy.html';
const STATUS_PAGE = 'status-order.html';

let storefront = null;
let pollTimer = null;

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
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  return `${url.pathname}${url.search}`;
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
  storefront = await api('/api/public/hotspot-voucher-online');
  return storefront;
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
  if (!storefront?.enabled) {
    list.innerHTML = '';
    setResponse('Channel voucher online belum aktif.', 'warning');
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
      <a class="voucher-product-card" href="${escapeHtml(pageUrl(BUY_PAGE, { paket: item.id }))}">
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
            quantity: 1
          })
        });
        const orderNo = result.order?.reference || result.order?.id || '';
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

function renderPaymentInfo(order = {}) {
  show('info_pembayaran', order.status !== 'paid');
  setField('os_metode_pembayaran', order.paymentMethod || 'QRIS');
  const baseText = order.amountText || rupiah(order.amount);
  const feeText = order.adminFeeText || rupiah(order.adminFee || 0);
  const totalText = order.gatewayAmountText || rupiah(order.gatewayAmount || order.totalAmount || order.amount);
  const qrBox = byId('os_qris_img');
  if (qrBox) {
    qrBox.innerHTML = `
      <div class="qris-box">
        <strong>QRIS</strong>
        <span>${escapeHtml(totalText)}</span>
        <small>No. Order ${escapeHtml(order.reference || order.id || '-')}</small>
      </div>
    `;
  }
  const instruction = byId('os_instruksi_pembayaran');
  if (instruction) {
    instruction.innerHTML = `
      Biaya: <b>${escapeHtml(baseText)}</b><br>
      Adm. Fee: <b>${escapeHtml(feeText)}</b><br>
      Total bayar: <b>${escapeHtml(totalText)}</b><br>
      Gunakan No. Order <b>${escapeHtml(order.reference || order.id || '-')}</b> sebagai acuan pembayaran.
      Voucher akan tampil otomatis setelah status pembayaran berhasil.
      <br><br>
      <button class="w-12 btn-md bg-success" type="button" id="os_pay_gateway">Bayar via Payment Gateway</button>
    `;
    byId('os_pay_gateway')?.addEventListener('click', () => checkoutVoucher(order));
  }
}

async function checkoutVoucher(order = {}) {
  const reference = order.reference || order.id || '';
  if (!reference) return;
  const button = byId('os_pay_gateway');
  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Memuat gateway...';
    }
    const payload = await api(`/api/public/hotspot-voucher-orders/${encodeURIComponent(reference)}/checkout`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (payload.paid) {
      setResponse('Voucher sudah paid.');
      await loadOrderStatus(reference, true);
      return;
    }
    const checkout = payload.checkout || {};
    const url = checkout.checkoutUrl || checkout.paymentUrl || '';
    if (!url) throw new Error('Payment Gateway belum mengembalikan checkout URL');
    window.location.href = url;
  } catch (error) {
    setResponse(error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Bayar via Payment Gateway';
    }
  }
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
  if (login) login.href = 'login';
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
    if (String(result.order?.status || '').toLowerCase() !== 'paid') {
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
  const page = currentPage();
  if (page === 'buy') initBuyPage();
  else if (page === 'status') initStatusPage();
  else initOrderPage();
});
