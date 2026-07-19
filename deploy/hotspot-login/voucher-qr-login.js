(function voucherQrLoginScanner() {
  'use strict';

  var input = document.getElementById('voucherQrInput');
  var trigger = document.getElementById('voucherQrTrigger');
  var loginForm = document.forms.login;
  if (!input || !trigger || !loginForm) return;

  function imageFromFile(file) {
    if (window.createImageBitmap) return window.createImageBitmap(file);
    return new Promise(function (resolve, reject) {
      var image = new Image();
      var reader = new FileReader();
      reader.onload = function () { image.src = reader.result; };
      reader.onerror = reject;
      image.onload = function () { resolve(image); };
      image.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function applyQrValue(value) {
    var raw = String(value || '').trim();
    if (!raw) throw new Error('QR voucher kosong');
    try {
      var url = new URL(raw, window.location.href);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        window.location.replace(url.toString());
        return;
      }
    } catch (error) {}

    var pair = raw.split(/[\/:|]/).map(function (item) { return item.trim(); }).filter(Boolean);
    if (!pair.length) throw new Error('Format QR voucher tidak dikenali');
    loginForm.username.value = pair[0];
    loginForm.password.value = pair[1] || pair[0];
    if (typeof window.doLogin === 'function') window.doLogin();
    else loginForm.submit();
  }

  input.addEventListener('change', function () {
    var file = input.files && input.files[0];
    if (!file) return;
    trigger.classList.add('is-loading');
    imageFromFile(file).then(function (image) {
      var maxSize = 1600;
      var scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      var width = Math.max(1, Math.round(image.width * scale));
      var height = Math.max(1, Math.round(image.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height);
      if (typeof image.close === 'function') image.close();
      var pixels = context.getImageData(0, 0, width, height);
      var result = window.jsQR(pixels.data, width, height, { inversionAttempts: 'attemptBoth' });
      if (!result || !result.data) throw new Error('QR tidak terbaca. Pastikan gambar terang dan QR memenuhi kamera.');
      applyQrValue(result.data);
    }).catch(function (error) {
      window.alert(error.message || 'QR voucher gagal dipindai');
    }).finally(function () {
      trigger.classList.remove('is-loading');
      input.value = '';
    });
  });
}());
