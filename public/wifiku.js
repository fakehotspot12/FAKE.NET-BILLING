'use strict';

const TOKEN_KEY = 'wifikuToken';
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const state = {
  settings: {},
  challengeId: '',
  phone: '',
  token: localStorage.getItem(TOKEN_KEY) || '',
  portal: null
};

const byId = (id) => document.getElementById(id);

function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function todayPeriod() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function toast(message) {
  const el = byId('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2500);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request gagal');
  }
  return payload;
}

function setLoading(form, loading) {
  form.querySelectorAll('button, input').forEach((node) => {
    node.disabled = loading;
  });
}

function showLogin() {
  byId('loginView').hidden = false;
  byId('portalView').hidden = true;
  byId('logoutButton').hidden = true;
  byId('accountMenuWrap').hidden = true;
  syncOtpFormVisibility(Boolean(state.challengeId));
}

function showPortal() {
  byId('loginView').hidden = true;
  byId('portalView').hidden = false;
  byId('logoutButton').hidden = false;
  byId('accountMenuWrap').hidden = false;
  state.challengeId = '';
  syncOtpFormVisibility(false);
}

function otpRequired() {
  return state.settings?.requireOtp !== false;
}

function syncOtpFormVisibility(showChallenge = false) {
  const otpForm = byId('otpForm');
  if (!otpForm) return;
  const enabled = otpRequired();
  const ready = enabled && Boolean(showChallenge);
  otpForm.hidden = !enabled;
  const input = byId('otpInput');
  const button = otpForm.querySelector('button[type="submit"]');
  if (input) {
    input.disabled = !ready;
    input.placeholder = ready ? 'Masukkan kode OTP' : 'Kirim OTP terlebih dahulu';
    if (!ready) input.value = '';
  }
  if (button) {
    button.disabled = !ready;
  }
  if (!enabled) {
    state.challengeId = '';
  }
}

function periodText(value = '') {
  const [year, month] = String(value || todayPeriod()).split('-').map(Number);
  if (!year || !month) return '-';
  return `${MONTHS[month - 1] || String(month).padStart(2, '0')} ${year}`;
}

function dateText(value = '') {
  const text = String(value || '').trim();
  if (!text) return '-';
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : (local ? { year: Number(local[3]), month: Number(local[2]), day: Number(local[1]) } : null);
  if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) {
    return text;
  }
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

function wifiBandKey(value = '') {
  const text = String(value || '').toLowerCase().replace(/\s+/g, '');
  return text.includes('5') ? '5g' : '2.4g';
}

function wifiBandLabel(value = '') {
  return wifiBandKey(value) === '5g' ? '5G' : '2.4G';
}

function wifiNetworkForBand(device = {}, band = '2.4g') {
  const key = wifiBandKey(band);
  const networks = Array.isArray(device.wifiNetworks) ? device.wifiNetworks : [];
  return networks.find((item) => wifiBandKey(item.band) === key)
    || {
      band: key === '5g' ? '5G' : '2.4G',
      ssid: key === '5g' ? device.ssid5 : device.ssid24,
      ssidParameter: key === '5g' ? device.ssid5Parameter : device.ssid24Parameter,
      passwordParameter: ''
    };
}

function wifiNetworkAvailable(device = {}, band = '2.4g') {
  const network = wifiNetworkForBand(device, band);
  return Boolean(device.id && network.ssidParameter && network.ssid);
}

function billingBadgeClass(status = '') {
  const value = String(status || '').toLowerCase();
  if (value === 'paid') return 'paid';
  if (value === 'overdue') return 'overdue';
  if (['pending', 'unpaid'].includes(value)) return 'pending';
  return 'none';
}

function renderBillingSummary(billing = {}) {
  const exists = billing.exists === true;
  const status = String(billing.status || '').toLowerCase();
  const title = exists
    ? (status === 'paid' ? 'Tagihan sudah dibayar' : 'Tagihan belum dibayar')
    : 'Tidak ada tagihan';
  byId('billingTitle').textContent = title;
  byId('billingBadge').textContent = billing.statusLabel || (exists ? 'Belum dibayar' : 'Tidak ada');
  byId('billingBadge').className = `billing-badge ${billingBadgeClass(status)}`;
  byId('billingInvoiceNo').textContent = billing.invoiceNo || billing.reference || '-';
  byId('billingPeriod').textContent = billing.period || periodText(billing.periodRaw || todayPeriod());
  byId('billingDueDate').textContent = dateText(billing.dueDate || billing.dueDateRaw || '');
  byId('billingAmount').textContent = billing.gatewayAmountText || billing.amountText || '-';
  byId('billingMessage').textContent = billing.message || (exists
    ? 'Ringkasan tagihan bulan ini tersedia.'
    : `Tidak ada tagihan untuk periode ${periodText(byId('periodInput').value || todayPeriod())}.`);
  const payButton = byId('billingPayButton');
  const checkoutUrl = billing.checkoutUrl || billing.paymentGatewayLink || '';
  payButton.hidden = !(billing.canPay && checkoutUrl);
  payButton.dataset.checkoutUrl = billing.canPay ? checkoutUrl : '';
}

function renderPortal(payload) {
  state.portal = payload;
  const customer = payload.customer || {};
  const usage = payload.usage || {};
  const device = payload.device || {};
  const memberName = customer.name || customer.username || '-';
  byId('memberId').textContent = customer.memberId || customer.id || '-';
  byId('memberName').textContent = memberName;
  byId('memberPackage').textContent = customer.packageName || '-';
  byId('accountMenuName').textContent = memberName;
  const hasLocation = Boolean(customer.latitude && customer.longitude);
  const hasHousePhoto = Boolean(customer.housePhotoUrl);
  const locationNotice = byId('customerLocationNotice');
  const locationContent = byId('customerLocationContent');
  const locationMap = byId('customerLocationMap');
  const locationLink = byId('customerLocationLink');
  const housePhoto = byId('customerHousePhoto');
  const missing = [];
  if (!hasLocation) missing.push('lokasi peta');
  if (!hasHousePhoto) missing.push('foto rumah');
  locationNotice.hidden = missing.length === 0;
  locationNotice.textContent = missing.length
    ? `Data ${missing.join(' dan ')} belum tersedia atau belum akurat. Untuk pembaruan data rumah dan peta, mohon hubungi admin.`
    : '';
  locationContent.hidden = !hasLocation && !hasHousePhoto;
  if (hasLocation) {
    const query = `${customer.latitude},${customer.longitude}`;
    locationMap.hidden = false;
    locationMap.src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=17&output=embed`;
    locationLink.hidden = false;
    locationLink.href = customer.locationUrl || `https://www.google.com/maps?q=${encodeURIComponent(query)}`;
  } else {
    locationMap.hidden = true;
    locationLink.hidden = true;
  }
  housePhoto.hidden = !hasHousePhoto;
  if (hasHousePhoto) housePhoto.src = customer.housePhotoUrl;
  byId('usageTotal').textContent = usage.totalUsageText || '0 B';
  byId('usageDetail').textContent = `U ${usage.upload || '0 B'} / D ${usage.download || '0 B'}`;
  byId('rxPower').textContent = device.rxPowerText || '-';
  byId('deviceStatus').textContent = device.id ? (device.online ? 'Online' : 'Offline') : (payload.genieAcs?.error || 'Device belum ditemukan');
  const clients24 = Number(device.wifiClients24 || 0);
  const clients5 = Number(device.wifiClients5 || 0);
  const hasWifi24 = wifiNetworkAvailable(device, '2.4g');
  const hasWifi5 = wifiNetworkAvailable(device, '5g');
  byId('wifiTotal').textContent = `${clients24 + clients5} user`;
  byId('wifiDetail').textContent = hasWifi5 ? `2.4G ${clients24} / 5G ${clients5}` : `2.4G ${clients24}`;
  byId('ssid24').textContent = device.ssid24 || '-';
  byId('ssid5').textContent = device.ssid5 || '-';
  document.querySelectorAll('[data-wifi-row]').forEach((row) => {
    const band = row.dataset.wifiRow || '';
    const available = band === '5g' ? hasWifi5 : hasWifi24;
    row.hidden = !available;
  });
  document.querySelectorAll('[data-ssid-band]').forEach((button) => {
    const network = wifiNetworkForBand(device, button.dataset.ssidBand);
    const available = wifiNetworkAvailable(device, button.dataset.ssidBand);
    button.disabled = !available;
    button.title = available ? '' : 'SSID belum ditemukan di GenieACS';
  });
  renderBillingSummary(payload.billing || {});
  showPortal();
}

function openAccountDialog() {
  const customer = state.portal?.customer || {};
  const dialog = byId('accountDialog');
  const form = byId('accountForm');
  if (!dialog || !form) return;
  form.name.value = customer.name || '';
  form.ktp.value = customer.ktp || '';
  form.phone.value = customer.phone || '';
  form.email.value = customer.email || '';
  form.address.value = customer.address || '';
  dialog.showModal();
}

async function loadSettings() {
  const payload = await api('/api/public/wifiku/settings');
  state.settings = payload.settings || {};
  byId('brandName').textContent = state.settings.businessName || 'WifiKu';
  byId('brandLogo').src = state.settings.logoUrl || '/fakenet-logo.png';
  document.title = `${state.settings.businessName || 'WifiKu'} - WifiKu`;
  const favicon = byId('appFavicon');
  if (favicon) favicon.href = state.settings.logoUrl || '/fakenet-logo.png';
  if (!state.settings.enabled) {
    byId('loginView').innerHTML = '<h1>WifiKu nonaktif</h1><p>Portal pelanggan belum diaktifkan.</p>';
  }
  syncOtpFormVisibility(Boolean(state.challengeId));
}

async function loadMe() {
  if (!state.token) return false;
  try {
    const period = byId('periodInput').value || todayPeriod();
    const payload = await api(`/api/public/wifiku/me?period=${encodeURIComponent(period)}`);
    renderPortal(payload);
    return true;
  } catch {
    state.token = '';
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
    return false;
  }
}

byId('periodInput').value = todayPeriod();

byId('phoneForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setLoading(form, true);
  try {
    state.phone = byId('phoneInput').value.trim();
    const payload = await api('/api/public/wifiku/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone: state.phone, period: byId('periodInput').value || todayPeriod() })
    });
    if (payload.token) {
      state.token = payload.token;
      localStorage.setItem(TOKEN_KEY, state.token);
      state.challengeId = '';
      syncOtpFormVisibility(false);
      renderPortal(payload.portal);
      return;
    }
    if (payload.requireOtp === false || !otpRequired()) {
      syncOtpFormVisibility(false);
      throw new Error('OTP sedang nonaktif, silakan ulangi login');
    }
    state.challengeId = payload.challengeId || '';
    syncOtpFormVisibility(Boolean(state.challengeId));
    byId('otpInput').focus();
    toast('OTP dikirim via WhatsApp');
  } catch (error) {
    toast(error.message);
  } finally {
    setLoading(form, false);
  }
});

byId('otpForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setLoading(form, true);
  try {
    const payload = await api('/api/public/wifiku/login', {
      method: 'POST',
      body: JSON.stringify({
        phone: state.phone,
        challengeId: state.challengeId,
        otp: byId('otpInput').value.trim(),
        period: byId('periodInput').value || todayPeriod()
      })
    });
    state.token = payload.token;
    localStorage.setItem(TOKEN_KEY, state.token);
    renderPortal(payload.portal);
  } catch (error) {
    toast(error.message);
  } finally {
    setLoading(form, false);
  }
});

byId('periodInput').addEventListener('change', () => loadMe());

byId('accountMenuButton').addEventListener('click', () => {
  const menu = byId('accountMenu');
  const button = byId('accountMenuButton');
  menu.hidden = !menu.hidden;
  button.setAttribute('aria-expanded', String(!menu.hidden));
});

byId('accountButton').addEventListener('click', () => {
  byId('accountMenu').hidden = true;
  openAccountDialog();
});

byId('logoutButton').addEventListener('click', () => {
  state.token = '';
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
});

byId('closeAccountDialog').addEventListener('click', () => byId('accountDialog').close());
byId('accountForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  delete payload.phone;
  try {
    await api('/api/public/wifiku/profile', { method: 'PATCH', body: JSON.stringify(payload) });
    byId('accountDialog').close();
    toast('Data Akun Saya berhasil diperbarui');
    await loadMe();
  } catch (error) {
    toast(error.message);
  }
});

byId('billingPayButton').addEventListener('click', () => {
  const url = byId('billingPayButton').dataset.checkoutUrl || '';
  if (!url) {
    toast('Link pembayaran belum tersedia');
    return;
  }
  window.location.href = url;
});

const dialog = byId('actionDialog');
const actionForm = byId('actionForm');
byId('closeDialog').addEventListener('click', () => dialog.close());

function openAction(title, body, handler) {
  byId('actionTitle').textContent = title;
  byId('actionBody').innerHTML = body;
  actionForm.onsubmit = async (event) => {
    event.preventDefault();
    try {
      await handler(new FormData(actionForm));
      dialog.close();
      toast('Perintah dikirim');
      setTimeout(loadMe, 1200);
    } catch (error) {
      toast(error.message);
    }
  };
  dialog.showModal();
}

document.querySelectorAll('[data-ssid-band]').forEach((button) => {
  button.addEventListener('click', () => {
    const band = button.dataset.ssidBand;
    const device = state.portal?.device || {};
    const network = wifiNetworkForBand(device, band);
    if (!device.id || !network.ssidParameter) {
      toast('SSID belum ditemukan di GenieACS');
      return;
    }
    const label = wifiBandLabel(band);
    openAction(`Ubah SSID & Password ${label}`, `
      <label>
        <span>Nama WiFi ${label}</span>
        <input name="ssid" maxlength="32" value="${escapeHtml(network.ssid || '')}" required>
      </label>
      <label>
        <span>Password baru ${label}</span>
        <input id="wifiPasswordInput" name="password" type="password" minlength="8" maxlength="63" autocomplete="new-password" placeholder="Kosongkan jika tidak diubah">
      </label>
      <label class="check-row">
        <input id="wifiShowPassword" type="checkbox">
        <span>Lihat password</span>
      </label>
      <p class="muted">Password hanya diubah jika field password diisi.</p>
    `, async (form) => {
      const payload = {
        band,
        ssid: form.get('ssid'),
        ssidParameter: network.ssidParameter,
        passwordParameter: network.passwordParameter || ''
      };
      const password = String(form.get('password') || '').trim();
      if (password) payload.password = password;
      await api('/api/public/wifiku/wifi', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    });
    const passwordInput = byId('wifiPasswordInput');
    const showPassword = byId('wifiShowPassword');
    showPassword?.addEventListener('change', () => {
      if (passwordInput) passwordInput.type = showPassword.checked ? 'text' : 'password';
    });
  });
});

byId('rebootButton').addEventListener('click', async () => {
  if (!confirm('Reboot modem sekarang?')) return;
  try {
    await api('/api/public/wifiku/reboot', { method: 'POST', body: '{}' });
    toast('Perintah reboot dikirim');
  } catch (error) {
    toast(error.message);
  }
});

(async () => {
  try {
    await loadSettings();
    if (!(await loadMe())) showLogin();
  } catch (error) {
    toast(error.message);
    showLogin();
  }
})();
