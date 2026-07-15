# Changelog

Semua perubahan penting FAKE.NET Billing dicatat di file ini.

Format versi memakai pola `major.minor.patch`:

- Patch/minor kecil: `1.0.0` ke `1.0.1`
- Perubahan besar fitur/struktur: `1.0.0` ke `1.1.0`

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
