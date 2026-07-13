'use strict';

function setText(id, value) {
  const element = document.getElementById(id);
  if (element && value) element.textContent = value;
}

function setImage(id, value) {
  const element = document.getElementById(id);
  if (element && value) element.src = value;
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
  } catch {
    // Keep static fallback content when the API is unavailable.
  }
}

loadBranding();
