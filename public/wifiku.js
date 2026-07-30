'use strict';

const TOKEN_KEY = 'wifikuToken';
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const PORTAL_REFRESH_MS = 30000;
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

function chartTooltipAttr(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  return `data-chart-tooltip="${escapeHtml(text).replace(/\n/g, '&#10;')}" tabindex="0"`;
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

function displayNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('id-ID').format(number);
}

function compactBytes(value = 0) {
  let bytes = Math.max(0, Number(value || 0));
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    unit += 1;
  }
  const precision = unit <= 1 ? 0 : 1;
  return `${bytes.toFixed(precision)} ${units[unit]}`;
}

function chartRange(values = [], options = {}) {
  const clean = values.map((value) => Number(value || 0)).filter(Number.isFinite);
  const max = Math.max(0, ...clean);
  const minPadding = Math.max(0, Number(options.minPadding || 0));
  const stepBase = Math.max(1, Number(options.stepBase || 1));
  const paddedMax = Math.max(stepBase, max + minPadding);
  const niceMax = Math.ceil(paddedMax / stepBase) * stepBase;
  const ticks = [niceMax, niceMax * 0.66, niceMax * 0.33, 0].map((value) => Math.round(value / stepBase) * stepBase);
  return { min: 0, max: niceMax || stepBase, ticks: [...new Set(ticks)] };
}

function chartPoint(value = 0, range = {}, box = {}) {
  const min = Number(range.min || 0);
  const max = Math.max(min + 1, Number(range.max || 1));
  const ratio = (Number(value || 0) - min) / (max - min);
  return box.top + box.plotHeight - (Math.max(0, Math.min(1, ratio)) * box.plotHeight);
}

function chartGridMarkup(range = {}, box = {}) {
  return (range.ticks || []).map((value) => {
    const y = chartPoint(value, range, box);
    return `<line class="statistics-grid-line" x1="0" x2="${box.width - box.right}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}"></line>`;
  }).join('');
}

function chartFixedAxisMarkup(range = {}, box = {}, formatter = displayNumber) {
  return (range.ticks || []).map((value) => {
    const y = chartPoint(value, range, box);
    return `<span style="top:${y.toFixed(2)}px">${escapeHtml(formatter(value))}</span>`;
  }).join('');
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
  const primaryParameter = key === '5g' ? device.ssid5Parameter : device.ssid24Parameter;
  const bandNetworks = networks.filter((item) => wifiBandKey(item.band) === key && item.enabled !== false);
  const namedPrivateNetwork = bandNetworks.find((item) => !/wifimurah|open/i.test(String(item.ssid || '')));
  const privateNetwork = bandNetworks.find((item) => item.securityEnabled && !/wifimurah|open/i.test(String(item.ssid || '')));
  return networks.find((item) => item.ssidParameter && item.ssidParameter === primaryParameter)
    && !(/wifimurah|open/i.test(String(device.ssid5 || '')) && key === '5g')
    ? networks.find((item) => item.ssidParameter && item.ssidParameter === primaryParameter)
    : privateNetwork
      || namedPrivateNetwork
      || bandNetworks.find((item) => item.index === (key === '5g' ? 5 : 1))
      || bandNetworks[0]
    || networks.find((item) => wifiBandKey(item.band) === key && item.index === (key === '5g' ? 5 : 1))
    || {
      band: key === '5g' ? '5G' : '2.4G',
      ssid: key === '5g' ? device.ssid5 : device.ssid24,
      ssidParameter: primaryParameter,
      passwordParameter: ''
    };
}

function wifiNetworkAvailable(device = {}, band = '2.4g') {
  const network = wifiNetworkForBand(device, band);
  return Boolean(device.id && network.ssidParameter && network.ssid);
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function clientRows(device = {}) {
  return Array.isArray(device.connectedClients) ? device.connectedClients : [];
}

function clientTypeKey(value = '') {
  const text = String(value || '').toLowerCase();
  if (text.includes('5')) return '5G';
  if (text.includes('lan') || text.includes('eth')) return 'LAN';
  return '2.4G';
}

function clientCountByType(rows = [], type = '') {
  const key = clientTypeKey(type);
  return rows.filter((row) => clientTypeKey(row.type) === key).length;
}

function clientSummaryCounts(device = {}) {
  const rows = clientRows(device);
  const count24 = Math.max(numberValue(device.wifiClients24), clientCountByType(rows, '2.4G'));
  const count5 = Math.max(numberValue(device.wifiClients5), clientCountByType(rows, '5G'));
  const countLan = Math.max(numberValue(device.lanClients), clientCountByType(rows, 'LAN'));
  const total = Math.max(numberValue(device.clientsTotal || device.wifiClientsTotal), rows.length, count24 + count5 + countLan);
  return { count24, count5, countLan, total };
}

function clientBadgeClass(type = '') {
  const key = clientTypeKey(type);
  if (key === '5G') return 'wifi5';
  if (key === 'LAN') return 'lan';
  return 'wifi24';
}

function usageDateLabel(value = '') {
  const formatted = dateText(value);
  if (formatted === '-' || !formatted) return '-';
  return formatted.slice(0, 5);
}

function usageDailyBarChart(rows = []) {
  const chartRows = (Array.isArray(rows) ? rows : []).slice(-7);
  if (!chartRows.length) {
    return '<div class="empty-detail">Aktivitas usage 7 hari terakhir belum tersedia.</div>';
  }
  const box = { width: 320, height: 116, right: 0, top: 8, plotHeight: 96 };
  const range = chartRange(chartRows.map((row) => row.totalOctets), {
    minPadding: 1024 * 1024,
    stepBase: 1024 * 1024
  });
  const plotWidth = box.width - box.right;
  const step = chartRows.length ? plotWidth / chartRows.length : plotWidth;
  const barWidth = Math.max(10, Math.min(24, step * 0.52));
  return `
    <div class="statistics-chart-card usage-daily-chart">
      <div class="statistics-chart-head">
        <div>
          <h3>Aktivitas 7 Hari Terakhir</h3>
          <span>Total usage harian dari FreeRADIUS.</span>
        </div>
        <div class="statistics-legend compact">
          <span class="voucher">Total usage</span>
        </div>
      </div>
      <div class="usage-daily-chart-frame">
        <div class="usage-daily-fixed-axis" aria-hidden="true">
          ${chartFixedAxisMarkup(range, box, compactBytes)}
        </div>
        <div class="statistics-svg-wrap usage-daily-svg-wrap">
          <svg viewBox="0 0 ${box.width} ${box.height}" preserveAspectRatio="none" role="img" aria-label="Aktivitas usage 7 hari terakhir">
          ${chartGridMarkup(range, box)}
          ${chartRows.map((row, index) => {
            const value = Number(row.totalOctets || 0);
            const y = chartPoint(value, range, box);
            const height = Math.max(0, (box.top + box.plotHeight) - y);
            const x = (step * index) + ((step - barWidth) / 2);
            const tooltip = `${dateText(row.date)}\nUpload: ${row.upload || compactBytes(row.inputOctets || 0)}\nDownload: ${row.download || compactBytes(row.outputOctets || 0)}\nTotal: ${row.totalUsageText || compactBytes(value)}\nSession: ${displayNumber(row.sessionCount || 0)}`;
            const hitWidth = Math.max(34, barWidth + 14);
            const hitX = x + (barWidth / 2) - (hitWidth / 2);
            return `
              <rect class="statistics-bar voucher" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${height.toFixed(2)}" rx="5" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
              <rect class="statistics-hit-rect" fill="transparent" pointer-events="all" x="${hitX.toFixed(2)}" y="${box.top}" width="${hitWidth.toFixed(2)}" height="${box.plotHeight}" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
            `;
          }).join('')}
          </svg>
          <div class="usage-daily-date-grid">
            ${chartRows.map((row) => {
              const tooltip = `${dateText(row.date)}\nUpload: ${row.upload || compactBytes(row.inputOctets || 0)}\nDownload: ${row.download || compactBytes(row.outputOctets || 0)}\nTotal: ${row.totalUsageText || compactBytes(row.totalOctets || 0)}\nSession: ${displayNumber(row.sessionCount || 0)}`;
              return `<span ${chartTooltipAttr(tooltip)}>${escapeHtml(usageDateLabel(row.date))}</span>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function openClientDialog() {
  const device = state.portal?.device || {};
  const rows = clientRows(device);
  const counts = clientSummaryCounts(device);
  const body = byId('clientDialogBody');
  if (!body) return;
  const summary = `
    <div class="client-summary-strip">
      <span>2.4G ${counts.count24}</span>
      <span>5G ${counts.count5}</span>
      <span>LAN ${counts.countLan}</span>
    </div>
  `;
  if (!rows.length) {
    body.innerHTML = `${summary}<p class="empty-detail">Detail client belum terbaca dari GenieACS.</p>`;
  } else {
    body.innerHTML = `${summary}
      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Koneksi</th>
              <th>Nama / Device</th>
              <th>IP Address</th>
              <th>MAC</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr>
                <td>${index + 1}</td>
                <td><span class="client-type-badge ${clientBadgeClass(row.type)}">${escapeHtml(clientTypeKey(row.type))}</span></td>
                <td>${escapeHtml(row.name || '-')}</td>
                <td>${escapeHtml(row.ipAddress || '-')}</td>
                <td>${escapeHtml(row.macAddress || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }
  const dialog = byId('clientDialog');
  if (dialog && !dialog.open) dialog.showModal();
}

function openUsageDialog() {
  const usage = state.portal?.usage || {};
  const rows = Array.isArray(usage.dailyRows) ? usage.dailyRows : [];
  const body = byId('usageDialogBody');
  if (!body) return;
  body.innerHTML = `
    ${usageDailyBarChart(rows)}
    ${usage.dailyError ? `<div class="empty-detail">${escapeHtml(usage.dailyError)}</div>` : ''}
  `;
  const dialog = byId('usageDialog');
  if (dialog && !dialog.open) dialog.showModal();
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
  const clients = clientSummaryCounts(device);
  const network24 = wifiNetworkForBand(device, '2.4g');
  const network5 = wifiNetworkForBand(device, '5g');
  const hasWifi24 = wifiNetworkAvailable(device, '2.4g');
  const hasWifi5 = wifiNetworkAvailable(device, '5g');
  byId('wifiTotal').textContent = `${clients.total} user`;
  byId('wifiDetail').textContent = `2.4G ${clients.count24} / 5G ${clients.count5} / LAN ${clients.countLan}`;
  const clientButton = byId('clientSummaryButton');
  if (clientButton) {
    clientButton.disabled = !device.id;
    clientButton.title = device.id ? 'Lihat detail client terkoneksi' : 'Device belum ditemukan';
  }
  byId('ssid24').textContent = network24.ssid || device.ssid24 || '-';
  byId('ssid5').textContent = network5.ssid || device.ssid5 || '-';
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

async function refreshPortalRealtime() {
  if (!state.token || document.hidden) return;
  const usageOpen = byId('usageDialog')?.open === true;
  const clientOpen = byId('clientDialog')?.open === true;
  const ok = await loadMe();
  if (!ok) return;
  if (usageOpen) openUsageDialog();
  if (clientOpen) openClientDialog();
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
setInterval(refreshPortalRealtime, PORTAL_REFRESH_MS);

byId('accountMenuButton').addEventListener('click', () => {
  const menu = byId('accountMenu');
  const button = byId('accountMenuButton');
  menu.hidden = !menu.hidden;
  button.setAttribute('aria-expanded', String(!menu.hidden));
});

document.addEventListener('click', (event) => {
  const wrap = byId('accountMenuWrap');
  const menu = byId('accountMenu');
  const button = byId('accountMenuButton');
  if (!wrap || wrap.hidden || wrap.contains(event.target)) return;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const menu = byId('accountMenu');
  const button = byId('accountMenuButton');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
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
byId('usageSummaryButton')?.addEventListener('click', openUsageDialog);
byId('clientSummaryButton')?.addEventListener('click', openClientDialog);
byId('closeUsageDialog')?.addEventListener('click', () => byId('usageDialog')?.close());
byId('closeClientDialog')?.addEventListener('click', () => byId('clientDialog')?.close());
byId('accountForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const field = (name) => form.elements.namedItem(name);
  const payload = {
    name: String(field('name')?.value || '').trim(),
    ktp: String(field('ktp')?.value || '').trim(),
    email: String(field('email')?.value || '').trim(),
    address: String(field('address')?.value || '').trim()
  };
  const submitButton = form.querySelector('button[type="submit"]');
  if (!payload.name) {
    toast('Nama wajib diisi');
    return;
  }
  if (submitButton) submitButton.disabled = true;
  try {
    await api('/api/public/wifiku/profile', { method: 'PATCH', body: JSON.stringify(payload) });
    byId('accountDialog').close();
    toast('Data Akun Saya berhasil diperbarui');
    await loadMe();
  } catch (error) {
    toast(error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
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

let activeChartTooltipTimer = null;
let chartTooltipShownAt = 0;

function ensureChartTooltip() {
  let tooltip = byId('chartTouchTooltip');
  const openDialog = document.querySelector('dialog[open]');
  const host = openDialog || document.body;
  if (tooltip) {
    if (tooltip.parentNode !== host) host.appendChild(tooltip);
    return tooltip;
  }
  tooltip = document.createElement('div');
  tooltip.id = 'chartTouchTooltip';
  tooltip.className = 'chart-touch-tooltip';
  tooltip.hidden = true;
  host.appendChild(tooltip);
  return tooltip;
}

function hideChartTooltip() {
  if (Date.now() - chartTooltipShownAt < 350) return;
  const tooltip = byId('chartTouchTooltip');
  if (tooltip) tooltip.hidden = true;
  clearTimeout(activeChartTooltipTimer);
  activeChartTooltipTimer = null;
}

function chartTooltipTarget(node) {
  let current = node && currentNode(node);
  while (current && current !== document) {
    if (typeof current.getAttribute === 'function' && current.getAttribute('data-chart-tooltip')) return current;
    current = currentNode(current.parentNode || current.host);
  }
  return null;
}

function chartTooltipTargetFromEvent(event) {
  const direct = chartTooltipTarget(event?.target);
  if (direct) return direct;
  const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    const target = chartTooltipTarget(node);
    if (target) return target;
  }
  return null;
}

function currentNode(node) {
  return node && node.nodeType === 3 ? node.parentNode : node;
}

function showChartTooltip(target, event = null) {
  const text = String(target?.getAttribute('data-chart-tooltip') || '').trim();
  if (!text) return;
  const tooltip = ensureChartTooltip();
  tooltip.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  tooltip.hidden = false;
  const rect = target.getBoundingClientRect();
  const pointerX = Number(event?.clientX);
  const pointerY = Number(event?.clientY);
  const x = Number.isFinite(pointerX) ? pointerX : rect.left + (rect.width / 2);
  const y = Number.isFinite(pointerY) ? pointerY : rect.top;
  const tooltipRect = tooltip.getBoundingClientRect();
  const margin = 10;
  const left = Math.max(margin, Math.min(window.innerWidth - tooltipRect.width - margin, x - (tooltipRect.width / 2)));
  const hasTopRoom = y - tooltipRect.height - 12 >= margin;
  const preferredTop = hasTopRoom ? y - tooltipRect.height - 12 : y + 16;
  const top = Math.max(margin, Math.min(window.innerHeight - tooltipRect.height - margin, preferredTop));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  chartTooltipShownAt = Date.now();
  clearTimeout(activeChartTooltipTimer);
  activeChartTooltipTimer = setTimeout(hideChartTooltip, 6500);
}

document.addEventListener('pointerdown', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (target) {
    showChartTooltip(target, event);
    return;
  }
  hideChartTooltip();
});

document.addEventListener('touchstart', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (!target) return;
  const touch = event.touches && event.touches[0] ? event.touches[0] : event;
  showChartTooltip(target, touch);
}, { passive: true });

document.addEventListener('click', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (target) {
    showChartTooltip(target, event);
    return;
  }
  hideChartTooltip();
});

document.addEventListener('mouseover', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (target) showChartTooltip(target, event);
});

document.addEventListener('focusin', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (target) showChartTooltip(target, null);
});

window.addEventListener('scroll', hideChartTooltip, { passive: true });
document.addEventListener('scroll', hideChartTooltip, { passive: true, capture: true });

(async () => {
  try {
    await loadSettings();
    if (!(await loadMe())) showLogin();
  } catch (error) {
    toast(error.message);
    showLogin();
  }
})();
