# Changelog

Semua perubahan penting FAKE.NET Billing dicatat di file ini.

Format versi memakai pola `major.minor.patch`:

- Patch/minor kecil: `1.0.0` ke `1.0.1`
- Perubahan besar fitur/struktur: `1.0.0` ke `1.1.0`

## [1.0.57] - 2026-07-18

### Fixed

- Profil PPP-DHCP yang ditautkan ke profil MikroTik hanya mengirim `Mikrotik-Group` dan tidak lagi mengirim `Mikrotik-Rate-Limit` bernilai unlimited.
- Queue dinamis PPPoE kembali mewarisi rate-limit, queue type, dan pengaturan lain dari profil PPP RouterOS yang dipilih.
- Nilai limit manual otomatis dibersihkan ketika profil diubah ke mode Link ke profil MikroTik agar dua sumber limit tidak saling menimpa.

## [1.0.56] - 2026-07-18

### Changed

- Tagihan Harian hanya memuat pembayaran yang benar-benar selesai dan tetap mendukung transaksi migrasi yang tidak memiliki relasi invoice lokal.
- Monthly Paid dihitung dari transaksi pembayaran pada bulan terpilih, sedangkan Monthly Invoice dihitung dari invoice yang diterbitkan pada bulan tersebut.
- Pembayaran online mencatat total yang benar-benar dibayar pelanggan sebagai pemasukan, sementara nominal pokok invoice, fee, biaya provider, dan biaya kasir tetap tersimpan terpisah.
- Nama site pada laporan, monitoring tagihan, tambah member, dan import member mengikuti nama NAS; alamat site disimpan terpisah sebagai lokasi.

### Fixed

- Pembayaran Radboox hasil migrasi dengan tambahan fee tetap terbaca sebagai Online dan memakai nominal transaksi aktual.
- Pembagian gerai Tripay mempertahankan total fee pelanggan tanpa menghitung kembali biaya Rp3.000 yang dibayar di kasir.
- Pemilihan QRIS voucher Tripay menggunakan nominal pokok dan fee yang benar saat membaca channel tersedia.
- Radius Connector menutup session lama yang benar-benar tergantikan oleh session baru, sehingga duplicate session tidak terus membanjiri monitoring.

## [1.0.55] - 2026-07-18

### Added

- Mode migrasi dapat menahan sementara automasi invoice dan pengiriman WhatsApp selama proses cutover data berlangsung.

### Fixed

- Generator invoice menghormati periode `nextDue` untuk member dengan pembayaran awal lunas sehingga periode yang sudah terbayar tidak ditagih ulang.
- Automasi WhatsApp tidak lagi membuat draft atau menandai reminder terkirim ketika gateway dinonaktifkan.
- Notifikasi voucher kedaluwarsa menunggu gateway WhatsApp aktif agar pesan tidak dianggap sudah diproses sebelum perangkat ditautkan.

## [1.0.54] - 2026-07-17

### Changed

- Pemasukan pada Tagihan Harian, Tagihan Bulanan, laporan voucher, Mutasi Bulanan, Rekapitulasi, dan Statistik kini dipisahkan menjadi Tunai, Transfer, dan Online.
- Metode QRIS, virtual account, e-wallet, serta gerai pembayaran dikelompokkan sebagai Online tanpa menghilangkan nama metode asli pada rincian transaksi.
- Tooltip Statistik Pendapatan menampilkan rincian Tunai, Transfer, dan Online dengan tetap mempertahankan grafik utama Pendapatan dan Pengeluaran.

### Fixed

- Metode gerai dan virtual account tidak lagi salah terbaca sebagai pembayaran tunai atau transfer manual.
- Data pembayaran lama tetap diklasifikasikan otomatis tanpa migrasi atau perubahan nilai transaksi.

## [1.0.53] - 2026-07-17

### Changed

- Keterangan metode gerai pada checkout dibuat lebih ringkas dan tidak lagi menampilkan pembagian internal fee aplikasi dengan biaya kasir.
- Pelanggan cukup melihat bahwa total sudah termasuk biaya layanan gerai dan membayar sesuai nominal yang ditampilkan kasir.

## [1.0.52] - 2026-07-17

### Changed

- Fee paket bulanan tetap ditampilkan sesuai nominal flat yang dikonfigurasi untuk seluruh metode pembayaran.
- Khusus gerai Tripay, Rp3.000 dari fee flat otomatis dialokasikan sebagai biaya yang dibayar langsung di kasir tanpa mengubah total biaya pelanggan.
- Checkout dan laporan menyimpan nominal gateway, biaya kasir, biaya provider, serta total pelanggan secara terpisah agar rekonsiliasi tetap akurat.

### Fixed

- Callback Tripay gerai kini memvalidasi nominal checkout setelah alokasi biaya kasir dan tetap mencatat invoice lunas dengan fee flat penuh.

## [1.0.51] - 2026-07-17

### Changed

- Field Callback URL Payment Gateway diringkas menjadi satu kolom dan dilengkapi placeholder endpoint webhook yang valid.
- Contoh Callback URL otomatis mengikuti Public Base URL jika domain pembayaran sudah dikonfigurasi.

## [1.0.50] - 2026-07-17

### Changed

- Form Payment Gateway kini hanya menampilkan credential yang relevan untuk provider terpilih.
- Reserve settlement diganti menjadi Saldo minimum tersisa dan hanya ditampilkan untuk Xendit.
- Mode Sandbox/Production disembunyikan untuk provider Custom.
- Field Merchant ID Midtrans dan Shared Key DOKU yang tidak diperlukan untuk alur checkout standar disembunyikan tanpa menghapus credential lama yang tersimpan.
- Provider selain Tripay menampilkan status integrasi checkout agar gateway yang belum didukung tidak disangka sudah operasional.

## [1.0.49] - 2026-07-17

### Fixed

- Voucher Hotspot berstatus Free dipastikan tidak masuk Laporan Voucher Harian, Laporan Voucher Bulanan, Laporan Statistik, transaksi penjualan, maupun omzet voucher.
- Filter yang sama diterapkan pada voucher manual, generated, arsip Remove & Record, dan order online sebagai perlindungan konsistensi data.

## [1.0.48] - 2026-07-17

### Fixed

- Laporan > Statistik kini menghitung pemasangan baru hanya dari akun PPP-DHCP yang benar-benar tertaut ke member melalui opsi Tambahkan ke Member.
- Akun PPP-DHCP internal tanpa member tidak lagi memengaruhi pertumbuhan maupun total pelanggan aktif.
- Member import existing dengan `count_as_psb=no` tetap masuk total pelanggan aktif, tetapi tidak dihitung sebagai PSB baru.
- Total pelanggan aktif bulanan dideduplikasi berdasarkan Member ID agar satu member dengan lebih dari satu akun PPP tidak dihitung berulang.

## [1.0.47] - 2026-07-17

### Changed

- Template import PPP-DHCP mempertahankan dua baris contoh dan memakai baris 4 sebagai pembatas; data import sekarang dimulai dari baris Excel 5.
- Template dan export PPP-DHCP memiliki kolom nomor urut sebelum username, header lebih jelas, serta area pembatas yang digabung sepanjang tabel.

### Fixed

- Hasil import yang gagal sekarang menampilkan nomor baris Excel, nomor urut, username, dan penyebab error tanpa menghentikan baris valid lainnya.

## [1.0.46] - 2026-07-16

### Added

- Monitoring > Site kini menyediakan aksi `Hubungkan RADIUS` yang menghasilkan script RouterOS idempotent dengan IP server, IP NAS, secret, accounting, dan CoA terisi otomatis.
- Template import PPP-DHCP memiliki opsi `count_as_psb`; nilai default `no` memperlakukan hasil import sebagai pelanggan existing, sedangkan `yes` tetap dapat dipakai untuk PSB aktual.

### Changed

- Header baris pertama template dan export XLSX diberi warna, teks putih, border, filter, serta freeze row agar mudah dibedakan dari data.
- Member ID hasil import dibuat otomatis 9 digit, tanggal contoh memakai `DD/MM/YYYY`, dan Service Name ikut dipetakan.
- Profile PPP-DHCP dan Hotspot diurutkan ascending A-Z tanpa mengubah urutan tabel user.
- Secret Radius ditampilkan pada form edit Site hanya untuk role yang memiliki izin mengubah Site.

### Fixed

- Statistik PSB tidak lagi memasukkan pelanggan existing yang dibuat melalui import XLSX secara default.
- Service Name PPP-DHCP sekarang tersimpan dan dapat dibersihkan kembali saat user diedit.

## [1.0.45] - 2026-07-16

### Fixed

- Uninstall total sekarang mendeteksi unit FreeRADIUS dengan benar sehingga backend Radius billing dapat dihentikan tanpa menyentuh service media lain.

## [1.0.44] - 2026-07-16

### Changed

- Halaman login dan aktivasi sekarang menampilkan copyright serta versi aplikasi.
- Format tanggal tampilan diseragamkan menjadi `DD/MM/YYYY` di aplikasi utama dan subweb.
- Changelog pada Pengaturan > Update dipindahkan ke popup scroll yang memuat 10 rilis terbaru.

## [1.0.43] - 2026-07-16

### Changed

- Laporan > Statistik sekarang menampilkan tiga chart compact dalam satu baris pada desktop dan otomatis turun per kartu pada mobile.
- Chart pertumbuhan pelanggan diubah menjadi line chart total pelanggan PPP-DHCP aktif per bulan dengan tooltip PSB, cabut, dan pertumbuhan bersih.
- Chart pendapatan bulanan diubah menjadi grouped bar pendapatan vs pengeluaran, tanpa batang laba bersih.
- Screenshot dokumentasi diperbarui, termasuk Payment Gateway setelah konten selesai dimuat.

## [1.0.42] - 2026-07-16

### Added

- Monitoring > Pelanggan Online sekarang menampilkan NAS sebagai badge aktif pada tabel PPPoE Aktif dan Hotspot Aktif.
- Laporan > Statistik dirombak dengan chart 12 bulan untuk pertumbuhan pelanggan PPP-DHCP, penjualan voucher, dan pendapatan bulanan.
- Dokumentasi README kini menyertakan screenshot aplikasi dengan data yang disamarkan.

### Changed

- Badge NAS dibuat konsisten di tabel Radius, Session, GenieACS, laporan voucher, dan monitoring pelanggan online.
- Endpoint statistik menghitung PSB, cabut, voucher, tagihan, dan pemasukan lain untuk seluruh rentang 12 bulan, bukan hanya bulan yang sedang dipilih.

## [1.0.41] - 2026-07-16

### Fixed

- Member PPP-DHCP `Postpaid > Billing Cycle` sekarang memakai tanggal jatuh tempo dari `Radius > Setting > Billing Setting`, bukan tanggal aktif member.
- Data member billing cycle yang sudah tersimpan dengan `nextDue/dueDate` salah akan diselaraskan saat aplikasi start setelah update.

## [1.0.40] - 2026-07-16

### Fixed

- Edit harga/nama Profile PPP-DHCP sekarang otomatis menyinkronkan paket dan harga semua member yang memakai profile tersebut.
- Data member linked PPP-DHCP yang sudah terlanjur stale ikut dibenahi saat aplikasi start setelah update.
- Invoice lama tetap dibiarkan sesuai nominal awal agar histori tagihan tidak berubah diam-diam.

## [1.0.39] - 2026-07-16

### Added

- Monitoring > Tagihan Pelanggan sekarang mendukung pembatalan invoice melalui checklist batch untuk role berwenang.

### Fixed

- Invoice batal tidak lagi mengunci periode, sehingga invoice salah bisa dibatalkan lalu dibuat ulang mengikuti data paket/harga member terbaru.
- Invoice yang sudah lunas ditolak saat dicoba dibatalkan agar histori pembayaran tidak rusak.
- Checkout dan callback payment gateway menolak invoice yang sudah dibatalkan.

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
