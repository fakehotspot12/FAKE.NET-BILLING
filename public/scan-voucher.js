'use strict';

const video = document.getElementById('scannerVideo');
const canvas = document.getElementById('scannerCanvas');
const statusText = document.getElementById('scannerStatus');
const statusBox = document.getElementById('cameraShade');
const retryButton = document.getElementById('retryScanner');
const closeButton = document.getElementById('closeScanner');
const openBrowserLink = document.getElementById('openBrowser');
const helpBox = document.getElementById('cameraHelp');
const helpText = document.getElementById('cameraHelpText');
let mediaStream = null;
let animationFrame = 0;
let lastDecodeAt = 0;
let lastInvalidValue = '';
let lastInvalidAt = 0;
let completed = false;

function setScannerStatus(message, tone = '') {
  statusText.textContent = message;
  statusBox.className = `camera-shade${tone ? ` is-${tone}` : ''}`;
}

function isEmbeddedBrowser() {
  const agent = navigator.userAgent || '';
  return /CaptiveNetworkSupport|CaptivePortalLogin|; wv\)|\bwv\b|FBAN|FBAV|Instagram/i.test(agent);
}

function externalScannerUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('external', '1');
  url.hash = '';
  if (/Android/i.test(navigator.userAgent || '')) {
    const fallback = encodeURIComponent(url.toString());
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  }
  return url.toString();
}

function showPermissionHelp(error = {}) {
  const embedded = isEmbeddedBrowser();
  helpBox.hidden = false;
  openBrowserLink.hidden = new URLSearchParams(window.location.search).get('external') === '1' && !embedded;
  openBrowserLink.href = externalScannerUrl();
  if (embedded) {
    helpText.textContent = 'Jendela captive portal membatasi izin kamera. Buka halaman ini di Chrome atau Safari, lalu izinkan Kamera.';
  } else if (error.name === 'NotAllowedError') {
    helpText.textContent = 'Izin kamera pernah ditolak. Aktifkan Kamera pada pengaturan situs browser, lalu tekan Izinkan Kamera.';
  } else {
    helpText.textContent = 'Pastikan halaman dibuka melalui HTTPS dan kamera tidak sedang digunakan aplikasi lain.';
  }
}

function hidePermissionHelp() {
  helpBox.hidden = true;
  openBrowserLink.hidden = true;
}

function stopScanner() {
  window.cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  video.srcObject = null;
}

function safeCredential(value = '') {
  const text = String(value || '').trim();
  return text && text.length <= 128 && !/[\r\n]/.test(text) ? text : '';
}

function directLoginUrl(baseUrl = '', username = '', password = '') {
  try {
    const url = new URL(String(baseUrl || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.searchParams.delete('username');
    url.searchParams.delete('password');
    url.searchParams.delete('user');
    url.searchParams.delete('pass');
    url.hash = new URLSearchParams({
      fnb_autologin: '1',
      username,
      password: password || username
    }).toString();
    return url.toString();
  } catch {
    return '';
  }
}

function voucherLoginPayload(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const username = safeCredential(fragment.get('username') || url.searchParams.get('username') || url.searchParams.get('user'));
    const password = safeCredential(fragment.get('password') || url.searchParams.get('password') || url.searchParams.get('pass') || username);
    if (!username) return null;
    return {
      username,
      password,
      destination: directLoginUrl(url.toString(), username, password)
    };
  } catch {
    if (/^(WIFI|BEGIN|MECARD|mailto|tel):/i.test(raw)) return null;
    const pair = raw.split(/[|:]/, 2);
    const username = safeCredential(pair[0]);
    const password = safeCredential(pair[1] || username);
    if (!username || /\s/.test(username)) return null;
    const returnUrl = new URLSearchParams(window.location.search).get('return_url') || '';
    return {
      username,
      password,
      destination: directLoginUrl(returnUrl, username, password)
    };
  }
}

function completeVoucherLogin(payload = {}) {
  if (!payload.username) return false;
  completed = true;
  stopScanner();
  setScannerStatus('QR voucher terbaca. Menghubungkan ke Hotspot...', 'success');
  if (payload.destination) {
    window.setTimeout(() => window.location.replace(payload.destination), 250);
    return true;
  }
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({
      type: 'fnb:voucher-login',
      username: payload.username,
      password: payload.password || payload.username
    }, '*');
    window.setTimeout(() => window.close(), 350);
    return true;
  }
  completed = false;
  setScannerStatus('QR terbaca, tetapi alamat login Site tidak tersedia.', 'error');
  retryButton.hidden = false;
  return false;
}

function scanVideoFrame(timestamp = 0) {
  if (completed || !mediaStream) return;
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && timestamp - lastDecodeAt >= 120) {
    lastDecodeAt = timestamp;
    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = window.jsQR(pixels.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
    if (result?.data) {
      const payload = voucherLoginPayload(result.data);
      if (payload && completeVoucherLogin(payload)) return;
      const now = Date.now();
      if (result.data !== lastInvalidValue || now - lastInvalidAt > 1800) {
        lastInvalidValue = result.data;
        lastInvalidAt = now;
        setScannerStatus('QR terbaca, tetapi format voucher tidak dikenali.', 'error');
      }
    }
  }
  animationFrame = window.requestAnimationFrame(scanVideoFrame);
}

async function startScanner() {
  stopScanner();
  completed = false;
  retryButton.hidden = true;
  setScannerStatus('Meminta izin kamera...');
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Kamera membutuhkan koneksi HTTPS.');
    }
    if (typeof window.jsQR !== 'function') {
      throw new Error('Komponen pemindai QR gagal dimuat. Muat ulang halaman lalu coba lagi.');
    }
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    video.srcObject = mediaStream;
    await video.play();
    hidePermissionHelp();
    setScannerStatus('Arahkan QR voucher ke dalam kotak.');
    animationFrame = window.requestAnimationFrame(scanVideoFrame);
  } catch (error) {
    stopScanner();
    retryButton.hidden = false;
    showPermissionHelp(error);
    setScannerStatus(error.name === 'NotAllowedError'
      ? 'Izin kamera ditolak atau dibatasi captive portal.'
      : (error.message || 'Kamera tidak dapat dibuka.'), 'error');
  }
}

retryButton.addEventListener('click', startScanner);
closeButton.addEventListener('click', () => {
  stopScanner();
  if (window.history.length > 1) window.history.back();
  else window.location.href = '/voucher';
});
window.addEventListener('pagehide', stopScanner);
document.addEventListener('DOMContentLoaded', startScanner);
