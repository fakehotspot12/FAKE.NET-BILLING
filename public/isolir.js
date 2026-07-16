'use strict';

(function () {
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const params = new URLSearchParams(window.location.search);
  const invoiceRef = params.get('invoice') || params.get('id') || params.get('reference') || params.get('no') || '';
  let paymentUrl = '/payment-invoice.html';
  let adminContact = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value = '') {
    const element = byId(id);
    if (element) element.textContent = value || '-';
  }

  function showNotice(message = '') {
    const box = byId('notice');
    if (!box) return;
    box.hidden = !message;
    box.textContent = message || '';
  }

  async function api(path) {
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || 'Request gagal');
    }
    return payload;
  }

  function periodText(value = '') {
    const text = String(value || '').trim();
    if (!text) return '-';
    return text.replace(/\b(\d{4})-(\d{2})(?!-\d{2})\b/g, (_, year, month) => {
      const index = Math.max(0, Math.min(11, Number(month) - 1));
      return `${MONTHS[index]} ${year}`;
    });
  }

  function dateText(value = '') {
    const text = String(value || '').trim();
    if (!text) return '-';
    const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return periodText(text);
    return `${String(Number(match[3])).padStart(2, '0')}/${String(Number(match[2])).padStart(2, '0')}/${match[1]}`;
  }

  function applyBranding(payload = {}) {
    const branding = payload.branding || payload.settings || payload;
    const businessName = branding.businessName || 'ISP Billing';
    const subtitle = branding.appSubtitle || 'RT/RW Net';
    const logoUrl = branding.logoUrl || '/fakenet-logo.png';
    setText('brandName', businessName);
    setText('brandSubtitle', subtitle);
    const logo = byId('brandLogo');
    if (logo) logo.src = logoUrl;
    const favicon = byId('appFavicon');
    if (favicon) favicon.href = logoUrl;
    document.title = `${businessName} - Layanan Diisolir`;
  }

  function adminMessage(invoice = {}) {
    const manualIsolation = invoice.manualIsolation === true || invoice.isolationMode === 'manual';
    const parts = [
      manualIsolation
        ? 'Halo Admin, layanan saya sedang ditangguhkan. Mohon dibantu pengecekan dan aktivasi kembali.'
        : 'Halo Admin, layanan saya sedang diisolir. Mohon dibantu cek tagihan.',
      invoice.invoiceNo || invoice.reference || invoiceRef ? `No Invoice: ${invoice.invoiceNo || invoice.reference || invoiceRef}` : '',
      invoice.customerName ? `Nama: ${invoice.customerName}` : ''
    ].filter(Boolean);
    return parts.join('\n');
  }

  function applyBillingIsolationText() {
    setText('statusPill', 'Layanan Diisolir');
    setText('heroTitle', 'Akses internet sementara ditangguhkan');
    setText('heroMessage', 'Layanan Anda belum aktif karena tagihan belum tercatat lunas atau akun sedang dalam masa isolir. Silakan lakukan pembayaran atau hubungi admin layanan.');
    setText('amountLabel', 'Total Tagihan');
    setText('footerLineOne', 'Pembayaran otomatis akan diproses oleh sistem billing.');
    setText('footerLineTwo', 'Jika sudah membayar, tunggu beberapa menit lalu restart modem.');
    const amountRow = byId('amountRow');
    if (amountRow) amountRow.hidden = false;
    showNotice('');
  }

  function applyManualIsolationText(invoice = {}) {
    setText('statusPill', 'Konfirmasi Admin');
    setText('heroTitle', 'Akses internet sedang ditangguhkan');
    setText('heroMessage', 'Layanan Anda sedang ditangguhkan oleh admin. Silakan konfirmasi ke admin untuk pengecekan dan aktivasi kembali.');
    setText('footerLineOne', 'Hubungi admin layanan untuk memastikan alasan penangguhan.');
    setText('footerLineTwo', 'Siapkan nama pelanggan atau ID layanan agar pengecekan lebih cepat.');
    const amountRow = byId('amountRow');
    if (amountRow) amountRow.hidden = true;
    showNotice(invoice.isolatedByName
      ? `Layanan ditangguhkan oleh ${invoice.isolatedByName}. Silakan hubungi admin.`
      : 'Layanan ditangguhkan manual. Silakan hubungi admin layanan.');
  }

  function updateAdminLink(invoice = {}) {
    const link = byId('adminLink');
    if (!link) return;
    const waPhone = adminContact?.waPhone || '';
    if (!waPhone) {
      link.href = '#';
      link.classList.add('is-disabled');
      link.setAttribute('aria-disabled', 'true');
      link.title = adminContact?.error || 'Nomor admin belum terbaca dari Whatsapp Gateway';
      return;
    }
    const target = new URL(`https://wa.me/${waPhone}`);
    target.searchParams.set('text', adminMessage(invoice));
    link.href = target.toString();
    link.classList.remove('is-disabled');
    link.setAttribute('aria-disabled', 'false');
    link.title = adminContact?.name ? `Hubungi ${adminContact.name}` : 'Hubungi Admin';
  }

  function renderInvoice(payload = {}) {
    const invoice = payload.invoice || {};
    const manualIsolation = invoice.manualIsolation === true || invoice.isolationMode === 'manual' || invoice.canPay === false;
    const invoiceNo = invoice.invoiceNo || invoice.reference || invoiceRef || '-';
    if (manualIsolation) applyManualIsolationText(invoice);
    else applyBillingIsolationText();
    setText('invoiceNo', invoiceNo);
    setText('customerName', invoice.customerName || '-');
    setText('period', periodText(invoice.period || invoice.coverageText || invoice.coveredPeriodText || ''));
    setText('dueDate', dateText(invoice.dueDate || ''));
    setText('amount', invoice.gatewayAmountText || invoice.totalText || invoice.amountText || '-');
    const invoiceBox = byId('invoiceBox');
    if (invoiceBox) invoiceBox.hidden = false;
    const payLink = byId('payLink');
    if (payLink) {
      payLink.hidden = manualIsolation;
      if (!manualIsolation) {
        const target = new URL(paymentUrl, window.location.href);
        target.searchParams.set('id', invoice.reference || invoiceNo);
        payLink.href = target.toString();
      }
    }
    updateAdminLink(invoice);
  }

  function applySubwebLinks(payload = {}) {
    const urls = payload.urls || {};
    const payLink = byId('payLink');
    if (urls.payment) paymentUrl = urls.payment;
    if (payLink && invoiceRef) {
      const target = new URL(paymentUrl, window.location.href);
      target.searchParams.set('id', invoiceRef);
      payLink.href = target.toString();
    }
  }

  async function init() {
    try {
      applySubwebLinks(await api('/api/public/subweb-config'));
    } catch {
      applySubwebLinks({});
    }

    try {
      applyBranding(await api('/api/branding'));
    } catch {
      applyBranding({});
    }

    try {
      adminContact = await api('/api/public/wa-admin-contact');
    } catch (error) {
      adminContact = { available: false, error: error.message || 'Nomor admin belum terbaca' };
    }
    updateAdminLink({});

    if (!invoiceRef) {
      applyManualIsolationText({});
      return;
    }

    try {
      renderInvoice(await api(`/api/public/payment-gateway/invoices/${encodeURIComponent(invoiceRef)}`));
    } catch (error) {
      showNotice(error.message || 'Invoice belum bisa dibaca. Hubungi admin layanan.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
}());
