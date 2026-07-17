(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const invoiceRef = params.get('id') || params.get('invoice') || params.get('reference') || '';
  let currentInvoice = null;
  let currentChannels = [];
  let paymentGatewayEnabled = false;
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

  function channelLabel(channel = {}) {
    const parts = [
      channel.name || channel.code || '',
      channel.group || '',
      channel.type ? channel.type.toUpperCase() : ''
    ].filter(Boolean);
    return parts.join(' - ');
  }

  function rupiah(value = 0) {
    return `Rp. ${Math.max(0, Number(value || 0) || 0).toLocaleString('id-ID')}`;
  }

  function updateMethodHelp(message = '') {
    const help = $('paymentMethodHelp');
    const select = $('paymentMethodSelect');
    if (!help || !select) return;
    const selected = currentChannels.find((channel) => channel.code === select.value);
    const cashierFee = Number(selected?.cashierFee || 0);
    if (cashierFee > 0) {
      help.textContent = `Fee tetap ${currentInvoice?.adminFeeText || rupiah(currentInvoice?.adminFee)}. ${rupiah(cashierFee)} dari Fee dibayarkan langsung di kasir gerai.`;
      return;
    }
    help.textContent = message || 'Pilih salah satu metode pembayaran aktif dari Tripay.';
  }

  function renderChannels(channels = [], message = '') {
    currentChannels = channels;
    const box = $('methodBox');
    const select = $('paymentMethodSelect');
    const help = $('paymentMethodHelp');
    const payButton = $('payButton');
    if (!box || !select) return;
    const paid = String(currentInvoice?.status || '').toLowerCase() === 'paid';
    const onlineAllowed = currentInvoice && !paid && paymentGatewayEnabled;
    box.hidden = !onlineAllowed;
    if (payButton && !paid) {
      payButton.disabled = !onlineAllowed || !channels.length;
    }
    if (!onlineAllowed) return;
    if (!channels.length) {
      select.innerHTML = '<option value="">Channel pembayaran tidak tersedia</option>';
      select.disabled = true;
      if (help) help.textContent = message || 'Channel aktif Tripay belum terbaca atau tidak sesuai nominal invoice.';
      return;
    }
    select.disabled = false;
    select.innerHTML = channels.map((channel, index) => `
      <option value="${escapeHtml(channel.code || '')}" ${index === 0 ? 'selected' : ''}>
        ${escapeHtml(channelLabel(channel))}
      </option>
    `).join('');
    updateMethodHelp(message);
  }

  async function api(path, options) {
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload;
  }

  function render(payload) {
    const invoice = payload.invoice || {};
    currentInvoice = invoice;
    paymentGatewayEnabled = payload.paymentGatewayEnabled !== false;
    if (payload.businessName) setText('businessName', payload.businessName);
    if (payload.appSubtitle) setText('paymentLabel', payload.appSubtitle);
    if (payload.businessName) document.title = `${payload.businessName} - Pembayaran Invoice`;
    if (payload.logoUrl && $('businessLogo')) $('businessLogo').src = payload.logoUrl;
    if (payload.logoUrl && $('appFavicon')) $('appFavicon').href = payload.logoUrl;
    setText('invoiceNo', invoice.invoiceNo || invoice.reference);
    setText('invoiceStatus', statusLabel(invoice.status));
    setText('customerName', invoice.customerName);
    setText('packageName', invoice.packageName);
    setText('period', periodText(invoice.period));
    setText('dueDate', dateText(invoice.dueDate));
    setText('amount', invoice.amountText);
    setText('adminFee', invoice.adminFeeText);
    setText('gatewayAmount', invoice.gatewayAmountText);
    const paid = String(invoice.status || '').toLowerCase() === 'paid';
    const button = $('payButton');
    if (button) {
      button.disabled = paid || payload.paymentGatewayEnabled === false;
      button.textContent = paid ? 'Invoice Sudah Dibayar' : 'Bayar Sekarang';
    }
    renderChannels([], paid ? '' : 'Memuat channel pembayaran...');
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
    await loadChannels();
  }

  async function checkout() {
    if (!currentInvoice?.reference) return;
    const button = $('payButton');
    const box = $('checkoutBox');
    const text = $('checkoutText');
    const link = $('checkoutLink');
    try {
      const method = $('paymentMethodSelect')?.value || '';
      if (!method) {
        throw new Error('Pilih metode pembayaran terlebih dahulu');
      }
      if (button) {
        button.disabled = true;
        button.textContent = 'Membuat checkout...';
      }
      const payload = await api(`/api/public/payment-gateway/invoices/${encodeURIComponent(currentInvoice.reference)}/checkout`, {
        method: 'POST',
        body: JSON.stringify({ method })
      });
      if (payload.paid) {
        notice('Invoice sudah lunas.');
        await loadInvoice();
        return;
      }
      const checkoutData = payload.checkout || {};
      const url = checkoutData.checkoutUrl || checkoutData.paymentUrl || '';
      if (!url) {
        throw new Error('Payment Gateway belum mengembalikan checkout URL');
      }
      const selectedChannel = currentChannels.find((channel) => channel.code === method);
      if (text) text.textContent = `Metode ${checkoutData.method || selectedChannel?.name || currentInvoice.paymentMethod || '-'} sudah disiapkan. Lanjutkan pembayaran dari tautan berikut.`;
      if (link) link.href = url;
      if (box) box.hidden = false;
      window.location.href = url;
    } catch (error) {
      notice(error.message, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Bayar Sekarang';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('payButton')?.addEventListener('click', checkout);
    $('refreshButton')?.addEventListener('click', loadInvoice);
    $('paymentMethodSelect')?.addEventListener('change', () => updateMethodHelp());
    loadInvoice().catch((error) => notice(error.message, 'error'));
  });
}());
