# Changelog

Semua perubahan penting FAKE.NET Billing dicatat di file ini.

Format versi memakai pola `major.minor.patch`:

- Patch/minor kecil: `1.0.0` ke `1.0.1`
- Perubahan besar fitur/struktur: `1.0.0` ke `1.1.0`

## [1.0.38] - 2026-07-16

### Added

- Kartu dashboard `PPP-DHCP Users` dan `Hotspot Users` sekarang memiliki tombol `...` untuk langsung membuka menu Radius terkait.

### Fixed

- Submit wizard tambah user PPP-DHCP dibuat lebih tahan terhadap event mobile/Enter agar tombol `Simpan` di tahap Review tidak macet pada role non-admin yang punya izin membuat user.
- Login dengan kode verifikasi sekarang memvalidasi kesiapan kode sebelum request login dan refresh kode hanya saat verifikasi aktif.
- Validasi profile PPP-DHCP dan Hotspot di frontend sekarang menolak pilihan kosong/`None` secara konsisten.

## [1.0.37] - 2026-07-16

### Fixed

- Edit profil user PPP-DHCP sekarang menyinkronkan paket dan harga member terkait dari profil baru.
- Invoice yang sudah dibuat sebelumnya tetap dibiarkan sesuai nominal lama agar histori tagihan tidak berubah diam-diam.

## [1.0.36] - 2026-07-16

### Changed

- Panel `Check for Update` sekarang menampilkan status `Up to Date` saat versi lokal sudah sama dengan rilis terbaru.
- Teks `Update tersedia` hanya ditampilkan ketika nomor versi rilis terbaru berbeda dari versi yang terpasang.

## [1.0.35] - 2026-07-16

### Changed

- Kolom `Terakhir Aktif` pada menu GenieACS dipindahkan ke sisi kanan tabel, tepat sebelum kolom `Aksi`.

## [1.0.34] - 2026-07-16

### Added

- Menu GenieACS menampilkan kolom `Terakhir Aktif` dari `_lastInform` agar ONU/CPE yang lama offline lebih mudah diaudit.

### Changed

- Lebar tabel GenieACS disesuaikan agar tambahan kolom tetap rapi pada tampilan desktop.

## [1.0.33] - 2026-07-16

### Fixed

- Migrasi data otomatis membatalkan invoice prorata bulan pemasangan yang terlanjur dibuat untuk member Postpaid Billing Cycle dengan status invoice awal `Paid`.
- Invoice invalid tersebut hanya diubah menjadi `cancelled`, tidak dihapus, sehingga histori nomor invoice dan audit tetap aman.

## [1.0.32] - 2026-07-16

### Fixed

- Postpaid Billing Cycle tidak lagi membuat invoice prorata pada bulan pemasangan jika status invoice awal member adalah `Paid` atau tidak ditandai eksplisit `Unpaid`.
- Status invoice awal PPP-DHCP + member ikut disimpan sebagai `paymentStatus` pada user Radius agar audit Paid/Unpaid tidak kosong.

## [1.0.31] - 2026-07-16

### Changed

- Template WhatsApp invoice terbit dan reminder sekarang menampilkan format eksplisit `H+[suspend_grace_days] ([suspend_grace_days] hari)` di kalimat isolir.

### Fixed

- Template WA tersimpan yang sudah memakai `[suspend_grace]` pada invoice/reminder otomatis dimigrasikan ke variable `[suspend_grace_days]` agar editor template menampilkan variable hari secara jelas.

## [1.0.30] - 2026-07-16

### Changed

- Template WhatsApp invoice terbit dan reminder sekarang memakai variable `[suspend_grace]` dari Billing Setting > Isolir.
- Panel variable template WA menampilkan `[suspend_grace]` dan `[suspend_grace_days]`.

### Fixed

- Template WA lama yang masih berisi teks `H+5 (5 hari)` otomatis dimigrasikan ke `[suspend_grace]` dan tetap mengikuti nilai isolir terbaru saat pesan dikirim.

## [1.0.29] - 2026-07-16

### Changed

- Tampilan Monitoring Member diringkas agar username PPP-DHCP tidak tampil dobel ketika nama member belum diisi berbeda.
- Row member menampilkan informasi `Dibuat oleh` dari data pembuat customer atau fallback user Radius terkait.

## [1.0.28] - 2026-07-16

### Added

- Menu GenieACS menambahkan filter kualitas redaman `Bagus`, `Normal`, dan `Tinggi`.
- Tabel GenieACS menampilkan kolom suhu modem di sebelah kanan redaman.

### Fixed

- Pilihan pager `All` pada GenieACS sekarang menampilkan semua device sesuai filter, tidak lagi dibatasi 100 data.

## [1.0.27] - 2026-07-16

### Fixed

- Monitoring GenieACS sekarang memprioritaskan `VirtualParameters.RXPower` agar redaman hasil normalisasi ACS dipakai lebih dulu.
- Raw redaman positif dari modem XPON/CT/CMCC seperti `60` dinormalisasi menjadi dBm negatif, sehingga tidak tampil sebagai `+60 dBm`.

## [1.0.26] - 2026-07-16

### Changed

- Toolbar portal WifiKu sekarang hanya menampilkan filter bulan karena identitas member sudah dipindahkan ke panel Informasi Member.

## [1.0.25] - 2026-07-16

### Added

- Portal WifiKu menampilkan ringkasan informasi member berisi ID Member, Nama, dan Paket di atas ringkasan tagihan.

### Changed

- Nama paket WifiKu sekarang memakai fallback dari profile Radius pelanggan jika data member belum menyimpan nama paket.

## [1.0.24] - 2026-07-16

### Changed

- Portal WifiKu sekarang menyembunyikan baris SSID 5G jika modem pelanggan hanya memiliki WiFi 2.4G.
- Ringkasan client WiFi di WifiKu tidak lagi menampilkan `5G 0` jika parameter SSID 5G tidak ditemukan di GenieACS.

## [1.0.23] - 2026-07-16

### Added

- Modal ubah WiFi di portal WifiKu sekarang memiliki checkbox `Lihat password`.

### Changed

- Checkbox password WifiKu dibuat ringkas agar tetap rapi di tampilan mobile dan desktop.

## [1.0.22] - 2026-07-16

### Added

- Portal WifiKu sekarang mengganti SSID dan password per band 2.4G atau 5G dari tombol `Ubah` masing-masing.

### Changed

- Field password WifiKu dibuat opsional; jika dikosongkan, sistem hanya mengubah SSID dan tidak menyentuh password lama.
- Perintah WifiKu divalidasi memakai parameter WiFi yang benar-benar terbaca dari device pelanggan di GenieACS.

## [1.0.21] - 2026-07-15

### Fixed

- `Check for Update` tidak lagi memakai changelog lokal lama ketika update tersedia tetapi changelog remote gagal dibaca.
- Jika versi remote sama tetapi commit remote lebih baru, panel update menampilkan ringkasan revisi remote sebagai fallback.
- Menambahkan test agar fallback update tidak kembali menampilkan riwayat lama ketika banyak perubahan dilakukan tanpa bump versi.

## [1.0.20] - 2026-07-15

### Fixed

- `Check for Update` sekarang tetap menampilkan ringkasan perubahan jika remote memiliki commit baru tetapi versi aplikasi belum dinaikkan.
- Panel update membedakan `Update tersedia` dengan `Revisi update tersedia` untuk kasus versi sama tetapi revisi remote lebih baru.
- Changelog update memakai fallback daftar commit remote agar perubahan tidak tersembunyi saat `CHANGELOG.md` lupa diperbarui.

## [1.0.19] - 2026-07-15

### Changed

- Menambahkan dokumentasi `Metode Pembayaran Member` di README, termasuk mapping `Postpaid/Prepaid`, `Fixed Date`, `Billing Cycle`, dan `Renewal`.
- Menjelaskan contoh prorata `Postpaid + Billing Cycle` agar installer/client memahami tagihan awal pelanggan baru.

## [1.0.18] - 2026-07-15

### Added

- Menambahkan prorata invoice pertama untuk pelanggan `Postpaid + Billing Cycle`.
- Invoice pertama Billing Cycle sekarang dihitung dari `Active Date` sampai due date cycle pertama, lalu invoice berikutnya kembali full bulanan.

### Fixed

- Scheduler invoice otomatis tidak membuat invoice prorata sebelum `Active Date` pelanggan, meskipun sudah masuk window H-minus jatuh tempo.

## [1.0.17] - 2026-07-15

### Changed

- Periode billing member sekarang mengikuti tipe pembayaran seperti Radboox: `Postpaid` hanya `Fixed Date/Billing Cycle`, sedangkan `Prepaid` hanya `Fixed Date/Renewal`.
- `Postpaid + Billing Cycle` memakai `Due date postpaid` dari Billing Setting sebagai tanggal jatuh tempo global.

### Fixed

- Kombinasi lama yang tidak valid seperti `Postpaid + Renewal` atau `Prepaid + Billing Cycle` dinormalisasi ke `Fixed Date` agar invoice tidak memakai aturan yang salah.
- Filter dan edit Payment Detail member menampilkan pilihan Billing Period sesuai Payment Type.

## [1.0.16] - 2026-07-15

### Fixed

- Installer/repair FreeRADIUS sekarang mengizinkan username PPP-DHCP/Hotspot lokal dengan suffix pendek seperti `user@km` atau `user@pb`.
- Konfigurasi SQL FreeRADIUS dipaksa memakai `User-Name` utuh agar username berisi `@` tidak dipotong sebagai realm.

## [1.0.15] - 2026-07-15

### Fixed

- Tambah user PPP-DHCP dan Hotspot sekarang wajib memilih profile, tidak boleh `None`.
- UI menampilkan peringatan saat profile dikembalikan ke `None`, dan server menolak request create user tanpa profile valid.

## [1.0.14] - 2026-07-15

### Fixed

- Info `Pengaturan > Update Aplikasi` sekarang menampilkan 3 changelog rilis terbaru dari versi remote terbaru saat update tersedia.

## [1.0.13] - 2026-07-15

### Fixed

- Wizard tambah member PPP-DHCP menampilkan preview Harga Profile, PPN, Diskon, dan Total Tagihan Perbulan sebelum simpan.
- Invoice otomatis dan invoice manual sekarang menghitung total tagihan dari harga profile setelah diskon dan PPN member.

## [1.0.12] - 2026-07-15

### Fixed

- Harga member PPP-DHCP saat tambah user sekarang selalu mengikuti harga profile yang dipilih, sehingga nilai form lama seperti `300` tidak lagi menimpa harga profile.
- Field harga pada wizard tambah member tidak lagi otomatis memakai harga profile pertama saat profile belum dipilih.

## [1.0.11] - 2026-07-15

### Added

- Menambahkan tombol `Edit Public Info` di Pengaturan untuk mengubah isi halaman `/public-info.html` melalui popup.
- Halaman `/public-info.html` sekarang membaca konten dari pengaturan aplikasi.

## [1.0.10] - 2026-07-15

### Fixed

- `Check for Update` sekarang membaca versi rilis terbaru dari remote sehingga tidak lagi menampilkan placeholder `versi terbaru tersedia`.
- Footer versi/copyright memakai versi terbaru dan format tanggal rilis yang konsisten.

## [1.0.9] - 2026-07-15

### Added

- Menambahkan panduan `Clean Lock Update` di README untuk kasus update web tertahan oleh lock lama.

## [1.0.8] - 2026-07-15

### Changed

- Menampilkan 3 perubahan/rilis terakhir pada panel `Pengaturan > Update Aplikasi`.
- Mengganti tombol `Refresh Status` menjadi `Check for Update`.

## [1.0.7] - 2026-07-15

### Changed

- Membersihkan README dari detail aktivasi yang tidak perlu dipublikasikan.

## [1.0.6] - 2026-07-15

### Added

- Menambahkan panduan troubleshooting update web di `README.md`, termasuk cara membersihkan lock updater lama, menjalankan update terminal, dan membaca log update.

## [1.0.5] - 2026-07-15

### Changed

- Menghapus field `Tanggal tempo default` dari halaman `Pengaturan` agar tidak duplikat dengan `Radius > Setting > Billing Setting`.
- Menjadikan `postpaidDueDay` di `Billing Setting` sebagai acuan jatuh tempo billing.

## [1.0.4] - 2026-07-15

### Changed

- Menyederhanakan informasi update aplikasi dengan menghapus label `Kanal` dari tampilan status update.

## [1.0.3] - 2026-07-15

### Changed

- Mengubah wording panel `Update Aplikasi` menjadi berbasis `rilis terbaru` dan `kanal`, bukan label GitHub/commit.

### Fixed

- Updater sekarang membersihkan lock file lama jika proses update sebelumnya sudah tidak berjalan.
- Server yang tertahan di lock update lama bisa memperbarui aplikasi lagi tanpa install ulang.

## [1.0.2] - 2026-07-15

### Changed

- Mewarnai ulang metric dashboard keuangan dan billing agar `Monthly Earning`, `Monthly Paid`, `Monthly Transaction`, dan `Monthly Invoice` lebih mudah dibedakan.
- Mengubah panel `Pengaturan > Update Aplikasi` agar menampilkan versi dot release, bukan hash commit Git.
- Mengganti tampilan log update teknis dengan ringkasan changelog versi aplikasi.

## [1.0.1] - 2026-07-15

### Added

- Menambahkan kotak `PSB` pada dashboard `PPP-DHCP Users`.
- Menambahkan warna status dashboard yang berbeda untuk `Total`, `Aktif`, `PSB`, `Isolir`, `Terminated`, dan `Cabut`, termasuk dukungan dark mode.
- Menambahkan tabel ringkas `Monitoring > Pelanggan Online` untuk `PPPoE Aktif` dan `Hotspot Aktif`.
- Menambahkan formatter traffic dashboard otomatis dari `bps`, `Kbps`, `Mbps`, `Gbps`, sampai unit lebih tinggi.

### Changed

- Mengubah tampilan versi aplikasi dari format build tanggal menjadi format dot version.
- Mengubah versi aplikasi menjadi `1.0.1`.
- Memperketat summary `Cabut` agar hanya menghitung delete PPP-DHCP yang benar-benar linked ke member.
- Memperketat filter PPPoE aktif agar service selain PPPoE tidak ikut tampil.

### Fixed

- Delete PPP-DHCP non-member tidak lagi menambah angka `Cabut`.
- Cleanup member orphan tidak lagi menambah statistik `Cabut`.
- Statistik bulanan mengikuti aturan `Cabut` yang sama dengan dashboard.

### Notes

- Update dari git tidak menyertakan data/database client karena folder `data/` tetap ignored.
- Field data baru akan diisi default oleh aplikasi saat start, tanpa menimpa data lama.
