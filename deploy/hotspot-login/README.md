# Integrasi QR Login Hotspot

Folder ini berisi aset pemindai QR untuk template login MikroTik. Salin `jsQR.js`
dan `voucher-qr-login.js` ke folder `assets` pada `html-directory` Hotspot.

Tambahkan kontrol berikut di dalam form `name="login"`, tepat di sebelah tombol
submit. CSS dapat disesuaikan dengan tema login yang digunakan.

```html
<div class="login-actions">
  <input type="submit" value="masuk" class="btn login-submit">
  <label class="qr-login-button" id="voucherQrTrigger" title="Scan QR voucher">
    <input id="voucherQrInput" type="file" accept="image/*" capture="environment">
    <span aria-hidden="true">QR</span>
  </label>
</div>
```

Muat aset sebelum tag penutup `body`:

```html
<script src="assets/jsQR.js"></script>
<script src="assets/voucher-qr-login.js"></script>
```

QR dari billing membuka URL login Site dengan fragment `fnb_autologin`. Agar
autentikasi CHAP dan PAP berjalan otomatis, tambahkan bridge berikut setelah
form login:

```html
<script>
(function voucherAutoLogin() {
  if (!window.location.hash) return;
  var params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get('fnb_autologin') !== '1') return;
  var username = params.get('username') || '';
  var password = params.get('password') || username;
  var loginForm = document.forms.login;
  if (!username || !loginForm) return;
  loginForm.username.value = username;
  loginForm.password.value = password;
  try {
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
  } catch (error) {}
  window.setTimeout(function () {
    if (typeof window.doLogin === 'function') window.doLogin();
    else loginForm.submit();
  }, 250);
}());
</script>
```

URL login tiap NAS diisi melalui `Monitoring > Site > Edit > URL Login Hotspot`.
Jangan menyimpan satu URL router global pada Pengaturan umum.
