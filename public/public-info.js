'use strict';

function setText(id, value) {
  const element = document.getElementById(id);
  if (element && value) element.textContent = value;
}

function setParagraph(id, value) {
  const element = document.getElementById(id);
  if (element && value) element.textContent = value;
}

function setImage(id, value) {
  const element = document.getElementById(id);
  if (element && value) element.src = value;
}

function normalizeWaPhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

function setList(id, value) {
  const element = document.getElementById(id);
  if (!element || !value) return;
  const lines = String(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return;
  element.innerHTML = '';
  for (const line of lines) {
    const item = document.createElement('li');
    item.textContent = line;
    element.appendChild(item);
  }
}

function applyPublicInfo(publicInfo = {}) {
  setText('heroTitle', publicInfo.heroTitle);
  setParagraph('heroText', publicInfo.heroText);
  setText('productTitle', publicInfo.productTitle);
  setParagraph('productText', publicInfo.productText);
  setText('voucherTitle', publicInfo.voucherTitle);
  setList('voucherSteps', publicInfo.voucherSteps);
  setText('billingTitle', publicInfo.billingTitle);
  setList('billingSteps', publicInfo.billingSteps);
  setText('termsTitle', publicInfo.termsTitle);
  setParagraph('termsText', publicInfo.termsText);
  setText('supportTitle', publicInfo.supportTitle);
  setParagraph('supportText', publicInfo.supportText);
  const contactButton = document.getElementById('contactButton');
  const waPhone = normalizeWaPhone(publicInfo.contactPhone);
  if (contactButton) {
    contactButton.textContent = publicInfo.contactLabel || publicInfo.contactPhone || 'Hubungi Whatsapp';
    contactButton.href = waPhone ? `https://wa.me/${waPhone}` : '#';
    contactButton.hidden = !waPhone && !publicInfo.contactLabel;
  }
}

async function loadBranding() {
  try {
    const response = await fetch('/api/branding', { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    const branding = payload.branding || {};
    setText('brandName', branding.businessName);
    setText('brandSubtitle', branding.appSubtitle);
    setText('businessInline', branding.businessName);
    setImage('brandLogo', branding.logoUrl);
    setImage('appFavicon', branding.logoUrl);
    if (branding.businessName) {
      document.title = `${branding.businessName} - Informasi Layanan`;
    }
    applyPublicInfo(payload.publicInfo || {});
  } catch {
    // Keep static fallback content when the API is unavailable.
  }
}

loadBranding();
