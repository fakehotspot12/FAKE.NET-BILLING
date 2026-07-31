(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const invoiceRef = params.get('id') || params.get('invoice') || params.get('reference') || '';
  let currentInvoice = null;
  let currentChannels = [];
  let currentCheckout = null;
  let checkoutInFlight = false;
  let paymentGatewayEnabled = false;
  let checkoutStatusTimer = null;
  let checkoutCountdownTimer = null;
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value || '-';
  }

  function escapeHtml(value = '') {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]));
  }

  function notice(message, tone) {
    const box = $('paymentNotice');
    if (!box) return;
    box.hidden = !message;
    box.textContent = message || '';
    box.classList.toggle('error', tone === 'error');
  }

  function statusLabel(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'paid') return 'PAID';
    if (value === 'overdue') return 'LEWAT TEMPO';
    if (value === 'cancelled') return 'CANCELLED';
    return 'BELUM BAYAR';
  }

  function applyInvoiceStatusBadge(status = '') {
    const element = $('invoiceStatus');
    if (!element) return;
    const normalized = String(status || '').toLowerCase() || 'unpaid';
    element.className = 'invoice-status-badge';
    element.classList.add(`status-${normalized}`);
  }

  function periodText(value) {
    const text = String(value || '').trim();
    if (!text) return '-';
    return text.replace(/\b(\d{4})-(\d{2})(?!-\d{2})\b/g, (_, year, month) => {
      const index = Math.max(0, Math.min(11, Number(month) - 1));
      return `${MONTHS[index]} ${year}`;
    });
  }

  function dateText(value) {
    const text = String(value || '').trim();
    if (!text) return '-';
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    const parts = iso
      ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
      : (local ? { year: Number(local[3]), month: Number(local[2]), day: Number(local[1]) } : null);
    if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) {
      return periodText(text);
    }
    return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
  }

  function dateTimeText(value) {
    const text = String(value || '').trim();
    if (!text) return '-';
    const timestamp = Date.parse(text);
    if (!Number.isFinite(timestamp)) return dateText(text);
    const date = new Date(timestamp);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function countdownText(value = '') {
    const expiresAt = Date.parse(String(value || '').trim());
    if (!Number.isFinite(expiresAt)) return '-';
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return 'Kedaluwarsa';
    const totalSeconds = Math.ceil(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const clock = [hours, minutes, seconds].map((item) => String(item).padStart(2, '0')).join(':');
    return days > 0 ? `${days} hari ${clock}` : clock;
  }

  function updateCountdownElements() {
    document.querySelectorAll('[data-countdown-expires]').forEach((element) => {
      const expiresAt = Date.parse(element.dataset.countdownExpires || '');
      const remaining = Number.isFinite(expiresAt) ? expiresAt - Date.now() : 0;
      element.textContent = countdownText(element.dataset.countdownExpires || '');
      element.classList.toggle('is-expired', remaining <= 0);
      element.classList.toggle('is-warning', remaining > 0 && remaining <= 5 * 60 * 1000);
    });
  }

  function stopCheckoutCountdown() {
    if (checkoutCountdownTimer) {
      window.clearInterval(checkoutCountdownTimer);
      checkoutCountdownTimer = null;
    }
  }

  function startCheckoutCountdown() {
    stopCheckoutCountdown();
    updateCountdownElements();
    checkoutCountdownTimer = window.setInterval(updateCountdownElements, 1000);
  }

  function channelLabel(channel = {}) {
    const parts = [
      channel.name || channel.code || '',
      channel.group || '',
      channel.type ? channel.type.toUpperCase() : ''
    ].filter(Boolean);
    return parts.join(' - ');
  }

  function channelMetaLabel(channel = {}) {
    return [
      channel.group || '',
      channel.type ? channel.type.toUpperCase() : '',
      channel.code || ''
    ].filter(Boolean).join(' · ');
  }

  function channelGroupKey(channel = {}) {
    const text = `${channel.group || ''} ${channel.type || ''} ${channel.code || ''} ${channel.name || ''}`.toUpperCase();
    if (text.includes('QRIS') || text.includes('QR')) return 'qris';
    if (text.includes('OVO') || text.includes('DANA') || text.includes('SHOPEE') || text.includes('LINKAJA') || text.includes('EWALLET') || text.includes('E-WALLET')) return 'ewallet';
    if (text.includes('ALFAM') || text.includes('INDOMARET') || text.includes('GERAI') || text.includes('RETAIL')) return 'retail';
    if (text.includes('VA') || text.includes('VIRTUAL') || text.includes('BANK') || text.includes('BRI') || text.includes('BCA') || text.includes('BNI') || text.includes('MANDIRI')) return 'va';
    return 'other';
  }

  function channelGroupLabel(key = '') {
    return {
      qris: 'QRIS',
      va: 'Virtual Account',
      ewallet: 'E-Wallet',
      retail: 'Gerai',
      other: 'Lainnya'
    }[key] || 'Lainnya';
  }

  function groupedChannels(channels = []) {
    const order = ['qris', 'va', 'ewallet', 'retail', 'other'];
    const groups = new Map(order.map((key) => [key, []]));
    channels.forEach((channel) => {
      const key = channelGroupKey(channel);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(channel);
    });
    return order
      .map((key) => ({ key, label: channelGroupLabel(key), channels: groups.get(key) || [] }))
      .filter((group) => group.channels.length);
  }

  function channelIconMarkup(channel = {}) {
    const label = channel.name || channel.code || 'P';
    const iconUrl = String(channel.iconUrl || channel.logoUrl || channel.imageUrl || '').trim();
    if (iconUrl) {
      return `<span class="payment-method-logo"><img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(label)}"></span>`;
    }
    const initial = String(label || 'P').trim().charAt(0).toUpperCase() || 'P';
    return `<span class="payment-method-logo fallback" aria-hidden="true">${escapeHtml(initial)}</span>`;
  }

  function checkoutMethodLabel(checkout = {}) {
    const channel = checkoutChannel(checkout);
    return checkout.paymentName || channel?.name || channelLabel(channel) || checkout.method || 'Metode pembayaran';
  }

  function checkoutAmountText(checkout = {}) {
    const value = Number(checkout.amount || currentInvoice?.gatewayAmount || currentInvoice?.amount || 0) || 0;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(value).replace(/\s/g, ' ');
  }

  function checkoutCode(checkout = {}) {
    return String(checkout.payCode || checkout.paymentCode || '').trim();
  }

  function checkoutUrl(checkout = {}) {
    return String(checkout.paymentUrl || checkout.payUrl || checkout.checkoutUrl || '').trim();
  }

  function checkoutIsQr(checkout = {}) {
    const method = String(checkout.method || checkout.paymentName || '').toUpperCase();
    return Boolean(checkout.qrUrl || checkout.qrString || method.includes('QRIS'));
  }

  function invoiceCheckoutTitle() {
    const invoiceNo = currentInvoice?.invoiceNo || currentInvoice?.reference || invoiceRef || '';
    return `Pembayaran Invoice ${invoiceNo}`.trim();
  }

  function checkoutInstruction(checkout = {}) {
    if (checkoutIsQr(checkout)) {
      return 'Scan QRIS dari aplikasi pembayaran, lalu cek status setelah transaksi berhasil.';
    }
    if (checkoutCode(checkout)) {
      return 'Gunakan nomor pembayaran berikut sesuai metode yang dipilih, lalu cek status setelah membayar.';
    }
    return 'Lanjutkan pembayaran melalui halaman payment gateway, lalu cek status setelah transaksi berhasil.';
  }

  function checkoutChannel(checkout = {}) {
    const method = String(checkout.method || '').toUpperCase();
    if (!method) return {};
    return currentChannels.find((item) => String(item.code || '').toUpperCase() === method) || {};
  }

  function checkoutIconMarkup(checkout = {}) {
    const channel = checkoutChannel(checkout);
    const label = checkoutMethodLabel(checkout);
    const iconUrl = String(checkout.iconUrl || channel.iconUrl || channel.logoUrl || '').trim();
    if (iconUrl) {
      return `<span class="checkout-method-icon"><img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(label)}"></span>`;
    }
    const initial = String(label || 'P').trim().charAt(0).toUpperCase() || 'P';
    return `<span class="checkout-method-icon fallback" aria-hidden="true">${escapeHtml(initial)}</span>`;
  }

  function renderPendingCheckoutSummary() {
    const box = $('pendingCheckoutBox');
    const title = $('methodBoxTitle');
    if (!box) return;
    const paid = String(currentInvoice?.status || '').toLowerCase() === 'paid';
    if (!currentCheckout || paid) {
      box.hidden = true;
      box.innerHTML = '';
      if (title) title.textContent = 'Pilih Metode Pembayaran';
      return;
    }
    const method = checkoutMethodLabel(currentCheckout);
    const expiresRaw = currentCheckout.expiresAt || currentCheckout.expiredAt || '';
    const expires = dateTimeText(expiresRaw);
    if (title) title.textContent = 'Ada Pembayaran Tertunda';
    box.hidden = false;
    box.innerHTML = `
      <div class="pending-checkout-main">
        ${checkoutIconMarkup(currentCheckout)}
        <div>
          <strong>${escapeHtml(method)}</strong>
          <span>Total ${escapeHtml(checkoutAmountText(currentCheckout))}${expires !== '-' ? ` · sisa <b class="inline-countdown" data-countdown-expires="${escapeHtml(expiresRaw)}">${escapeHtml(countdownText(expiresRaw))}</b>` : ''}</span>
        </div>
      </div>
      <div class="pending-checkout-actions">
        <button class="secondary-button compact primary" id="continueCheckoutButton" type="button">Lanjutkan Pembayaran</button>
        <button class="secondary-button compact" id="replaceCheckoutButton" type="button">Ganti Metode</button>
      </div>
    `;
    startCheckoutCountdown();
    $('continueCheckoutButton')?.addEventListener('click', () => renderCheckout(currentCheckout));
    $('replaceCheckoutButton')?.addEventListener('click', openMethodPicker);
  }

  function stopCheckoutPolling() {
    if (checkoutStatusTimer) {
      window.clearInterval(checkoutStatusTimer);
      checkoutStatusTimer = null;
    }
  }

  function startCheckoutPolling() {
    stopCheckoutPolling();
    checkoutStatusTimer = window.setInterval(() => {
      checkPaymentStatus(false).catch(() => {});
    }, 5000);
  }

  function hideCheckout() {
    stopCheckoutPolling();
    stopCheckoutCountdown();
    const box = $('checkoutBox');
    if (box) {
      box.hidden = true;
      box.innerHTML = '';
    }
    document.body.classList.remove('modal-open');
    if (document.querySelector('[data-countdown-expires]')) startCheckoutCountdown();
  }

  async function copyText(value = '') {
    const text = String(value || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      notice('Nomor pembayaran disalin.');
    } catch {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
      notice('Nomor pembayaran disalin.');
    }
  }

  function renderCheckout(checkout = {}) {
    currentCheckout = checkout && Object.keys(checkout).length ? checkout : null;
    const box = $('checkoutBox');
    if (!box || !currentCheckout) {
      hideCheckout();
      return;
    }
    const code = checkoutCode(currentCheckout);
    const qrUrl = currentCheckout.qrUrl || '';
    const method = checkoutMethodLabel(currentCheckout);
    const url = checkoutUrl(currentCheckout);
    const isQr = checkoutIsQr(currentCheckout);
    const iconMarkup = checkoutIconMarkup(currentCheckout);
    const invoiceTitle = invoiceCheckoutTitle();
    const customerName = currentInvoice?.customerName || '-';
    const packageName = currentInvoice?.packageName || '-';
    const dueDate = dateText(currentInvoice?.dueDate);
    const period = periodText(currentInvoice?.period);
    const expiresRaw = currentCheckout.expiresAt || currentCheckout.expiredAt || '';
    const expiresText = dateTimeText(expiresRaw);
    box.hidden = false;
    document.body.classList.add('modal-open');
    box.innerHTML = `
      <div class="checkout-backdrop"></div>
      <div class="checkout-dialog checkout-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="checkoutDialogTitle">
        <div class="checkout-head">
          <div class="checkout-title-row">
            ${iconMarkup}
            <div>
              <span>Pembayaran Online</span>
              <strong id="checkoutDialogTitle">${escapeHtml(invoiceTitle)}</strong>
              <small>${escapeHtml(method)}</small>
            </div>
          </div>
          <button class="icon-button" id="closeCheckoutButton" type="button" aria-label="Tutup">×</button>
        </div>
        <div class="checkout-amount-hero">
          <span>Total Bayar</span>
          <strong>${escapeHtml(checkoutAmountText(currentCheckout))}</strong>
          <em>${escapeHtml(method)}</em>
        </div>
        <p class="checkout-helper">${escapeHtml(checkoutInstruction(currentCheckout))}</p>
        ${isQr ? `
          <div class="checkout-qr-section">
            <div class="qr-panel">
              ${qrUrl ? `<img src="${escapeHtml(qrUrl)}" alt="QRIS pembayaran">` : '<div class="qr-placeholder">QRIS sedang disiapkan</div>'}
            </div>
            <span>Pastikan nominal sama dengan total bayar.</span>
          </div>
        ` : ''}
        ${code ? `
          <div class="payment-code-box">
            <span>Nomor Pembayaran</span>
            <div>
              <strong>${escapeHtml(code)}</strong>
              <button class="secondary-button compact" id="copyPaymentCode" type="button">Copy</button>
            </div>
          </div>
        ` : ''}
        <div class="checkout-mini-summary">
          <div>
            <span>Pelanggan</span>
            <strong>${escapeHtml(customerName)}</strong>
          </div>
          <div>
            <span>Paket</span>
            <strong>${escapeHtml(packageName)}</strong>
          </div>
          <div>
            <span>Periode</span>
            <strong>${escapeHtml(period)}</strong>
          </div>
          <div>
            <span>Sisa Waktu</span>
            <strong class="checkout-countdown" data-countdown-expires="${escapeHtml(expiresRaw)}">${escapeHtml(countdownText(expiresRaw))}</strong>
            <em>${escapeHtml(expiresText)}</em>
          </div>
          <div>
            <span>Jatuh Tempo</span>
            <strong>${escapeHtml(dueDate)}</strong>
          </div>
        </div>
        <div class="checkout-actions">
          <button class="payment-button" id="checkPaymentStatus" type="button">Cek Status Pembayaran</button>
          ${url ? `<a class="payment-link subtle" href="${escapeHtml(url)}" target="_blank" rel="noopener">Buka Halaman Pembayaran</a>` : ''}
        </div>
        <button class="secondary-button" id="changeMethodButton" type="button">Pilih metode lain</button>
      </div>
    `;
    $('copyPaymentCode')?.addEventListener('click', () => copyText(code));
    $('checkPaymentStatus')?.addEventListener('click', () => checkPaymentStatus(true));
    $('changeMethodButton')?.addEventListener('click', () => {
      const select = $('paymentMethodSelect');
      if (select) select.value = '';
      hideCheckout();
      openMethodPicker().catch((error) => notice(error.message || 'Metode pembayaran gagal dibuka', 'error'));
    });
    $('closeCheckoutButton')?.addEventListener('click', hideCheckout);
    startCheckoutPolling();
    startCheckoutCountdown();
  }

  function renderCheckoutLoading() {
    const box = $('checkoutBox');
    if (!box) return;
    box.hidden = false;
    document.body.classList.add('modal-open');
    box.innerHTML = `
      <div class="checkout-backdrop"></div>
      <div class="checkout-dialog checkout-loading-dialog" role="dialog" aria-modal="true" aria-live="polite">
        <div class="checkout-spinner" aria-hidden="true"></div>
        <strong>Menyiapkan pembayaran</strong>
        <span>Mohon tunggu sebentar.</span>
      </div>
    `;
  }

  function renderMethodPicker() {
    const box = $('checkoutBox');
    if (!box) return;
    const hasChannels = Array.isArray(currentChannels) && currentChannels.length;
    box.hidden = false;
    document.body.classList.add('modal-open');
    box.innerHTML = `
      <div class="checkout-backdrop"></div>
      <div class="checkout-dialog method-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="methodPickerTitle">
        <div class="checkout-head">
          <div class="checkout-title-row">
            <span class="checkout-method-icon fallback" aria-hidden="true">Rp</span>
            <div>
              <span>Pembayaran Invoice</span>
              <strong id="methodPickerTitle">Pilih Metode Pembayaran</strong>
            </div>
          </div>
          <button class="icon-button" id="closeMethodPickerButton" type="button" aria-label="Tutup">×</button>
        </div>
        <p class="checkout-helper">Pilih satu metode. Nomor pembayaran atau QR akan muncul setelah metode dipilih.</p>
        ${hasChannels ? `
          <div class="payment-method-groups">
            ${groupedChannels(currentChannels).map((group) => `
              <section class="payment-method-group">
                <h2>${escapeHtml(group.label)}</h2>
                <div class="payment-method-list modal-list" role="listbox" aria-label="${escapeHtml(group.label)}">
                  ${group.channels.map((channel) => {
                    const code = String(channel.code || '').trim();
                    const name = channel.name || code || 'Metode pembayaran';
                    const meta = channelMetaLabel(channel);
                    return `
                      <button class="payment-method-card" type="button" role="option" data-payment-method="${escapeHtml(code)}" ${code ? '' : 'disabled'}>
                        ${channelIconMarkup(channel)}
                        <span class="payment-method-copy">
                          <strong>${escapeHtml(name)}</strong>
                          <small>${escapeHtml(meta || 'Payment gateway')}</small>
                        </span>
                        <span class="payment-method-chevron" aria-hidden="true">›</span>
                      </button>
                    `;
                  }).join('')}
                </div>
              </section>
            `).join('')}
          </div>
        ` : '<div class="payment-method-empty">Metode pembayaran belum tersedia.</div>'}
      </div>
    `;
    $('closeMethodPickerButton')?.addEventListener('click', hideCheckout);
    box.querySelectorAll('[data-payment-method]').forEach((button) => {
      button.addEventListener('click', () => {
        const method = button.dataset.paymentMethod || '';
        if (!method) return;
        const select = $('paymentMethodSelect');
        if (select) select.value = method;
        checkout(method);
      });
    });
  }

  async function openMethodPicker() {
    if (!currentInvoice || String(currentInvoice.status || '').toLowerCase() === 'paid') return;
    const select = $('paymentMethodSelect');
    if (select) select.value = '';
    if (!currentChannels.length) {
      await loadChannels();
    }
    renderMethodPicker();
  }

  function updateMethodHelp(message = '') {
    const help = $('paymentMethodHelp');
    const select = $('paymentMethodSelect');
    if (!help || !select) return;
    const selected = currentChannels.find((channel) => channel.code === select.value);
    const cashierFee = Number(selected?.cashierFee || 0);
    if (cashierFee > 0) {
      help.textContent = 'Total pembayaran sudah termasuk biaya layanan gerai. Silakan bayar sesuai nominal yang ditampilkan kasir.';
      return;
    }
    help.textContent = message || 'Pilih metode, nomor pembayaran atau QR akan muncul di halaman ini.';
  }

  function renderChannels(channels = [], message = '') {
    currentChannels = channels;
    const box = $('methodBox');
    const select = $('paymentMethodSelect');
    const help = $('paymentMethodHelp');
    const list = $('paymentMethodList');
    const payButton = $('payButton');
    if (!box || !select) return;
    const paid = String(currentInvoice?.status || '').toLowerCase() === 'paid';
    const onlineAllowed = currentInvoice && !paid && paymentGatewayEnabled;
    box.hidden = !onlineAllowed;
    if (payButton) {
      payButton.hidden = !onlineAllowed;
      payButton.disabled = !onlineAllowed || !channels.length;
      payButton.textContent = currentCheckout ? 'Pilih / Ganti Metode Pembayaran' : 'Pilih Metode Pembayaran';
    }
    if (list) {
      list.hidden = true;
      list.innerHTML = '';
    }
    if (!onlineAllowed) {
      renderPendingCheckoutSummary();
      return;
    }
    if (!channels.length) {
      select.innerHTML = '<option value="">Channel pembayaran tidak tersedia</option>';
      select.disabled = true;
      if (help) help.textContent = message || 'Channel aktif Tripay belum terbaca atau tidak sesuai nominal invoice.';
      renderPendingCheckoutSummary();
      return;
    }
    select.disabled = false;
    select.innerHTML = `
      <option value="">- Pilih Pembayaran -</option>
      ${channels.map((channel) => `
      <option value="${escapeHtml(channel.code || '')}">
        ${escapeHtml(channelLabel(channel))}
      </option>
      `).join('')}
    `;
    select.value = '';
    renderPendingCheckoutSummary();
    updateMethodHelp(currentCheckout
      ? 'Ada pembayaran tertunda. Lanjutkan pembayaran atau ganti metode bila pelanggan ingin memakai channel lain.'
      : (message || 'Klik tombol pilih metode untuk menampilkan daftar pembayaran.'));
  }

  async function api(path, options = {}) {
    const { retries = String(options.method || 'GET').toUpperCase() === 'GET' ? 2 : 0, timeoutMs = 15000, ...fetchOptions } = options;
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(path, {
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          ...fetchOptions,
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
          const error = new Error(payload.error || `HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        return payload;
      } catch (error) {
        lastError = error.name === 'AbortError' ? new Error('Koneksi pembayaran timeout') : error;
        const retryable = !error.status || error.status >= 500;
        if (!retryable || attempt >= retries) break;
        await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
      } finally {
        window.clearTimeout(timer);
      }
    }
    throw lastError || new Error('Request pembayaran gagal');
  }

  function render(payload) {
    const invoice = payload.invoice || {};
    currentInvoice = invoice;
    currentCheckout = String(invoice.status || '').toLowerCase() === 'paid' ? null : (invoice.paymentCheckout || null);
    paymentGatewayEnabled = payload.paymentGatewayEnabled !== false;
    if (payload.businessName) setText('businessName', payload.businessName);
    if (payload.appSubtitle) setText('paymentLabel', payload.appSubtitle);
    if (payload.businessName) document.title = `${payload.businessName} - Pembayaran Invoice`;
    if (payload.logoUrl && $('businessLogo')) $('businessLogo').src = payload.logoUrl;
    if (payload.logoUrl && $('appFavicon')) $('appFavicon').href = payload.logoUrl;
    setText('invoiceNo', invoice.invoiceNo || invoice.reference);
    setText('invoiceStatus', statusLabel(invoice.status));
    applyInvoiceStatusBadge(invoice.status);
    setText('customerName', invoice.customerName);
    setText('packageName', invoice.packageName);
    setText('period', periodText(invoice.period));
    setText('dueDate', dateText(invoice.dueDate));
    setText('addOns', invoice.addOnsText || invoice.addOnsTotalText || '-');
    setText('ppn', invoice.ppnText || '-');
    setText('discount', invoice.discountText || '-');
    setText('amount', invoice.amountText);
    setText('adminFee', invoice.adminFeeText);
    setText('gatewayAmount', invoice.gatewayAmountText);
    const paid = String(invoice.status || '').toLowerCase() === 'paid';
    const adminFeeRow = $('adminFeeRow');
    const adminFee = Number(invoice.adminFee || 0) || 0;
    const showAdminFee = invoice.showAdminFee !== false && adminFee > 0;
    if (adminFeeRow) adminFeeRow.hidden = !showAdminFee;
    setText('gatewayAmountLabel', paid ? 'Total Dibayar' : 'Total Bayar');
    const paidMethodRow = $('paidMethodRow');
    if (paidMethodRow) paidMethodRow.hidden = !paid;
    if (paid) {
      setText('paymentMethod', invoice.paymentMethod || '-');
      setText('paymentLabel', 'Bukti Pembayaran');
    }
    const button = $('payButton');
    if (button) {
      button.disabled = paid || payload.paymentGatewayEnabled === false;
      button.textContent = paid ? 'Invoice Sudah Dibayar' : 'Bayar Sekarang';
    }
    if (paid) {
      currentCheckout = null;
      hideCheckout();
      renderChannels([]);
    }
    else if (Array.isArray(payload.channels) && payload.channels.length) {
      renderChannels(payload.channels, payload.channelError || '');
    } else {
      renderChannels([], payload.channelError || 'Memuat channel pembayaran...');
    }
    if (!paid) {
      renderPendingCheckoutSummary();
    }
    if (paid) notice('Pembayaran invoice ini sudah tercatat lunas.');
    else if (payload.paymentGatewayEnabled === false) notice('Payment Gateway belum aktif. Hubungi admin.', 'error');
    else notice('');
  }

  async function loadChannels() {
    if (!currentInvoice || String(currentInvoice.status || '').toLowerCase() === 'paid') {
      renderChannels([]);
      return;
    }
    try {
      const amount = currentInvoice.gatewayAmount || currentInvoice.amount || 0;
      const payload = await api(`/api/public/payment-gateway/channels?kind=monthly-package&amount=${encodeURIComponent(amount)}&baseAmount=${encodeURIComponent(currentInvoice.amount || 0)}&adminFee=${encodeURIComponent(currentInvoice.adminFee || 0)}`);
      renderChannels(payload.channels || []);
    } catch (error) {
      renderChannels([], error.message || 'Channel payment gateway gagal dibaca');
    }
  }

  async function loadInvoice() {
    if (!invoiceRef) {
      notice('Nomor invoice tidak tersedia.', 'error');
      return;
    }
    const payload = await api(`/api/public/payment-gateway/invoices/${encodeURIComponent(invoiceRef)}`);
    render(payload);
    if (!Array.isArray(payload.channels) || !payload.channels.length) {
      await loadChannels();
    }
  }

  function renderPaymentSuccess(payload) {
    stopCheckoutPolling();
    const box = $('checkoutBox');
    if (!box) return;
    box.hidden = false;
    document.body.classList.add('modal-open');
    box.innerHTML = `
      <div class="checkout-backdrop"></div>
      <div class="checkout-dialog checkout-success-dialog" role="dialog" aria-modal="true" aria-labelledby="checkoutSuccessTitle">
        <div class="success-check" aria-hidden="true">
          <svg viewBox="0 0 52 52" focusable="false">
            <circle cx="26" cy="26" r="24"></circle>
            <path d="M15 27.5l7.2 7.2L38 18.8"></path>
          </svg>
        </div>
        <strong id="checkoutSuccessTitle">Pembayaran berhasil</strong>
        <span>Invoice sudah tercatat lunas.</span>
      </div>
    `;
    window.setTimeout(() => {
      hideCheckout();
      render(payload);
    }, 1500);
  }

  async function checkPaymentStatus(showNotice = true) {
    if (!invoiceRef) return null;
    try {
      const payload = await api(`/api/public/payment-gateway/invoices/${encodeURIComponent(invoiceRef)}`, {
        retries: 0,
        timeoutMs: 10000
      });
      const paid = String(payload.invoice?.status || '').toLowerCase() === 'paid';
      if (paid) {
        renderPaymentSuccess(payload);
        return payload;
      }
      if (showNotice) {
        const keepCheckoutOpen = Boolean(currentCheckout && !$('checkoutBox')?.hidden);
        render(payload);
        if (keepCheckoutOpen && currentCheckout) renderCheckout(currentCheckout);
        notice('Pembayaran belum terkonfirmasi. Coba cek lagi beberapa detik lagi.');
      }
      return payload;
    } catch (error) {
      if (showNotice) notice(error.message || 'Gagal cek status pembayaran', 'error');
      throw error;
    }
  }

  async function checkout(methodOverride = '') {
    if (!currentInvoice?.reference) return;
    const box = $('checkoutBox');
    if (checkoutInFlight) return;
    try {
      const method = methodOverride || $('paymentMethodSelect')?.value || '';
      if (!method) {
        throw new Error('Pilih metode pembayaran terlebih dahulu');
      }
      checkoutInFlight = true;
      if (box) renderCheckoutLoading();
      const payload = await api(`/api/public/payment-gateway/invoices/${encodeURIComponent(currentInvoice.reference)}/checkout`, {
        method: 'POST',
        body: JSON.stringify({ method })
      });
      if (payload.paid) {
        await checkPaymentStatus(true);
        return;
      }
      const checkoutData = payload.checkout || {};
      if (!(checkoutData.checkoutUrl || checkoutData.paymentUrl || checkoutData.payCode || checkoutData.qrUrl || checkoutData.qrString)) {
        throw new Error('Payment Gateway belum mengembalikan kode pembayaran');
      }
      currentCheckout = checkoutData;
      renderCheckout(currentCheckout);
      notice('Nomor pembayaran sudah disiapkan.');
    } catch (error) {
      notice(error.message, 'error');
      hideCheckout();
    } finally {
      checkoutInFlight = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('payButton')?.addEventListener('click', () => {
      openMethodPicker().catch((error) => notice(error.message || 'Metode pembayaran gagal dibuka', 'error'));
    });
    $('refreshButton')?.addEventListener('click', loadInvoice);
    $('paymentMethodSelect')?.addEventListener('change', (event) => {
      updateMethodHelp();
      const method = event.target.value || '';
      if (!method) {
        currentCheckout = null;
        hideCheckout();
        return;
      }
      checkout(method);
    });
    loadInvoice().catch((error) => notice(error.message, 'error'));
  });
}());
