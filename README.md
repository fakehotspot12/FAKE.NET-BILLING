# FAKE.NET Billing and Office ISP

Billing standalone ISP/RT-RW Net berbasis Node.js untuk operasional pelanggan PPP-DHCP, Hotspot voucher, tagihan, monitoring, payment gateway, Whatsapp Gateway, GenieACS, aset, inventaris, dan laporan.

Data runtime tidak disertakan ke repository. Folder `data/` diabaikan oleh Git kecuali `.gitkeep`, sehingga data dev/produksi tidak ikut terupload.

## Fitur Utama

- Dashboard keuangan, tagihan, PPP-DHCP users, Hotspot users, dan traffic NAS.
- Radius PPP-DHCP dan Hotspot: user, profile, session, import/export, generate voucher, kick session, isolir/aktif/terminate.
- Billing mandiri: invoice otomatis/manual, reminder, bayar, rollback, PDF kuitansi, laporan harian/bulanan.
- Voucher Hotspot online: order dari login page, pembayaran QRIS, generate voucher otomatis setelah paid, dan cetak voucher batch.
- Payment Gateway terpusat untuk paket bulanan dan voucher. Provider awal: Tripay, struktur siap untuk provider lain.
- Whatsapp Gateway API memakai WAHA lokal: template, pesan terkirim, resend, broadcast, dan notifikasi tagihan/voucher.
- Monitoring: Site/NAS, pelanggan online, tagihan pelanggan, member, dan GenieACS.
- Portal publik:
  - Isolir untuk pelanggan yang ditangguhkan.
  - Voucher untuk pembelian voucher Hotspot.
  - WifiKu untuk pelanggan melihat usage bulanan, redaman, ganti SSID/password, dan reboot ONU jika GenieACS aktif.
- Manajemen aset, inventaris, stok, mutasi stok, notifikasi stok/aset bermasalah.
- Role user: admin, owner, finance, teknisi, NOC, collector, reseller voucher, viewer.
- Aktivasi lisensi berbasis HWID/machine code.
- Backup/restore dan update aplikasi dari menu Pengaturan.

## Member PPP-DHCP

Member PPP-DHCP digunakan untuk pelanggan bulanan seperti PPPoE dan DHCP yang ditagihkan secara periodik. Data pelanggan dibuat dari wizard akun, member, payment, dan review sehingga informasi teknis internet, identitas pelanggan, nomor Whatsapp, alamat, titik lokasi peta, foto rumah, profile layanan, NAS, serta detail pembayaran tersimpan dalam satu alur.

Saat user PPP-DHCP dibuat, aplikasi dapat sekaligus membuat data member dengan ID pelanggan otomatis. Profile PPP-DHCP menyimpan harga paket, mode billing, VAT, diskon, dan parameter bandwidth atau link ke profile Mikrotik. Data autentikasi dan session menggunakan FreeRADIUS, sehingga status online/offline, kick session, suspend, aktif kembali, dan terminated tidak hanya tampil di aplikasi tetapi juga terkait dengan backend Radius.

Alur operasional member PPP-DHCP:

1. Admin, NOC, teknisi, collector, atau role yang diberi izin membuat atau mengubah user PPP-DHCP sesuai kewenangannya.
2. Sistem menyimpan data akun internet, data kontak member, detail pembayaran, dan profile layanan.
3. Invoice dapat dibuat otomatis sesuai billing setting atau manual dari menu tagihan.
4. Reminder tagihan dikirim melalui Whatsapp Gateway berdasarkan template yang bisa diatur.
5. Pembayaran bisa dicatat manual oleh user berwenang atau diterima otomatis dari payment gateway.
6. Jika invoice sudah paid, pelanggan tetap aktif dan tidak ikut proses isolir.
7. Jika melewati jatuh tempo sesuai pengaturan, sistem dapat melakukan isolir otomatis dan mengirim notifikasi.
8. Pelanggan yang sudah membayar setelah isolir dapat diaktifkan kembali, termasuk trigger session/COA Radius bila tersedia.

Data lokasi pelanggan dapat disimpan dari izin lokasi browser atau ditandai manual pada peta. Foto rumah pelanggan disimpan sebagai referensi lapangan agar teknisi, NOC, dan collector lebih mudah menemukan titik pemasangan, memverifikasi pelanggan pindah alamat, atau melengkapi data saat kunjungan. Di menu Member, data kontak, alamat, peta, foto rumah, detail internet, dan invoice dibuat mudah ditinjau tanpa membuka banyak halaman.

Monitoring member PPP-DHCP memuat status pelanggan, status pembayaran, NAS, kontak, alamat, invoice, serta data pendukung untuk pekerjaan lapangan. Portal WifiKu dapat digunakan pelanggan untuk melihat pemakaian bulanan, redaman, dan aksi perangkat jika integrasi GenieACS aktif.

## Voucher Hotspot

Voucher Hotspot dirancang untuk operasional jual voucher harian/mingguan/bulanan tanpa input manual berulang. Admin atau reseller dapat membuat voucher satuan maupun batch dari profile Hotspot yang sudah memiliki harga, validity, quota, shared user, NAS, dan expired mode.

Alur voucher online:

1. Pelanggan membuka halaman beli voucher dari subdomain/port Voucher.
2. Pelanggan memilih paket voucher Hotspot yang tersedia.
3. Sistem membuat order dan mengarahkan pembayaran ke payment gateway.
4. Untuk voucher online, metode pembayaran dipatenkan ke QRIS.
5. Setelah payment gateway mengirim status paid ke webhook, sistem membuat voucher otomatis dengan format username sama dengan password.
6. Voucher dapat dikirim melalui Whatsapp Gateway jika notifikasi voucher diaktifkan.
7. Transaksi voucher paid masuk ke laporan voucher harian/bulanan dan pendapatan reseller sesuai role pembuat voucher.

Voucher batch untuk operasional loket/reseller dapat dicetak langsung dari aplikasi. Format print dibuat ringkas agar satu kertas A4 dapat memuat banyak voucher, lengkap dengan nama usaha, paket, harga, tanggal, jam, QR code, dan link login Hotspot.

Untuk role reseller voucher, data dibuat terpisah berdasarkan pembuat voucher dan NAS yang dikunci pada user tersebut. Reseller hanya melihat, mencetak, dan mengelola voucher yang dibuat olehnya sendiri, sehingga stok voucher, transaksi, dan pendapatan reseller tidak tercampur dengan reseller lain. Admin dan role yang diberi kewenangan lebih tinggi tetap dapat melakukan audit sesuai kebutuhan operasional.

Expired mode mengikuti profile Hotspot, misalnya `None`, `Remove`, `Remove & Record`, `Notice`, dan `Notice & Record`. Mode `Remove & Record` akan menghapus user voucher setelah masa aktif habis tetapi tetap menyimpan record laporan, sedangkan mode notice mempertahankan data user dengan status yang sesuai.

## Manajemen Aset

Manajemen Aset dipakai untuk mencatat perangkat, tools, dan stok barang yang umum dipakai operasional ISP/RT-RW Net. Menu ini memisahkan aset tetap dan inventaris stok agar perangkat server, router, switch, OLT/ONU cadangan, alat kerja teknisi, modem, splitter, adaptor, patchcord, barrel FO, selongsong, solasi, baterai, dan barang habis pakai lain dapat dipantau rapi.

Inventaris memiliki master stok dan mutasi masuk/keluar. Saat teknisi atau admin mengambil barang untuk pemasangan, perbaikan, atau penggantian perangkat, stok dapat dikurangi dari aplikasi dan tercatat siapa yang melakukan update. Jika stok ditambah dari pembelian atau pengembalian barang, mutasi masuk ikut tersimpan. Laporan stok inventaris membantu melihat pergerakan barang tanpa mencampurnya dengan laporan keuangan utama.

Aset digunakan untuk barang yang perlu dilacak kondisinya, misalnya perangkat di server, perangkat jaringan, atau tools kerja. Status seperti baik, rusak, hilang, atau perlu pengecekan dapat dipakai sebagai dasar notifikasi. Jika ada barang rusak/hilang atau stok inventaris hampir habis, aplikasi menampilkan notifikasi untuk role yang berwenang agar pengadaan atau perbaikan bisa cepat ditindaklanjuti.

Role barang dapat disesuaikan: teknisi dapat mengelola kebutuhan lapangan, admin dapat mengaudit dan mengatur master data, sedangkan role lain hanya melihat sesuai izin. Data aset dan inventaris ikut dalam backup aplikasi sehingga tetap aman saat pindah mesin atau restore.

## Port Default

| Service | Port | Keterangan |
| --- | ---: | --- |
| Billing admin | 8891 | Aplikasi utama |
| Isolir | 8892 | Web pelanggan isolir |
| Voucher | 8893 | Web beli voucher |
| WifiKu | 8894 | Portal pelanggan |
| WAHA lokal | 8895 | Whatsapp API lokal, bind ke 127.0.0.1 |

Contoh subdomain:

- `billing.example.net` -> `SERVER:8891`
- `isolir.example.net` -> `SERVER:8892`
- `voucher.example.net` -> `SERVER:8893`
- `wifiku.example.net` -> `SERVER:8894`

## Kebutuhan Sistem

Minimal setara Ubuntu 22.04:

- Linux x86_64/arm64
- Node.js 18+
- npm
- PostgreSQL
- Redis
- FreeRADIUS
- Docker untuk WAHA
- Git, curl, rsync, tar, gzip

`install.sh` mendukung keluarga:

- Debian/Ubuntu dengan `apt`
- CentOS/RHEL/Rocky/Alma/Fedora dengan `dnf`/`yum`
- Alpine Linux dengan `apk` dan OpenRC

## Install

Jalankan dari folder project:

```bash
sudo bash install.sh
```

Default install ke:

```bash
/opt/fakenet-billing
```

Yang dikerjakan otomatis oleh `install.sh`:

- Install paket OS yang dibutuhkan: Node.js 18+, npm, PostgreSQL, Redis, FreeRADIUS, Docker, Git, curl, rsync, tar, dan gzip.
- Jika Node.js bawaan distro terlalu lama, installer mencoba memasang Node.js 20 dari repository NodeSource.
- Copy source aplikasi ke `/opt/fakenet-billing` tanpa membawa data runtime.
- Install dependency Node dari `package-lock.json`.
- Membuat `/etc/fakenet-billing.env` dan `/etc/fakenet-billing-waha.env`.
- Membuat password random untuk database aplikasi, database Radius, dan WAHA.
- Membuat database PostgreSQL `fakenet_billing` dan `radius`.
- Membuat schema FreeRADIUS dasar: `nas`, `radcheck`, `radreply`, `radusergroup`, `radgroupcheck`, `radgroupreply`, dan `radacct`.
- Mengaktifkan konfigurasi SQL PostgreSQL FreeRADIUS secara best-effort.
- Memasang service Billing, Isolir, Voucher, WifiKu, Radius Connector, dan WAHA.
- Memasang command stack `fakenet-billing-stack`.

Yang tetap perlu diatur setelah install:

- License key aplikasi dari HWID/machine code.
- Domain/subdomain publik dan HTTPS reverse proxy jika aplikasi dipublish ke internet.
- Payment gateway merchant key, private key, dan callback domain.
- Scan Whatsapp API Gateway dari menu aplikasi.
- Site/NAS, secret Radius, SNMP community, profile PPP-DHCP/Hotspot, dan rule MikroTik.

Env utama:

```bash
/etc/fakenet-billing.env
/etc/fakenet-billing-waha.env
```

## Service

Systemd:

```bash
fakenet-billing-stack start
fakenet-billing-stack restart
fakenet-billing-stack stop
fakenet-billing-stack status
fakenet-billing-stack update
```

Service utama:

- `fakenet-billing.service`
- `fakenet-billing-isolir.service`
- `fakenet-billing-voucher.service`
- `fakenet-billing-wifiku.service`
- `fakenet-billing-radius-connector.service`
- `fakenet-billing-waha.service`

## Update Aman

Update dari web:

1. Login sebagai admin.
2. Buka `Pengaturan`.
3. Klik `Update Aplikasi`.

Update dari terminal:

```bash
sudo fakenet-billing-stack update
```

Updater akan:

1. Membuat backup pre-update ke `/var/backups/fakenet-billing`.
2. Mengambil source terbaru via Git jika folder punya `.git`.
3. Atau memakai `FAKENET_UPDATE_ARCHIVE_URL` jika install dari archive.
4. Menjalankan `npm ci --omit=dev` atau `npm install --omit=dev`.
5. Restart service stack.

Data aplikasi di `data/` tidak dihapus oleh updater.

Log update:

```bash
/var/log/fakenet-billing/update.log
```

## Lisensi

Aktivasi aplikasi memakai HWID/machine code dari mesin install. Saat `LICENSE_ENFORCE=1`, aplikasi wajib diaktivasi sebelum login.

Durasi lisensi yang tersedia:

- `7d`
- `30d`
- `90d`
- `180d`
- `1y`
- `lifetime`

Mesin pelanggan hanya membutuhkan public key validasi di `/etc/fakenet-billing.env`:

```bash
LICENSE_ENFORCE=1
LICENSE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

Generator license key tidak disertakan dalam repository/install publik. Setelah install, halaman aktivasi menampilkan HWID/machine code. Pelanggan mengirim HWID tersebut ke customer service, lalu memasukkan license key yang diterima ke halaman aktivasi.

## Backup dan Restore

Dari aplikasi:

- `Pengaturan` -> `Download Backup`
- `Pengaturan` -> `Restore Backup`

Backup memuat data penting aplikasi seperti user, member, Radius, invoice, transaksi, inventaris, aset, WA Gateway, payment gateway, dan konfigurasi.

## Catatan Payment Gateway

Halaman login memuat informasi publik yang dibutuhkan untuk review payment gateway:

- Produk layanan yang dijual.
- Ringkasan syarat dan ketentuan.
- Kontak customer service: `083878122381`.

Untuk Tripay, callback/webhook default:

```text
https://billing-domain.example.net/api/payment-gateway/webhook
```

Satu webhook dipakai untuk pembayaran voucher dan paket bulanan. Voucher dikunci ke QRIS, paket bulanan mengikuti channel yang diaktifkan di provider.

## GitHub Release

Sebelum upload ke GitHub:

- Pastikan `data/store.json` tidak ikut commit.
- Pastikan `/etc/*.env` tidak ikut commit.
- Pastikan private key lisensi tidak ada di repository.
- Gunakan `.env.example` dan file `deploy/*.env` sebagai template saja.

Default user untuk install baru dibuat otomatis jika data masih kosong:

```text
username: admin
password: billing123
```

Segera ubah password setelah login pertama.
