# Changelog

Semua perubahan penting FAKE.NET Billing dicatat di file ini.

## [4.2.21] - 2026-08-15

### Fixed

- Membuat klik ulang isolir/terminated tetap aman saat NAS membalas NAK tetapi FreeRADIUS sudah tidak memiliki session aktif, sehingga tombol isolir tidak dianggap gagal setelah pelanggan sebenarnya sudah offline.

## [4.2.20] - 2026-08-15

### Fixed

- Memperjelas deteksi timeout CoA saat `radclient` hanya mengirim packet tanpa menerima balasan NAS, sehingga audit isolir menampilkan penyebab yang tepat.

## [4.2.19] - 2026-08-15

### Fixed

- Memperkuat CoA disconnect saat isolir/terminated dengan mengambil session aktif dari `radacct`, mengirim atribut session lengkap ke NAS, dan membuat klik ulang aman saat session sudah lebih dulu putus.

## [4.2.18] - 2026-08-15

### Fixed

- Membersihkan output FreeRADIUS untuk pelanggan isolir/terminated mode reject agar tidak lagi menyertakan `radreply` rate-limit/group/pool yang tidak digunakan.

## [4.2.17] - 2026-08-15

### Fixed

- Memperbaiki fallback isolir FreeRADIUS agar user isolir/terminated langsung `Auth-Type := Reject` saat group/pool isolir kosong, meskipun field rate-limit isolir lama masih terisi.

## [4.2.16] - 2026-08-15

### Fixed

- Memperkuat updater untuk instalasi archive-based seperti Nynet agar `Check for Update` tetap bisa membaca versi remote meski folder aplikasi tidak punya `.git`.
- Menambah timeout dan retry download archive update supaya koneksi GitHub/codeload yang lambat tidak mudah berhenti di tengah proses.
- Menambahkan default env update archive/raw URL saat install/repair agar server lama dan install baru memakai jalur update yang sama.

## [4.2.15] - 2026-08-15

### Fixed

- Memperbaiki Virtual Parameter suhu GenieACS agar membaca ulang raw temperature secara ringan harian.
- Menambahkan normalisasi suhu saat backfill Virtual Parameters, termasuk raw value GPON/EPON yang perlu dikonversi ke Celsius.

## [4.2.14] - 2026-08-15

### Fixed

- Menambahkan deteksi modem Fazlink/Realtek `xPON+1GE+1FE+WIFI` sebagai WiFi single-band agar slot multi-SSID index 5 tidak tampil sebagai SSID 5G palsu di GenieACS dan WifiKu.
- Menyesuaikan backfill Virtual Parameter GenieACS agar `wifiSsid5` dikosongkan pada modem single-band tersebut.

## [4.2.13] - 2026-08-15

### Fixed

- Menambahkan pembacaan VLAN CData/GC melalui parameter `X_GC_VLANIDMark` dan `X_GC_VLANID` pada daftar GenieACS, detail WAN, dan deteksi ONT baru.
- Menambahkan dukungan family WAN `gc` agar edit/provisioning WAN CData memakai parameter service, VLAN, dan binding yang sesuai jika tersedia dari modem.
- Membatasi timeout bootstrap GenieACS agar install/update tidak menggantung lama pada mesin yang belum memiliki NBI GenieACS lokal.

## [4.2.12] - 2026-08-15

### Fixed

- Menambahkan Virtual Parameter `wanVlan`, `wifiSsid24`, dan `wifiSsid5` untuk GenieACS agar VLAN WAN serta SSID modem CDATA/CDTC FDxxx dan beberapa keluarga ONU lain ikut terbaca setelah install/update.
- Mengubah default instalasi baru Whatsapp Gateway menjadi nonaktif sampai owner mengaktifkannya dari menu aplikasi.
- Menjadikan isolir Radius kosong sebagai fallback disable akun (`Auth-Type := Reject`) dan memperkuat updater archive-based dengan timeout serta override source yang tidak tertimpa env file.

## [4.2.11] - 2026-08-15

### Fixed

- Memperkuat updater berbasis Git agar perubahan lokal source yang masih untracked ikut distash sebelum `git pull`, sehingga server lama tidak tersangkut saat file manual lama sudah menjadi file resmi di repository.

## [4.2.10] - 2026-08-15

### Fixed

- Memastikan installer benar-benar melewati instalasi runtime GenieACS bawaan saat GenieACS existing sudah terdeteksi, sehingga tidak menambah service/paket yang tidak diperlukan.
- Menambahkan pengunci otomatis GenieACS NBI existing ke `127.0.0.1:7557` bila service `genieacs-nbi` tersedia, tanpa mengganggu CWMP `7547`.
- Memperbarui README agar jelas bahwa Virtual Parameters tetap dibootstrap ke GenieACS existing jika NBI localhost tersedia.

## [4.2.9] - 2026-08-15

### Fixed

- Memperbaiki updater archive-based agar membaca `FAKENET_UPDATE_ARCHIVE_URL` dari `/etc/fakenet-billing.env` setelah env dimuat, sehingga install tanpa `.git` tetap bisa update dari tombol aplikasi.
- Menyesuaikan health check updater dengan endpoint `/api/health` yang sudah diamankan minimal `{"ok":true}`, sehingga update tidak tersangkut menunggu detail BullMQ yang memang tidak lagi dibuka.

## [4.2.8] - 2026-08-15

### Added

- Menambahkan auto-delete GenieACS harian untuk ONT orphan yang sudah lama offline, tanpa menghapus modem yang masih terkait member walaupun pelanggan isolir, terminated, atau nonaktif.
- Menambahkan env bootstrap GenieACS existing agar Virtual Parameters tetap bisa dipasang saat installer mendeteksi ACS yang sudah ada dan melewati instalasi GenieACS bawaan billing.

### Fixed

- Menurunkan batas default auto-delete ONT orphan dari 90 hari menjadi 30 hari dengan batas maksimal 20 device per run agar pembersihan lebih sesuai operasional.
- Memastikan GenieACS NBI bawaan billing tetap bind ke `127.0.0.1:7557` dan tidak terbuka langsung ke publik.
- Memperbaiki validasi tambah user PPP-DHCP agar username duplikat langsung menampilkan pesan error sebelum lanjut wizard atau simpan.
- Merapikan tampilan row GenieACS di mobile dengan card khusus supaya data ONU tidak menumpuk.

## [4.2.7] - 2026-08-14

### Fixed

- Memperbaiki paket Virtual Parameters GenieACS untuk modem FD511GD/CDTC dan beberapa modem XPON agar redaman, suhu, mode PON, uptime, serial, total active device, PPPoE username, dan IP PPPoE dapat dibaca dari path vendor yang sesuai.
- Mengubah bootstrap GenieACS agar tidak lagi menjalankan auto-provision Virtual Parameters secara agresif yang dapat memicu `too_many_commits` pada beberapa ONT.
- Menambahkan backfill Virtual Parameters dari data mentah Mongo GenieACS saat install/update, sehingga nilai umum langsung tersedia tanpa harus menambah parameter manual.
- Menonaktifkan preset legacy GenieACS `default` yang terdeteksi berat dan membersihkan deklarasi VirtualParameters lama agar tidak mengganggu provision billing.

## [4.2.6] - 2026-08-14

### Added

- Menambahkan paket Virtual Parameters GenieACS lengkap untuk PPPoE username/IP/password, serial, PON/MAC, uptime, total active device, WiFi password, dan akun modem agar install/update baru langsung membaca parameter ONT yang umum dipakai.
- Menambahkan alias `VirtualParameters.ip` dan `VirtualParameters.pppoe` agar fallback pembacaan modem tetap jalan pada beberapa template GenieACS lama.

### Fixed

- Memperbaiki deteksi ONT baru agar modem yang PPPoE-nya terbaca dari `VirtualParameters.pppoeUsername` tidak lagi muncul sebagai “WAN PPP belum ada”.
- Mengoptimalkan pemilihan modem WifiKu saat ada modem lama dan baru untuk pelanggan yang sama dengan skor berdasarkan PPPoE, status online, `lastInform`, IP PPPoE, dan NAS.

## [4.2.5] - 2026-08-11

### Added

- Menambahkan laporan detail pelanggan cabut di `Laporan > Statistik` lengkap dengan modal daftar, print PDF, dan export Excel.
- Menambahkan alasan hapus user PPP-DHCP agar data cabut bisa dipisahkan dari salah input, duplikat, atau pindah NAS.

### Fixed

- Mengembalikan badge NAS laporan tagihan harian agar hanya tampil di mobile dan tidak dobel dengan kolom NAS desktop.
- Memperbaiki deteksi antrian aktivasi GenieACS agar modem yang sudah memiliki WAN PPP tidak tetap muncul sebagai ONT perlu internet.
- Memastikan penghapusan PPP-DHCP menyimpan riwayat cabut tanpa menghapus transaksi dan invoice historis.

## [4.2.4] - 2026-08-11

### Changed

- Menunda render panel bawah dashboard sampai browser idle agar ringkasan utama lebih cepat tampil.
- Menaikkan cache runtime signature-based untuk dashboard, laporan, dan pencarian tanpa mengubah hasil perhitungan.
- Menambahkan index PostgreSQL untuk field panas pelanggan, invoice, payment, pesan WA, aktivitas, pemasukan, dan pengeluaran.

## [4.2.3] - 2026-08-11

### Changed

- Merapikan ringkasan menu menjadi Pelanggan, Keuangan Kas & Rekap, Status Layanan, GenieACS, ODP/ODC, dan Inventaris & Aset.
- Mengoptimalkan Peta Pelanggan dan ODP/ODC agar marker besar dirender bertahap dan memakai canvas saat dataset besar.
- Menyesuaikan layout peta, ODP/ODC, toolbar filter, dan panel samping agar lebih stabil di desktop serta mobile.
- Membatasi perintah test ke folder `test/` agar artefak lokal di root repo tidak ikut dieksekusi.
- Menguatkan response publik agar health check, webhook check, dan error subweb tidak membocorkan detail datastore/server.

## [4.2.2] - 2026-08-11

### Fixed

- Memperbaiki route `Peta Pelanggan` dan `ODP/ODC` yang memanggil helper payload belum terdefinisi setelah sinkron Cempaka dev.

## [4.2.1] - 2026-08-11

### Added

- Menambahkan menu Monitoring > Peta Pelanggan dari Cempaka dev untuk melihat titik pelanggan, status layanan, paket, alamat, dan pelanggan yang belum punya koordinat.
- Menambahkan menu Monitoring > ODP/ODC untuk pencatatan ODC, ODP, kapasitas port, port rusak/reserved, peta titik fiber, dan pelanggan yang tertaut ke ODP.

### Changed

- Storage aplikasi kini menyiapkan koleksi `fiberCenters` dan `fiberPoints` agar data ODP/ODC permanen dan aman saat update.

## [4.2.0] - 2026-08-11

### Changed

- Sinkronisasi perubahan Cempaka dev ke FAKE.NET untuk halaman Member/Data Pelanggan dan Tagihan Pelanggan.
- Tampilan Member memakai tab operasional untuk semua pelanggan, pelanggan baru, isolir, dan terminated dengan pagination masing-masing.
- Tampilan Tagihan Pelanggan dan tabel besar lain mengikuti layout mobile card/table terbaru agar lebih rapi di layar kecil.
- Baseline engine/performance canonical dipakai kembali untuk cache, pagination PostgreSQL, RADIUS, GenieACS, dan UI mobile.

### Fixed

- Penanda Web Push pembayaran online tetap disimpan permanen agar notifikasi Chrome tidak muncul ulang setelah restart atau update service.

## [4.1.9] - 2026-08-11

### Changed

- Source LIVE dan DEV diselaraskan dengan baseline engine/performance LIVE dan peningkatan UI/operasional terbaik dari DEV.
- UI mobile DEV untuk tabel besar dipertahankan: tabel penting tampil sebagai kartu mobile agar tidak perlu geser horizontal berlebihan.
- Backend engine LIVE dipertahankan: storage schema v3, pagination PostgreSQL, diagnostics endpoint, cache pelanggan online, dan optimasi laporan.
- RADIUS memakai deduplikasi NAS berbasis alias/address dan profile PPP menampilkan jumlah user aktif/suspend/terminate.
- Dashboard NAS menampilkan counter RX/TX byte selain trafik upload/download.
- Foto KTP tetap tersedia untuk OCR/arsip, namun tidak lagi menjadi syarat `Data Valid`.

### Security

- Role Viewer mengikuti kebijakan LIVE: dashboard-only.
- Role Sekretaris dapat input/edit operasional RADIUS dan GenieACS tanpa akses admin/transaksi sensitif.

## [4.1.6] - 2026-08-09

### Fixed

- Foto KTP tidak lagi dihitung sebagai syarat `Data Valid` member.
- Upload Foto KTP tetap tersedia untuk OCR/manual arsip jika pelanggan bersedia melengkapi data.
- Role Sekretaris dapat input/edit data operasional RADIUS dan GenieACS, tetap tanpa akses admin sensitif.

## [4.1.5] - 2026-08-09

### Fixed

- Struktur sidebar dan navigasi bawah diselaraskan dengan shell Cempaka yang stabil, tanpa menimpa fitur billing terbaru.
- Tombol Menu mobile membuka Monitoring, Pengaturan, dan Admin Sistem sebagai panel bawah, bukan drawer menyamping.
- Laporan Tagihan dan Laporan Voucher di sidebar digabungkan dengan status aktif yang tetap benar saat masuk halaman harian/bulanan.

## [4.1.4] - 2026-08-09

### Performance

- Cache Pelanggan Online dari Redis kini menghitung umur data dengan benar, sehingga data stale bisa dipakai sementara refresh SNMP berjalan di belakang layar.
- Pelanggan Online dipanaskan otomatis setelah service start dan berkala tiap beberapa menit agar menu tidak kosong/lambat setelah restart.
- Daftar PPP-DHCP dan Hotspot default ikut memakai runtime cache singkat agar buka menu/filter berulang tidak menghitung ulang dataset besar terus-menerus.

## [4.1.3] - 2026-08-09

### Fixed

- Finance dan Owner dapat menyimpan Isolir Radius sesuai akses Billing Settings tanpa perlu diberi akses admin sistem penuh.
- Viewer dikunci menjadi dashboard-only agar tidak bisa membaca tabel Radius yang berisi data teknis dan password pelanggan.

### Tests

- Ditambahkan kontrak test role untuk menjaga akses Radius Setting, reseller voucher, dan viewer.

## [4.1.2] - 2026-08-09

### Fixed

- Drawer mobile dari tombol navigasi bawah kini muncul sebagai panel naik dari bawah, mengikuti pola Billcob/Cempaka.
- Tombol Menu mobile membuka grup Monitoring, Pengaturan, dan Admin Sistem dalam satu panel bawah.
- Revision aset frontend diperbarui agar browser mengambil CSS/JS mobile terbaru.

## [4.1.1] - 2026-08-09

### Fixed

- Navigasi mobile disamakan dengan pola Billcob: hamburger atas disembunyikan dan drawer menu hanya dibuka melalui navigasi bawah.
- Navigasi desktop tetap mempertahankan tombol hamburger untuk membuka atau menciutkan sidebar.

## [4.1.0] - 2026-08-09

### Changed

- Audit UI menyeluruh diterapkan pada navigasi, kartu mobile, Tagihan Pelanggan, laporan, RADIUS, GenieACS, Whatsapp, inventaris, dan manajemen user.
- Deteksi Log memakai izin khusus dan tersedia untuk Admin, Owner, serta Sekretaris tanpa membuka Pengaturan Sistem.
- Tagihan Bulanan, Statistik, dan transaksi bulanan memakai indeks lookup serta kandidat periode agar tidak memindai relasi invoice, pembayaran, pelanggan, dan voucher berulang kali.

### Performance

- Statistik 12 bulan membangun indeks pelanggan, invoice terakhir, transaksi, dan voucher satu kali per request.
- Konversi tanggal untuk zona waktu Indonesia memakai offset tanpa DST dan tidak lagi membuat formatter `Intl` ribuan kali pada laporan besar.
- Ringkasan NAS dan pelanggan online memakai stale cache serta refresh background; sesi FreeRADIUS hanya diperkaya untuk halaman aktif bila memungkinkan.
- Cache runtime dibatasi dan dapat diaudit dari Deteksi Log, sedangkan health endpoint tidak lagi mengekspos lokasi storage.

### Fixed

- Kartu mobile Tagihan Bulanan tidak lagi menumpuk label dan nominal.
- Tanggal Member, nomor Whatsapp, waktu pesan, dan nama User tidak lagi terpotong pada layar 320 px.
- Sidebar, tabel, chart, dan toolbar tidak lagi memperlebar halaman pada viewport ponsel kecil.
- Query pembayaran tidak lagi membuat object gabungan besar untuk setiap invoice dan pencarian site/NAS memakai resolver terindeks.

## [4.0.1] - 2026-08-09

### Fixed

- Sidebar mobile kini benar-benar menjadi overlay dan tidak lagi menggeser konten hingga menimbulkan slider horizontal.
- Sidebar yang tertutup tidak lagi menyisakan bayangan atau area interaktif di sisi kiri layar.

## [4.0.0] - 2026-08-09

### Changed

- Navigasi desktop dan mobile dikelompokkan ulang menjadi Dashboard, Pelanggan, RADIUS, Keuangan, Monitoring, Pengaturan, dan Admin Sistem tanpa mengubah izin role yang sudah berlaku.
- Pengaturan siklus billing dipisahkan dari Isolir Radius agar setiap halaman hanya memuat konfigurasi yang relevan.
- Tabel operasional utama berubah menjadi daftar kartu ringkas pada layar kecil; kolom teknis disembunyikan tanpa menghilangkan aksi penting.
- Pilihan jumlah baris dibatasi ke 10, 25, 50, atau 100. Opsi `All` dihapus dari daftar besar agar browser dan API tidak memuat seluruh data sekaligus.

### Performance

- Pelanggan, aktivitas, pemasukan, dan pengeluaran memakai pagination langsung dari tabel PostgreSQL dengan filter dan pencarian terindeks.
- Pelanggan online hanya mengambil sesi FreeRADIUS untuk user pada halaman aktif, bukan seluruh sesi pada setiap refresh.
- Hasil sesi halaman aktif disimpan maksimal delapan detik dalam cache memory terbatas agar refresh berulang tidak membebani SQL Radius.
- GenieACS memakai projection ringkas untuk summary dan mengambil detail perangkat per halaman langsung dari NBI, dengan fallback kompatibel bila NBI lama menolak paging.
- Payment Gateway, laporan, invoice, member, dan daftar operasional lain mengirim maksimal 100 baris per request serta memakai cache server yang sudah dibatasi.

### Data Safety

- Koleksi pengeluaran dan pemasukan eksternal dipindahkan ke tabel terpisah dengan migrasi schema v3 yang mempertahankan seluruh data schema v2.
- Indeks PostgreSQL ditambahkan untuk status, periode, tanggal, nama, username, invoice, pembayaran, pesan Whatsapp, dan log aktivitas.

### Security

- `sharp` dan `brace-expansion` diperbarui ke rilis aman; audit dependency produksi tidak menyisakan advisory yang diketahui.

### Fixed

- Monitoring pelanggan online, GenieACS, Payment Gateway, pemasukan, dan pengeluaran tidak lagi mengirim payload penuh ke browser hanya untuk dipotong di frontend.
- Migrasi storage menjaga koleksi lama tetap menjadi sumber otoritatif sekaligus membawa kas yang sebelumnya masih tersimpan di core.
- Hash atau last-page kosong tidak lagi membuat Dashboard menampilkan halaman tidak tersedia setelah login atau refresh.

## [3.1.1] - 2026-08-03

### Performance

- Cache laporan di dalam proses Node sekarang dibatasi berdasarkan jumlah entri dan ukuran byte, memakai LRU, serta membersihkan data kedaluwarsa secara berkala untuk mencegah OOM.
- Payload laporan besar tetap memakai Redis ber-TTL tanpa diduplikasi sebagai object graph di heap aplikasi.
- Cache pencarian dan transaksi bulanan hanya diinvalidasi ketika koleksi terkait berubah, bukan oleh aktivitas lain seperti antrean Whatsapp.
- Hasil waktu aktif pertama voucher digunakan ulang selama lima menit dan pencarian `lower(username)` FreeRADIUS memakai indeks khusus.
- Perpanjangan sesi login disimpan secara terjadwal, bukan melakukan penulisan sinkron pada setiap request API.
- Formatter tanggal/zona waktu dipakai ulang dan status invoice dihitung satu kali per batch, sehingga dashboard dan laporan tidak membuat ribuan object formatter.
- Relasi transaksi payment gateway, invoice, member, dan voucher menggunakan direktori lookup satu kali, bukan memindai seluruh invoice untuk setiap transaksi.
- Service billing dibatasi heap 1,5 GB dan cgroup 2,2 GB agar anomali memori tidak memicu OOM global pada VM.

## [3.1.0] - 2026-08-03

### Added

- Konfigurasi WAN GenieACS menyediakan aksi `Simpan Binding` untuk mengubah binding LAN/SSID tanpa menulis ulang VLAN, mode WAN, atau kredensial PPPoE.
- Log aktivitas provisioning menyimpan status verifikasi, task ID, fault modem, dan kegagalan konfigurasi WAN/WiFi untuk kebutuhan audit.
- Detail client terkoneksi dimuat langsung dari perangkat hanya ketika dibuka, sehingga nama, IP, dan MAC tetap lengkap tanpa membebani tabel utama.

### Changed

- Daftar GenieACS memakai snapshot cache 60 detik, stale fallback lima menit, deduplikasi request, dan cache Redis pada endpoint halaman.
- Projection NBI yang besar dipecah menjadi beberapa request ringkas; aplikasi tidak lagi fallback mengunduh dokumen seluruh ONT ketika NBI mengembalikan HTTP 414/431.
- Deteksi ONT baru berjalan setiap 30 detik dan tetap menyediakan refresh manual untuk pemeriksaan langsung.
- Daftar utama hanya membaca parameter ringkasan; konfigurasi WAN, WiFi, dan client lengkap dibaca saat popup terkait dibuka.

### Security

- Token NBI GenieACS tidak lagi ikut dikirim melalui payload daftar perangkat kepada role yang hanya memiliki izin baca.
- Paket distribusi mengecualikan database runtime, sesi, foto pelanggan, VAPID key, generator lisensi, dan file konteks internal.

### Fixed

- Modul WAN/WiFi, bootstrap UI, dan aset loading awal disertakan sebagai bagian wajib rilis agar instalasi atau update bersih tidak menyebabkan aplikasi gagal start atau halaman blank.

## [3.0.0] - 2026-08-01

### Changed

- Target NAS pada user reseller voucher dan collector mendukung pilihan lebih dari satu NAS, sedangkan teknisi dapat diberi target NAS opsional untuk kebutuhan operasional.
- Reseller memilih NAS tujuan saat menambah user atau menghasilkan voucher; daftar profile Hotspot otomatis mengikuti NAS yang dipilih.
- Pengaturan target NAS pada manajemen user memakai pemilih checkbox yang lebih jelas, dilengkapi pencarian dan jumlah NAS terpilih.

### Fixed

- Perubahan target NAS user langsung dibaca ulang saat data Hotspot dimuat ulang sehingga NAS yang sudah dilepas tidak muncul dari sesi atau cache lama.
- Akses profile dan voucher reseller divalidasi kembali di backend agar hanya NAS yang ditetapkan kepada user tersebut yang dapat digunakan.
- Ringkasan tagihan collector disederhanakan menjadi jumlah pelanggan yang perlu ditindaklanjuti tanpa menampilkan nominal keuangan.
- Kartu Monthly Invoice pada Dashboard menghitung invoice berdasarkan bulan penerbitannya, termasuk invoice periode berikutnya yang diterbitkan lebih awal.
- Scrollbar horizontal tabel user PPP-DHCP dan Hotspot dipasang konsisten di atas tabel, termasuk setelah filter, pencarian, refresh, dan perpindahan tab.
- Mutasi Bulanan memiliki tombol Detail per transaksi untuk menampilkan rincian referensi, pelanggan, paket, metode, NAS, petugas, nominal, deskripsi, dan catatan.

### Performance

- Pencarian tabel, session FreeRADIUS, dan opsi Radius menggunakan cache berumur pendek serta pembatalan request lama agar antarmuka tetap responsif pada data besar.

## [2.11.45] - 2026-08-01

### Improved

- Hasil pencarian berulang disimpan sementara di browser dengan `sessionStorage`, sehingga query yang sama bisa tampil lebih cepat tanpa menyimpan data terlalu lama.
- Cache pencarian otomatis dibersihkan setelah aksi tambah/edit/hapus/bayar/import atau refresh manual.
- Session FreeRADIUS memiliki fallback cache memory saat Redis tidak tersedia, dengan TTL pendek agar pencarian Radius lebih ringan.

## [2.11.44] - 2026-08-01

### Improved

- Pencarian live sekarang membatalkan request lama sebelum menjalankan query baru, sehingga input tetap responsif saat user mengetik cepat.
- Tab Radius PPP-DHCP/Hotspot memakai cache session FreeRADIUS pendek ketika pencarian biasa, dan tetap membaca fresh saat tombol Refresh dipakai.
- Filter pencarian backend dibuat lebih ringan untuk data tabel besar.

## [2.11.43] - 2026-08-01

### Fixed

- Pencarian live di seluruh menu dibuat lebih stabil: input tidak lagi kehilangan fokus atau tertimpa hasil pencarian lama saat user masih mengetik.
- Pencarian member di popup Invoice Manual mengikuti mekanisme yang sama sehingga proses memuat data tidak memutus ketikan.

## [2.11.42] - 2026-08-01

### Fixed

- Laporan voucher online sekarang memakai nominal real/net yang diterima dari payment gateway jika tersedia, sementara print/PDF voucher tetap menampilkan nominal bayar pelanggan termasuk fee checkout.
- Print voucher A4, thermal, RawBT, dan template custom sekarang memakai nominal receipt voucher online yang konsisten dengan checkout pelanggan.

## [2.11.41] - 2026-08-01

### Fixed

- Kuitansi/PDF tagihan harian untuk pembayaran online kembali menampilkan nominal yang dibayar pelanggan beserta fee checkout, sementara tabel laporan tetap memakai nominal real bersih setelah potongan merchant.

## [2.11.40] - 2026-08-01

### Fixed

- Halaman link invoice sekarang tetap mengecek status checkout pending dan langsung menampilkan animasi pembayaran berhasil saat status invoice sudah paid, termasuk setelah pelanggan kembali dari QRIS/VA/payment gateway tanpa refresh manual.

## [2.11.39] - 2026-08-01

### Fixed

- Notifikasi pembayaran online di lonceng dan Web Push sekarang memakai nominal bersih yang diterima setelah potongan payment gateway, bukan nominal bayar pelanggan yang masih termasuk fee gateway.

## [2.11.37] - 2026-08-01

### Fixed

- Scheduler billing sekarang menyimpan antrean WA invoice yang sebelumnya dibuat sebelum jam kirim dan masih berstatus pending, sehingga invoice otomatis tetap terkirim setelah jam pengiriman yang ditentukan.
- Activity billing otomatis menampilkan jumlah invoice yang berhasil masuk antrean kirim WA, memudahkan audit invoice yang sudah dibuat tetapi menunggu jadwal kirim.

## [2.11.36] - 2026-08-01

### Changed

- `Monitoring > Tagihan Pelanggan` sekarang default ke mode `Berjalan + Tunggakan` dengan status `Perlu ditagih`, sehingga sisa invoice bulan sebelumnya tetap tampil ketika masuk bulan baru.
- Kartu Dashboard `Unpaid` dan `Overdue` diselaraskan dengan data tagihan yang perlu ditindaklanjuti, sementara `Total Invoice` dan `Paid` tetap berbasis periode bulan terpilih.
- Scroll tabel horizontal dipusatkan di scrollbar atas dan dipasang ulang setelah pencarian/render ulang agar scrollbar bawah tidak muncul kembali.

## [2.11.35] - 2026-07-31

### Changed

- Dashboard `Pendapatan Bulan Ini` sekarang menyertakan pendapatan voucher Hotspot paid dengan nominal real/net jika tersedia, tanpa menambah kotak baru di Dashboard.
- Kartu `Pendapatan Bulan Ini` diarahkan ke `Laporan > Mutasi Bulanan` agar gabungan invoice, voucher, dan pemasukan external bisa ditelusuri dari satu laporan.
- `Mutasi Bulanan` menampilkan kotak `Pemasukan External` tersendiri dan memasukkan transaksi pemasukan manual ke daftar mutasi.

## [2.11.34] - 2026-07-31

### Changed

- Nominal `Tagihan Terbayar` di Dashboard tetap berbasis invoice periode bulan berjalan, tetapi memakai nilai payment real/net yang tercatat setelah potongan Tripay agar laporan kas lebih akurat.

## [2.11.33] - 2026-07-31

### Changed

- Dashboard `Pendapatan Bulan Ini` sekarang memakai kas masuk bulan berjalan dari pembayaran invoice dan pemasukan external, bukan periode invoice.
- Dashboard `Tagihan Terbayar` sekarang memakai invoice periode bulan berjalan yang sudah lunas, sehingga mudah dibaca sebagai progres tagihan bulan tersebut.

## [2.11.32] - 2026-07-31

### Changed

- Auto-sync riwayat Tripay kini hanya memindai halaman terbaru dengan default 30 transaksi per interval agar lebih ringan, sementara sync manual tetap bisa dipakai untuk audit riwayat yang lebih panjang.
- Batas auto-scan Tripay bisa disesuaikan lewat `PAYMENT_GATEWAY_HISTORY_AUTO_PER_PAGE` dan `PAYMENT_GATEWAY_HISTORY_AUTO_MAX_PAGES` tanpa mengubah kode.

## [2.11.31] - 2026-07-31

### Fixed

- Auto-sync riwayat Tripay sekarang bisa merekonsiliasi pembayaran sangkut ketika pelanggan membayar link invoice lama yang masih valid di Tripay, selama nomor invoice dan nominalnya cocok.
- Pembayaran invoice yang sempat dipush manual tetapi ternyata sudah paid di Tripay akan dikoreksi menjadi metode online tanpa membuat pembayaran ganda atau mengirim ulang WA.
- Penyimpanan transaksi payment gateway tidak lagi menimpa riwayat checkout expired/cancelled yang berbeda reference.

## [2.11.30] - 2026-07-31

### Fixed

- Pembelian voucher Hotspot menolak nomor WhatsApp tidak valid sebelum order dibuat, sehingga Tripay tidak lagi menerima nomor pendek seperti `0852`.
- Error HTML dari Tripay kini diringkas menjadi pesan gateway yang jelas, bukan ditampilkan mentah di halaman voucher atau invoice.

## [2.11.29] - 2026-07-31

### Fixed

- QRIS pembelian voucher Hotspot di login page/status order tetap tampil walaupun payment gateway hanya mengirim payload `qr_string` tanpa URL gambar QR.
- Cache script halaman voucher diperbarui agar browser pelanggan langsung mengambil perbaikan QR terbaru.

## [2.11.28] - 2026-07-31

### Changed

- Dashboard NAS Status/Traffic mencache index interface SNMP terpilih, sehingga refresh berikutnya cukup membaca counter traffic dan tidak mengulang SNMP walk ratusan interface setiap interval.
- Pembacaan interface dashboard diberi fallback ke `ifDescr` jika `ifName` tidak tersedia, supaya nama interface tidak mudah kosong pada perangkat tertentu.

## [2.11.27] - 2026-07-31

### Changed

- Dashboard NAS Status/Traffic kini membaca cache cepat dan refresh SNMP berjalan di background, sehingga Dashboard tidak lagi tertahan ketika SNMP lambat.
- Polling NAS dibuat satu jalur dengan concurrency rendah dan anti dobel request agar tidak membebani CPU/router.

## [2.11.26] - 2026-07-31

### Fixed

- NAS Status/Traffic di Dashboard tetap tampil setelah reload atau update walaupun request SNMP sebelumnya masih berjalan.
- Slot NAS Status dibuat eksplisit di grid dashboard agar tidak kolaps di desktop maupun mobile.

## [2.11.25] - 2026-07-31

### Fixed

- Halaman login tidak lagi menampilkan kilasan Dashboard/sidebar sebelum pengecekan sesi selesai.

## [2.11.24] - 2026-07-31

### Fixed

- Chart NAS Traffic di Dashboard memakai auto-scale per NAS dengan pembulatan unit bps/Kbps/Mbps/Gbps agar garis tidak terlihat jomplang saat traffic kecil atau ada lonjakan besar.
- Kotak NAS Status di Dashboard dibuat mengisi kolomnya secara penuh dan lebih sejajar dengan kotak PPP-DHCP/Hotspot.

## [2.11.23] - 2026-07-31

### Fixed

- Header popup bayar QR di mobile kini membungkus teks nama pelanggan dan paket secara penuh, tanpa terpotong menjadi titik-titik.

## [2.11.22] - 2026-07-31

### Changed

- Header popup bayar QR kini menampilkan nama pelanggan dan paket pada baris pertama, lalu nomor invoice dan jatuh tempo pada baris kedua.
- Informasi panjang `Internet : username - paket - jatuh tempo` di bawah total bayar QR dihapus agar popup lebih bersih.

## [2.11.21] - 2026-07-31

### Changed

- Popup bayar QR mempertahankan nama pelanggan dan nomor invoice di header, lalu menampilkan paket serta jatuh tempo secara ringkas di bawah total bayar.
- Tabel detail pada popup bayar QR dihapus agar tampilan lebih presisi di desktop dan mobile.

## [2.11.20] - 2026-07-31

### Fixed

- Posisi popup/dialog dibuat fixed-center terhadap viewport agar tetap presisi ketika halaman digeser.
- Toast di atas popup kini ikut viewport saat scroll, sehingga peringatan tetap terlihat di desktop dan mobile.

## [2.11.19] - 2026-07-31

### Fixed

- Notifikasi peringatan/toast kini tampil di atas popup ketika dialog terbuka, sehingga tidak lagi tertutup layer modal atau jatuh terlalu bawah pada desktop.
- Panel lonceng notifikasi otomatis ditutup saat popup dibuka agar tidak tertinggal di belakang modal.

## [2.11.18] - 2026-07-31

### Fixed

- Popup bayar QR di Monitoring Tagihan Pelanggan diringkas agar detail invoice tidak tampil ganda dan tetap presisi di desktop maupun mobile.
- Tombol bayar QR otomatis terkunci ketika Payment Gateway belum aktif, sehingga admin tidak membuka popup yang pasti gagal.

## [2.11.17] - 2026-07-30

### Added

- Monitoring Tagihan Pelanggan kini memiliki tombol `QR` untuk menampilkan QRIS invoice langsung dari aplikasi, sehingga pelanggan bisa scan saat ditagih di lokasi.
- Popup QR memantau status pembayaran otomatis dan menutup sendiri saat invoice sudah lunas, lalu daftar tagihan direfresh.

### Changed

- Invoice yang sudah lunas via pembayaran online menampilkan status aksi `Lunas` terkunci dan rollback tetap terkunci.

## [2.11.16] - 2026-07-30

### Added

- Upload Foto Rumah dan Foto KTP di wizard tambah member serta edit contact member kini menyediakan pilihan `Pilih File` dan `Kamera`.
- Tombol kamera memakai kamera belakang perangkat mobile bila browser mendukung `capture`, sementara alur kompresi, penyimpanan, dan OCR KTP tetap memakai endpoint lama.

## [2.11.15] - 2026-07-30

### Changed

- Dashboard memakai mode sembunyi angka secara default, dengan tombol mata khusus role admin, owner, finance, dan sekretaris.
- Filter bulan Dashboard di desktop diposisikan di kanan, sementara tampilan mobile tetap full-width agar tidak keluar layar.
- Nilai dashboard yang disembunyikan memakai masker tetap agar jumlah digit nominal dan jumlah user tidak terbaca.

## [2.11.14] - 2026-07-30

### Fixed

- Installer dan updater kini menonaktifkan runtime worker Whatsapp lama yang terpisah, sehingga queue Whatsapp berjalan di service utama seperti konfigurasi produksi dan pesan baru tidak tertahan di status pending akibat cache beda proses.

## [2.11.13] - 2026-07-30

### Fixed

- Default hari reminder dan grace isolir billing dikembalikan agar tetap ditentukan dari pengaturan masing-masing usaha, bukan dipaksa mengikuti contoh server lain.

## [2.11.12] - 2026-07-30

### Changed

- Installer/repair menormalkan konfigurasi relay Whatsapp Gateway yang terlalu agresif menjadi minimal 30 detik dan timeout 15 detik agar pesan transaksi tidak mudah pending.

## [2.11.11] - 2026-07-30

### Fixed

- Installer GenieACS kini menunggu UI dan NBI siap sebelum bootstrap agar instalasi tidak berhenti dengan error `fetch failed`.
- Bootstrap GenieACS diberi retry dan tidak mematikan proses instalasi jika Virtual Parameters belum bisa dipasang pada percobaan awal.

## [2.11.10] - 2026-07-30

### Changed

- Monitoring Member dan Monitoring Tagihan Pelanggan sekarang menampilkan tombol `Lihat Peta` berikon di bawah alamat pelanggan.

### Fixed

- Popup lokasi pelanggan tetap bisa dibuka walau koordinat atau foto rumah belum tersedia, sehingga data kosong mudah terlihat untuk ditindaklanjuti.
- Data lokasi dan foto rumah member ikut dibawa ke daftar tagihan pelanggan agar collector bisa membuka detail lokasi tanpa masuk ke edit contact.

## [2.11.9] - 2026-07-30

### Changed

- Installer GenieACS di Ubuntu/Debian mencoba paket apt `genieacs` lebih dulu jika tersedia, lalu fallback ke npm global jika paket OS tidak ada atau tidak lengkap.
- Image MongoDB GenieACS bawaan dinormalisasi ke `docker.io/library/mongo:7` agar instalasi tidak gagal ketika env lama berisi format image yang salah.
- Uninstall total menampilkan mode `--purge-deps` untuk mencabut paket OS pendukung pada mesin khusus billing, sementara uninstall normal tetap aman untuk server yang berbagi service.

### Fixed

- Repair/update GenieACS kini membersihkan nilai `GENIEACS_MONGODB_IMAGE` yang rusak sebelum env di-load sehingga tidak berhenti karena format seperti `docker.io mongo:7`.
- Unit MongoDB GenieACS systemd/OpenRC memiliki default image yang valid meskipun env belum lengkap.

## [2.11.8] - 2026-07-30

### Changed

- Usage PPPoE harian kini dicatat sebagai delta counter nyata dari FreeRADIUS melalui Radius Connector agar grafik WifiKu/Member bergerak realtime ke depan.
- WifiKu otomatis refresh ringan tiap 30 detik saat pelanggan sedang login dan tab browser aktif.

### Fixed

- Total client aktif GenieACS/WifiKu tidak lagi membesar karena data `Hosts.Host` stale; angka mengikuti detail aktif WiFi/LAN yang benar-benar terbaca.
- Popup usage/client WifiKu dapat diperbarui saat masih terbuka tanpa error `showModal`.

## [2.11.7] - 2026-07-30

### Changed

- Chart usage 7 hari di WifiKu dan Member dibuat lebih ringkas: label nilai bawah dihapus, tanggal tetap tampil di graph, dan detail nilai muncul saat disentuh/diklik.
- Kolom Total Active di menu GenieACS sekarang bisa dibuka untuk melihat detail client 2.4G, 5G, dan LAN lengkap dengan nama perangkat, IP, dan MAC.

### Fixed

- Nama perangkat client yang sedang konek dari GenieACS kini digabung dari data AssociatedDevice dan Hosts.Host berdasarkan MAC/IP agar tidak kosong di WifiKu.
- Tooltip chart pada mobile kini memakai target sentuh khusus dan tetap muncul di atas dialog/pop-up.

## [2.11.6] - 2026-07-29

### Fixed

- Tombol Unpaid dan Overdue di dashboard kini membuka Monitoring Tagihan dengan filter yang tepat: Belum Bayar dan Lewat Tempo, bukan filter pelanggan isolir.

## [2.11.5] - 2026-07-29

### Changed

- Ringkasan Monthly Billing dashboard kini berbasis transaksi bulan terpilih: invoice dihitung dari tanggal terbit, sedangkan Paid dihitung dari tanggal bayar.
- Invoice bulan depan yang sudah terbit H-advance ikut masuk Total Invoice dan Unpaid pada bulan invoice tersebut diterbitkan.

## [2.11.4] - 2026-07-29

### Changed

- Filter bulan halaman seperti Pengeluaran/Pemasukan/Rekap kini memakai month picker aplikasi dengan tampilan bulan yang jelas, tidak lagi bergantung pada tampilan native browser.

## [2.11.3] - 2026-07-29

### Fixed

- Scheduler billing otomatis kini memeriksa periode berjalan dan periode berikutnya, sehingga invoice fixed date awal bulan tetap terbit sesuai H-advance sebelum pergantian bulan.
- Waktu isolir otomatis kini memakai waktu runtime scheduler yang sama dengan invoice/reminder, sehingga simulasi dan eksekusi jam isolir konsisten.

## [2.11.2] - 2026-07-29

### Fixed

- Panel Recent Transactions dan Audit Log di dashboard dirapikan untuk layar mobile kecil agar nominal, waktu, dan teks tidak bertumpuk.

## [2.11.1] - 2026-07-29

### Fixed

- Panel Audit Log dashboard dan endpoint aktivitas kini dibatasi untuk admin, owner, finance, dan sekretaris.

## [2.11.0] - 2026-07-29

### Changed

- Kartu dashboard sekarang membuka menu tujuan dengan preset filter yang sesuai: Tagihan Bulanan, Tagihan Pelanggan Lunas/Semua/Lewat Tempo/Isolir, Pengeluaran, dan Mutasi Bulanan.
- Navigasi dashboard memakai history browser normal sehingga tombol Back kembali ke halaman sebelumnya.
- Filter bulan di laporan, tagihan pelanggan, pemasukan, dan pengeluaran diseragamkan sebagai month picker.

## [2.10.14] - 2026-07-29

### Changed

- Dashboard mengikuti model ringkas Cempaka: kartu pendapatan/pengeluaran/profit lebih padat, panel Monthly Billing dalam satu section, serta panel transaksi dan audit terbaru.
- Panel transaksi dan audit dashboard dimuat setelah ringkasan utama supaya loading dashboard tetap ringan.

## [2.10.13] - 2026-07-29

### Fixed

- WAHA default install baru dipindahkan ke engine `WEBJS` agar QR lebih stabil saat engine socket langsung gagal registration.
- QR WAHA tidak lagi dicetak ke log service; QR tetap diambil dari menu Whatsapp Gateway.
- Installer melengkapi `WAHA_PRINT_QR=false` pada env WAHA lama jika belum tersedia.

## [2.10.12] - 2026-07-29

### Fixed

- Web isolir sekarang bisa mencari invoice aktif dari IP session FreeRADIUS saat URL isolir tidak membawa nomor invoice, sehingga tombol bayar tetap muncul untuk pelanggan yang sedang redirect isolir.
- OCR KTP diperkuat untuk kasus NIK perempuan dan hasil OCR yang menyisipkan karakter noise seperti `?`, serta nama `SRI...` tanpa spasi.
- Upload ulang foto KTP pada Edit Member kini benar-benar mengganti hasil OCR lama; field `Nama di KTP` dan `Nomor KTP` tetap bisa dikoreksi manual.
- Tombol QR Whatsapp Gateway mencoba start/reconnect ulang session WAHA saat status disconnected/failed sebelum mengambil QR.

## [2.10.11] - 2026-07-28

### Changed

- Kolom pencarian Radius PPP-DHCP dan Hotspot dipindahkan ke bawah filter `Online/Offline`, lalu tombol `Cari` dan `Reset` berada tepat di bawah kolom pencarian.

## [2.10.10] - 2026-07-28

### Changed

- Toolbar Radius PPP-DHCP dan Hotspot dirapikan: tombol `Cari` dan `Reset` sekarang berada di baris bawah filter, sementara tombol aksi tetap di bawahnya agar lebih mudah dipakai di browser desktop maupun mobile.

## [2.10.9] - 2026-07-28

### Fixed

- CSS halaman link invoice kini menghormati atribut `hidden`, sehingga row `Fee Rp 0` benar-benar hilang pada invoice paid manual/tunai lama.

## [2.10.8] - 2026-07-28

### Fixed

- Row `Fee` pada halaman link invoice kini disembunyikan sejak HTML awal, lalu hanya ditampilkan oleh JavaScript saat invoice memang memakai fee payment gateway. Ini mencegah salah paham pada invoice lama yang sudah paid manual.

## [2.10.7] - 2026-07-28

### Fixed

- Link invoice pembayaran yang sudah lunas lewat metode manual seperti Tunai, Transfer, atau Loket tidak lagi menampilkan baris `Fee`; Fee hanya tampil untuk checkout/pembayaran online yang benar-benar memakai payment gateway.

## [2.10.6] - 2026-07-28

### Changed

- Live-search di menu utama sekarang tidak lagi mengganti halaman/tabel menjadi teks `Memuat...` saat menunggu respons, sehingga terasa seperti pencarian cepat di menu User.
- Pencarian Pelanggan Online memakai cache data yang sudah tampil saat mengetik, bukan fetch ulang ke backend setiap huruf.

## [2.10.5] - 2026-07-28

### Changed

- Search di menu yang memakai kolom pencarian utama sekarang berjalan otomatis saat diketik dengan debounce 450ms; tombol Cari tetap tersedia untuk eksekusi manual.
- Opsi filter Radius NAS/profile memakai cache browser singkat dan dibersihkan otomatis saat Site, NAS Radius, atau profile berubah agar live-search tetap ringan.

### Fixed

- Modal Tambah User PPP-DHCP kembali dimulai dari step Account, tetap menyediakan opsi tambah ke Member dan auto username/password tanpa membuat browser freeze.
- Data Member, peta, OCR, dan pencarian duplikat di wizard PPP-DHCP baru diload saat step Member dibuka agar modal tetap ringan.
- Search pada menu User dan modal Invoice Manual ikut berjalan otomatis saat diketik.

## [2.10.4] - 2026-07-28

### Fixed

- Modal Tambah User PPP-DHCP tidak lagi bisa freeze/not responding saat auto username/password menunggu preview Member ID dari server.

## [2.10.3] - 2026-07-28

### Changed

- Wizard Tambah User PPP-DHCP dibalik menjadi Member, Payment, Account, lalu Review agar data pelanggan dan paket dibuat sebelum akun teknis PPPoE/DHCP.
- Tambah User PPP-DHCP menambahkan opsi auto username/password berbasis Member ID, tetap bisa dimatikan untuk input manual.
- Saat mengetik nama, WhatsApp, atau NIK member baru, sistem menampilkan kandidat member mirip secara bertahap tanpa perlu tombol Cari.

### Fixed

- Link invoice yang sudah `paid` kini menampilkan metode dan nominal pembayaran aktual. Fee payment gateway tidak lagi ditambahkan ulang untuk pembayaran manual tunai/transfer/loket.
- Baris Fee pada link invoice paid manual disembunyikan; Fee hanya tampil jika pembayaran benar-benar online/gateway.

## [2.10.2] - 2026-07-28

### Fixed

- Sinkron NAS FreeRADIUS sekarang melakukan restart service FreeRADIUS penuh setelah daftar NAS berubah, bukan reload, agar SQL client baru langsung aktif dan tidak menyebabkan `radius timeout` / `unknown client`.
- Restart FreeRADIUS dari aplikasi mendukung nama service `freeradius.service`, `radiusd.service`, dan OpenRC agar update lebih aman lintas distro.

## [2.10.1] - 2026-07-28

### Fixed

- Upload KTP baru sekarang mengganti Nomor KTP dari hasil OCR walaupun field sebelumnya masih berisi data lama.

## [2.10.0] - 2026-07-28

### Changed

- Upload KTP menyimpan nama hasil OCR sebagai `Nama Terbaca` dan hanya melengkapi nama pelanggan otomatis jika nama lama kosong, auto-fill, cocok, atau kurang lengkap.
- Nama pelanggan yang berbeda dari hasil OCR tidak ditimpa; form menampilkan status review dengan format nama lama dan nama hasil OCR di dalam tanda kurung.

## [2.9.67] - 2026-07-28

### Added

- OCR foto KTP sekarang mencoba membaca nama pelanggan selain NIK, lalu mengisi Nama Member/Nama Lengkap otomatis saat field masih kosong atau masih auto-fill dari username.

## [2.9.66] - 2026-07-27

### Changed

- Fitur Telegram PPPoE server-side dihapus dari menu Pengaturan dan API agar notifikasi PPPoE tetap memakai mekanisme router/site masing-masing.

## [2.9.65] - 2026-07-27

### Fixed

- Telegram PPPoE logout sekarang menyertakan redaman modem dan total active modem terakhir dari cache state billing.
- Monitor Telegram PPPoE memakai cache session FreeRADIUS dan refresh data ACS secara terukur agar notifikasi tetap cepat tanpa membebani router, ACS, atau database.
- Default interval pantau Telegram PPPoE untuk install baru diturunkan menjadi 5 detik.

## [2.9.64] - 2026-07-27

### Added

- Pengaturan menambahkan popup Telegram PPPoE untuk mengaktifkan notifikasi login/logout dari server billing, lengkap dengan bot token, chat ID, interval pantau, preview pesan, dan tombol Simpan & Test.
- Notifikasi Telegram PPPoE memantau session FreeRADIUS dari billing, menyimpan state aktif di Redis agar tidak spam setelah restart, dan dapat menambahkan redaman serta total active modem dari GenieACS.
- GenieACS kini menghitung total active modem secara global dari WiFi dan LAN host yang terbaca, bukan hanya asosiasi 2.4G/5G.

## [2.9.63] - 2026-07-27

### Fixed

- Dashboard, Laporan Harian lokal, Statistik, dan Router NAS memakai cache runtime Redis dengan TTL pendek serta fallback cache memori agar reload menu berat tidak menghitung ulang data besar terus-menerus.
- Statistik pelanggan/voucher/pendapatan mengurangi lookup member PPP berulang sehingga chart 12 bulan lebih ringan pada data invoice dan payment besar.

## [2.9.62] - 2026-07-27

### Fixed

- Dashboard memakai fast-path periode pembayaran dari timestamp ISO sehingga ringkasan pembayaran bulanan tidak memanggil parser tanggal lengkap untuk ribuan transaksi.

## [2.9.61] - 2026-07-27

### Fixed

- Ringkasan dashboard memakai status invoice yang sudah dihitung pada scan invoice yang sama, sehingga tidak menghitung ulang ribuan invoice saat menghitung pembayaran bulan berjalan.

## [2.9.60] - 2026-07-27

### Fixed

- Pembacaan payment aktif diberi cache singkat dan validasi status invoice dihitung sekali per siklus, sehingga Dashboard dan Laporan Harian tidak mengulang validasi ribuan payment pada setiap render.

## [2.9.59] - 2026-07-27

### Fixed

- Dashboard Billing menghitung ringkasan tagihan langsung dari invoice/payment tanpa membangun seluruh row tagihan, sehingga load awal dashboard jauh lebih ringan pada data invoice besar.
- Widget Router NAS dashboard memakai cache singkat dan timeout SNMP interface yang lebih hemat agar site yang lambat/timeout tidak menahan dashboard terlalu lama.

## [2.9.58] - 2026-07-27

### Changed

- Sidebar desktop sekarang mempertahankan submenu yang sedang terbuka saat memilih submenu; drawer mobile tetap menutup setelah menu dipilih.
- Menambahkan role Sekretaris sebagai akses operasional terbatas seperti owner, tanpa kewenangan admin, pengaturan, payment gateway, WA gateway, atau withdraw.
- Edit Payment Member menambahkan opsi pengecualian isolir otomatis untuk pelanggan kebijakan khusus; default tetap mengikuti sistem billing.
- Dashboard memakai cache singkat untuk ringkasan session Radius dan refresh NAS yang lebih hemat saat tab browser tidak aktif.

## [2.9.57] - 2026-07-27

### Changed

- Monitoring Member sekarang diurutkan dari member terbaru dibuat/pasang ke yang paling lama, selaras dengan urutan PPP-DHCP.
- Export XLSX dan pratinjau PDF Member tetap memakai urutan nama A-Z agar laporan/arsip mudah dibaca.

## [2.9.56] - 2026-07-26

### Changed

- Popup progress update sekarang menampilkan log dari atas ke bawah dengan aktivitas terbaru di posisi paling bawah dan otomatis scroll ke baris terakhir.
- Log update ditampilkan dengan timestamp detail agar proses update lebih mudah diaudit.

## [2.9.55] - 2026-07-26

### Changed

- Radius PPP-DHCP dan Hotspot tab user sekarang diurutkan dari user terbaru dibuat ke yang paling lama.
- Form Tambah/Edit User Hotspot menambahkan catatan pembeli dan menampilkannya di bawah username pada tabel.
- Summary Radius Hotspot dipangkas menjadi Tersedia, Aktif, Online, dan Offline; Offline hanya menghitung voucher aktif/relevan yang tidak sedang tersambung.
- User Hotspot manual dengan status pembayaran Unpaid tidak dihitung sebagai voucher tersedia dan tidak disinkronkan ke FreeRADIUS sampai statusnya Paid/Free.

## [2.9.54] - 2026-07-26

### Changed

- Teks kode voucher pada print thermal RawBT dibuat menjadi `Kode Voucher : XXXXX` dan tetap rata tengah.

## [2.9.53] - 2026-07-26

### Fixed

- Posisi QR voucher pada print thermal RawBT diratakan ke tengah struk, lalu alignment printer dikembalikan normal setelah QR selesai dicetak.

## [2.9.52] - 2026-07-26

### Fixed

- Print thermal voucher dan bukti pembayaran di Android sekarang memakai jalur langsung RawBT agar printer tidak mencetak screenshot/pratinjau Chrome.
- Voucher thermal multi-checklist dikirim sebagai tiket berurutan ke RawBT, sementara mode A4 tetap memakai layout browser yang sudah ada.

## [2.9.51] - 2026-07-26

### Fixed

- Print thermal dari Chrome mobile sekarang menahan mode print lebih lama agar tidak mencetak halaman aplikasi dan modal.
- Print thermal voucher multi-checklist memakai dokumen print terisolasi, satu voucher per halaman/lembar thermal.

## [2.9.50] - 2026-07-26

### Changed

- Print thermal tagihan bulanan sekarang satu transaksi per lembar dengan rincian Add Ons, PPN, dan Diskon tetap tampil ringkas.
- Print thermal voucher Hotspot dibuat sebagai tiket thermal mandiri per voucher, sementara layout A4 voucher tetap memakai format sebelumnya.

## [2.9.49] - 2026-07-26

### Changed

- Link invoice bulanan sekarang menampilkan rincian Add Ons, PPN, dan Diskon; nilai kosong ditampilkan sebagai `-`.
- Nota pembayaran bulanan mode A4 sekarang memuat ringkasan Add Ons, PPN, dan Diskon tanpa mengubah layout thermal.

## [2.9.48] - 2026-07-26

### Changed

- Pesan Whatsapp `Payment Paid` sekarang menyertakan link invoice/status pembayaran lunas untuk semua metode pembayaran.
- Template WA lama yang belum memuat link bukti pembayaran otomatis ditambahi link saat pesan lunas dibuat.

## [2.9.47] - 2026-07-26

### Fixed

- Detail invoice di Monitoring > Member sekarang hanya menampilkan invoice milik member tersebut. Pencocokan `accountId` kosong tidak lagi dianggap cocok agar invoice pelanggan lain tidak ikut tampil.

## [2.9.46] - 2026-07-26

### Fixed

- Installer sekarang melewati GenieACS bawaan billing jika mesin sudah memiliki GenieACS existing, lalu membersihkan unit `fakenet-billing-genieacs-*` yang stale agar tidak ikut start/restart.
- Helper `fakenet-billing-stack` hanya mengelola GenieACS bawaan jika instalasi ditandai sebagai bundled, sehingga update web tidak memaksa service ACS tambahan pada server yang sudah punya ACS sendiri.
- Updater mempertahankan mode GenieACS sesuai marker instalasi: bundled tetap dikelola, existing tetap dibiarkan memakai ACS yang sudah ada.

## [2.9.45] - 2026-07-26

### Changed

- Default jam kirim invoice/reminder diubah menjadi `08:00` dan default jam isolir otomatis menjadi `13:30`.
- Install/update yang masih memakai default lama `06:00` dan `00:00` otomatis dimigrasikan ke default baru tanpa menimpa jam custom pengguna.

## [2.9.44] - 2026-07-26

### Changed

- Whatsapp Gateway sekarang memakai throttle otomatis: pesan transaksi tetap cepat, sedangkan broadcast dan postpaid billing cycle memakai jalur bulk aman tanpa perlu mengatur angka manual.
- Antrean bulk WA lama otomatis dirapatkan ke pola throttle baru agar broadcast besar tidak menunggu jeda lama per batch.

## [2.9.43] - 2026-07-26

### Fixed

- Kompatibilitas tabel pada layar kecil ditingkatkan agar teks panjang di Member, Tagihan Pelanggan, dan tabel umum tidak menumpuk.

## [2.9.42] - 2026-07-26

### Changed

- Dropdown zona waktu aplikasi diringkas hanya ke zona Indonesia: WIB, WITA, dan WIT.

## [2.9.41] - 2026-07-26

### Fixed

- Memperbaiki boot frontend yang gagal karena fungsi tanggal membaca `state` sebelum inisialisasi setelah penambahan pengaturan zona waktu.
- Halaman login/dashboard tidak lagi stuck kosong setelah update timezone.

## [2.9.40] - 2026-07-26

### Fixed

- Halaman login tidak lagi tertahan oleh CDN Leaflet/OpenStreetMap; library peta sekarang dimuat hanya saat fitur peta dibuka.
- Mengatasi tampilan stuck di shell Dashboard sebelum login ketika koneksi ke CDN lambat atau terblokir.

## [2.9.39] - 2026-07-26

### Fixed

- Frontend diberi fallback `matchMedia.addListener` untuk mencegah layar putih pada browser/WebView yang belum mendukung `addEventListener` di media query.

## [2.9.38] - 2026-07-26

### Added

- Pengaturan usaha ditambah `Zona waktu aplikasi` dengan pilihan umum WIB/WITA/WIT dan custom IANA timezone.

### Changed

- Tampilan jam, laporan harian, scheduler invoice/reminder, isolir, dan automation billing membaca zona waktu dari Pengaturan dengan default `Asia/Makassar`.

## [2.9.37] - 2026-07-26

### Changed

- Popup progress update sekarang menampilkan `Log terbaru` di bagian atas lengkap dengan waktu polling terakhir.
- Detail log proses tetap tersedia di bawah untuk audit ketika update gagal atau tertahan.

## [2.9.36] - 2026-07-26

### Fixed

- Copyright aplikasi dikunci tetap `FAKE.NET` dan tidak ikut berubah mengikuti nama usaha/brand client.
- Fallback HTML sebelum JavaScript load juga memakai copyright `FAKE.NET`.

## [2.9.35] - 2026-07-26

### Added

- Pengaturan > Update Aplikasi sekarang memakai popup progress dengan indikator persen bulat, status proses, durasi, dan log update terakhir.

### Changed

- Tombol update otomatis menjadi hijau `Up To Date` dan terkunci saat versi lokal sudah sama dengan rilis terbaru.

### Fixed

- Proses update yang lama karena install dependency atau restart service tidak lagi terasa menggantung tanpa informasi.

## [2.9.34] - 2026-07-26

### Added

- Laporan > Statistik sekarang menghitung nilai rupiah PSB dan Cabut, lalu menampilkan `Senilai Rp ...` pada kartu ringkasan serta tooltip chart pertumbuhan pelanggan.
- Arsip cabut PPP-DHCP baru menyimpan estimasi nilai bulanan pelanggan agar statistik cabut tetap terbaca meskipun member sudah dihapus.
- Billing Settings ditambah satu pengaturan `Jam kirim invoice/reminder` untuk menahan WA invoice terbit dan reminder otomatis sampai jam yang ditentukan.
- Monitoring > Tagihan Pelanggan ditambah aksi `Diskon` untuk mengubah diskon invoice belum bayar pada bulan itu saja.
- Laporan > Tagihan Harian menampilkan tombol audit diskon di sebelah icon PDF hanya untuk pembayaran invoice yang punya diskon.

### Changed

- Default jam kirim invoice/reminder otomatis diubah menjadi `06:00` WITA untuk install baru atau setting kosong.

### Fixed

- Link checkout payment gateway lama otomatis dibuat tidak berlaku ketika nominal invoice berubah karena diskon manual.

## [2.9.33] - 2026-07-26

### Changed

- Sidebar submenu diberi penanda visual berupa rail dan chip ikon kecil agar hierarki menu lebih jelas di desktop maupun mobile.
- Ikon menu dan submenu disesuaikan ulang sesuai fungsi, termasuk Monitoring, Laporan Statistik, Rekapitulasi, Voucher, Stok Inventaris, GenieACS, dan Manajemen Keuangan.

## [2.9.32] - 2026-07-26

### Fixed

- Metadata awal HTML, favicon, Open Graph, dan manifest PWA dibuat mengikuti nama usaha serta logo dari pengaturan sebelum JavaScript berjalan, termasuk PNG preview khusus untuk pratinjau Whatsapp dan install app.
- Upload logo usaha baru disimpan sebagai file terkompresi di `data/uploads/profile/`; pengaturan hanya menyimpan path file, dengan migrasi otomatis untuk logo lama yang masih berupa base64.
- Tabel User memakai label `Identitas Staf` dan menampilkan nama, alamat, kontak, serta jabatan lengkap tanpa dipotong `...` di desktop maupun mobile.

## [2.9.31] - 2026-07-26

### Fixed

- OCR KTP dibuat lebih akurat untuk foto yang terbaca manusia tetapi salah dibaca Tesseract, termasuk koreksi karakter mirip angka dan validasi berdasarkan pola NIK serta tanggal lahir.
- Layout Add-on layanan bulanan di wizard PPP-DHCP dan modal Member dibuat dua kolom di desktop jika ruang cukup, tetap satu kolom di mobile.

## [2.9.30] - 2026-07-26

### Changed

- Monitoring > Member diringkas agar filter yang tampil hanya Status, Tipe, Semua Periode, Semua Pelanggan/Pelanggan Baru, dan pencarian.

## [2.9.29] - 2026-07-26

### Added

- Wizard tambah user PPP-DHCP dan modal Contact Member mendukung upload foto KTP dengan OCR lokal untuk membaca Nomor KTP otomatis.
- Foto KTP disimpan di storage privat terenkripsi aplikasi dan hanya dibuka lewat endpoint terautentikasi untuk role yang berwenang.
- Installer dan repair/update menyiapkan dependency Tesseract OCR di Ubuntu/Debian, RHEL/CentOS family, dan Alpine.

### Fixed

- OCR KTP tetap aman dipakai walaupun Tesseract belum tersedia: upload tidak memutus alur, field Nomor KTP tetap bisa diisi manual.

## [2.9.28] - 2026-07-26

### Added

- Monitoring > Member ditambah filter Pelanggan Baru berdasarkan periode registrasi, rentang tanggal, dan pembuat/installer, serta export XLSX dan pratinjau print PDF.
- Manifest PWA dibuat dinamis dari Identity Perusahaan agar nama dan logo saat install aplikasi/browser bookmark mengikuti setting usaha.

### Fixed

- Fallback tampilan awal, public info, scan voucher, notifikasi browser, dan kode invoice dibersihkan agar tidak kembali menampilkan identitas template saat branding tenant belum selesai dimuat.

## [2.9.27] - 2026-07-26

### Changed

- Tampilan Monitoring > Member > Usage diringkas: tombol dan notice periode dihapus karena periode dan konteks sudah terbaca dari chart serta ringkasan usage.

## [2.9.26] - 2026-07-26

### Added

- Filter status `Pasang Baru` ditambahkan pada Radius > PPP-DHCP untuk menampilkan akun PPP-DHCP yang linked ke member dan dihitung sebagai PSB bulan berjalan.
- Monitoring > Member > Usage sekarang menampilkan chart total usage 12 bulan terakhir dan tombol periode untuk memuat ulang usage bulan aktif.

### Fixed

- Alur voucher online setelah pembayaran dibuat lebih tahan gangguan captive portal: halaman status membawa mode auto-login, lalu langsung redirect ke login hotspot saat voucher sudah paid.
- Link WA voucher expired sekarang mengarah ke status expired dan tidak lagi menampilkan tombol login untuk voucher yang sudah habis.
- Laporan Payment Gateway memakai nominal invoice/paket sebagai `amount` utama untuk paket bulanan dan voucher, sementara fee dan settlement bersih tetap tersimpan untuk audit.
- Tombol Enter pada filter mobile/desktop sekarang memicu pencarian seperti tombol Cari.

## [2.9.25] - 2026-07-26

### Fixed

- Panduan redirect isolir dikembalikan ke pola script produksi yang sudah stabil, dan tombol salin sekarang selalu membaca ulang field `Interface list WAN` agar nilai seperti `wan` ikut masuk ke script.

## [2.9.24] - 2026-07-25

### Fixed

- Script panduan redirect isolir MikroTik dibuat lebih kompatibel dengan RouterOS v6/v7: nilai IP/list ditulis literal, tidak memakai negasi variable, dan output paste tidak lagi bergantung pada `:local` lintas baris.

## [2.9.23] - 2026-07-25

### Fixed

- Panduan redirect isolir MikroTik sekarang membuat/mengisi interface-list WAN secara opsional dan menaruh rule isolir di urutan atas agar tidak kalah oleh rule accept umum.

## [2.9.22] - 2026-07-25

### Fixed

- Fee QRIS voucher Tripay dihitung gross-up agar settlement bersih tetap sama dengan harga paket voucher.
- Transaksi dan laporan voucher online memakai nominal paket, sementara fee/settlement Tripay tetap disimpan terpisah.

## [2.9.21] - 2026-07-25

### Changed

- Layout Add Ons member dibuat lebih compact: desktop dapat menampilkan beberapa add-on berjajar, sedangkan mobile tetap satu kolom.

## [2.9.20] - 2026-07-25

### Fixed

- Diskon pengimbang PPN otomatis mengikuti subtotal paket plus add-on agar preview dan invoice tidak menghasilkan total ganjil.
- Preview invoice manual menampilkan rincian Add Ons, dan template WA menyediakan nilai `Add Ons : -` saat pelanggan tidak punya add-on.

## [2.9.19] - 2026-07-25

### Added

- Member PPP-DHCP sekarang mendukung add-on layanan bulanan multi item, seperti sewa CCTV, STB TV, atau biaya layanan tambahan lain.
- Add-on tampil pada wizard tambah member, edit payment member, detail member, dan ikut tersimpan pada invoice baru.

### Changed

- Total tagihan member dihitung dari harga paket ditambah total add-on sebelum PPN/BHP USO dan diskon.

## [2.9.18] - 2026-07-25

### Fixed

- Diskon nominal tagihan pelanggan sekarang dipotong setelah PPN/BHP USO, sehingga diskon sebesar nilai PPN mengembalikan total ke harga paket.
- Preview wizard tambah member PPP-DHCP mengikuti formula tagihan yang sama dengan invoice backend.
- Pembayaran `Tunai - Loket` kembali dikelompokkan sebagai Tunai pada laporan tagihan.

## [2.9.17] - 2026-07-25

### Fixed

- Installer memasang dan memvalidasi dependency SNMP client (`snmpwalk`/`snmpget`) untuk Monitoring NAS/Pelanggan Online.
- Installer memasang dan memvalidasi FreeRADIUS utilities (`radclient`) agar CoA/kick session tersedia setelah install fresh.
- Paket pendukung `procps` dan `iproute` ikut dipasang agar deteksi proses/port lebih konsisten di VM minimal.

## [2.9.16] - 2026-07-25

### Fixed

- Installer mendeteksi GenieACS existing lewat service, proses, atau port default dan otomatis melewati GenieACS bawaan agar tidak konflik saat install di VM yang sudah memiliki ACS.
- Installer dan repair/update hanya memasang atau merestart unit GenieACS bawaan jika GenieACS lokal billing memang diaktifkan.
- Instalasi GenieACS global dilewati jika binary GenieACS sudah tersedia di mesin.

## [2.9.15] - 2026-07-25

### Changed

- Diskon member/tagihan diubah menjadi nominal rupiah, bukan persentase, termasuk preview wizard PPP-DHCP, edit payment member, invoice manual, dan template import PPP-DHCP.

### Fixed

- GenieACS mendukung pengecualian suffix username seperti `@kampung.net` untuk kebutuhan demo/tester site tertentu.

## [2.9.14] - 2026-07-25

### Fixed

- Notifikasi pembayaran online tidak lagi replay transaksi lama saat browser billing baru dibuka setelah lama tidak aktif.
- Web Push pembayaran online diberi TTL lebih panjang dan transaksi yang sudah pernah dipush ditandai agar tidak terkirim ganda.

## [2.9.13] - 2026-07-25

### Changed

- Notifikasi lonceng tagihan pelanggan sekarang memakai konteks Lewat Tempo dan membuka filter Lewat Tempo.

## [2.9.12] - 2026-07-25

### Changed

- Monitoring Tagihan Pelanggan default membuka daftar lewat tempo bulan berjalan agar penagihan langsung fokus pada pelanggan yang harus dikejar.

## [2.9.11] - 2026-07-25

### Changed

- Menu Pemasukan dan Pengeluaran memiliki filter bulan langsung di halaman masing-masing memakai month picker.

## [2.9.10] - 2026-07-25

### Fixed

- Frontend memakai versi aplikasi dari runtime server untuk cache-buster, fallback tampilan versi, dan service worker.
- ETag static file yang berisi token runtime ikut berubah sesuai versi aplikasi agar browser tidak tertahan di bundle lama setelah update.

## [2.9.9] - 2026-07-25

### Fixed

- Parser XLSX import PPP-DHCP membaca cell kosong self-closing dengan benar, sehingga kolom setelah cell kosong tidak bergeser dan kolom `whatsapp` tetap terbaca.

## [2.9.8] - 2026-07-24

### Fixed

- Import PPP-DHCP membaca lebih banyak alias nomor Whatsapp seperti `No Telp/WA`, `Nomor Handphone`, dan variasi telepon lain.
- Import PPP-DHCP bisa mengambil nomor dari kolom kontak non-standar jika nilainya jelas nomor Indonesia, tanpa salah mengambil KTP/MAC/IP sebagai Whatsapp.

## [2.9.7] - 2026-07-24

### Fixed

- Import PPP-DHCP menerima alias kolom nomor Whatsapp yang lebih luas seperti `No WA`, `Nomor WA`, `No HP`, dan `Telepon`.
- File XLSX dengan nomor Whatsapp diawali apostrophe Excel tetap terbaca saat `add_to_member` bernilai `yes`.

## [2.9.6] - 2026-07-24

### Fixed

- Import PPP-DHCP menormalkan nomor Whatsapp dari format `08`, `628`, `+628`, angka tanpa nol depan, angka desimal Excel, dan scientific notation menjadi format lokal `08`.
- Panduan template XLSX diperjelas agar operator bisa memakai format nomor Whatsapp yang aman saat import.

## [2.9.5] - 2026-07-23

### Fixed

- Klasifikasi laporan lama `Tunai - Loket` dipaksa masuk kelompok Transfer Manual meskipun metadata lama masih menyimpan kategori Tunai.

## [2.9.4] - 2026-07-23

### Changed

- Pembayaran loket dan transfer manual disatukan sebagai `Transfer Manual`; catatan konfirmasi tetap dipertahankan untuk audit.

## [2.9.3] - 2026-07-23

### Fixed

- Pengaturan panduan redirect isolir sekarang disimpan di database aplikasi, sehingga tetap tersedia saat berganti browser atau perangkat.

## [2.9.2] - 2026-07-23

### Fixed

- FreeRADIUS otomatis reload setelah daftar NAS berubah, dengan fallback restart jika reload tidak tersedia.
- Panduan koneksi RADIUS dan isolir lebih aman untuk copy-paste RouterOS v6/v7.
- Rule isolir lama dengan variasi comment `Generated by Billing` dibersihkan sebelum rule baru dibuat.
- Pengaturan panduan isolir tersimpan di browser untuk pemeriksaan ulang.

## [2.9.1] - 2026-07-23

### Fixed

- Bulk delete PPP-DHCP dan Hotspot memproses seluruh pilihan `All` melalui satu request, dengan notifikasi progres dan hasil sukses/gagal.
- Generator koneksi RADIUS MikroTik memakai separator command yang aman untuk copy-paste, rebuild entry berdasarkan IP, dan kompatibel RouterOS v6.49/v7.
- DHCP RADIUS memakai sintaks `use-radius=yes` yang benar tanpa property `accounting` yang tidak valid.
- Checklist PPP, Hotspot, dan DHCP langsung memperbarui script saat berubah.

- Menetapkan `require-message-auth=no` pada entry RADIUS agar kompatibel dengan FreeRADIUS standar.

## [2.9.0] - 2026-07-23

### Added

- Installer baru memasang GenieACS 1.2.16, MongoDB persisten, akun UI awal, autentikasi Inform CPE, dan seluruh service CWMP/NBI/FS/UI secara otomatis.
- Virtual Parameters `RXPower` dan `gettemp` beserta provision/preset global dipasang otomatis untuk membaca redaman dan suhu lintas vendor ONU.
- Payment Gateway menampilkan Total Bersih Transaksi, estimasi Saldo Dalam Kliring, dan Biaya Merchant berdasarkan transaksi yang sudah dibayar.
- Metode `Tunai - Loket` tersedia untuk pencatatan kas tunai yang diterima di rumah/loket beserta user yang mengonfirmasi pembayaran.
- Jabatan user mengikuti pilihan terkontrol berdasarkan role operasional ISP.

### Changed

- Referensi Payment Gateway dibakukan menjadi `Internet Bulanan: Nama Member — Nama Paket` atau `Voucher Hotspot: Nama — Paket`.
- Ringkasan Hotspot memisahkan voucher Tersedia, Aktif, Expired, Nonaktif, serta session Online/Offline.
- Nama pembuat user tampil di bawah Profile PPP-DHCP dan Hotspot untuk kebutuhan audit.
- Whatsapp Gateway memakai rentang kirim penuh 24 jam sebagai default; laju dan retry tetap dikelola BullMQ.
- Sinkron FreeRADIUS tetap berjalan otomatis/event-driven dan endpoint darurat tetap tersedia, sedangkan tombol manual di UI dihilangkan.
- Tampilan tabel Payment Gateway, Monitoring, dan Laporan dirapikan pada desktop maupun mobile.

### Security

- GenieACS NBI `7557` dan MongoDB `27017` hanya bind ke localhost; port tersebut tidak dipublikasikan langsung ke jaringan.
- Update menyimpan backup env GenieACS dan tidak memasang ACS lokal pada mesin lama yang sudah memakai ACS eksternal.

### Fixed

- Nominal bersih transaksi memakai `amount_received` dari callback provider bila tersedia dan tidak mengubah transaksi hasil migrasi lama.
- Status voucher membedakan masa berlaku voucher dari status session agar data Expired dan Offline tidak tercampur.

## [2.8.5] - 2026-07-21

### Performance

- Status pembayaran aktif memakai indeks invoice agar laporan tidak melakukan pencarian berulang pada ribuan invoice.
- Formatter tanggal zona Asia/Makassar dipakai ulang untuk mengurangi beban CPU pada laporan, monitoring, dan scheduler.

## [2.8.4] - 2026-07-21

### Fixed

- Kontrol aktif/nonaktif dan persentase BHP USO sekarang tampil pada menu Radius > Setting > Billing Settings yang digunakan aplikasi.

## [2.8.3] - 2026-07-21

### Changed

- Tabel Payment Gateway memakai susunan kolom tetap di desktop dan kartu ringkas di mobile.
- Istilah transaksi Payment Gateway diselaraskan ke bahasa Indonesia, termasuk Voucher Hotspot, Lunas, Menunggu, Saldo, dan Biaya.
- Referensi transaksi ditampilkan sebagai nomor referensi dan deskripsi pada dua baris yang jelas.
- Header, status, metode, nominal, dan tanggal pada tabel tidak lagi terpotong di tengah kata.

### Performance

- Asset JS, CSS, HTML, JSON, manifest, dan SVG dikirim dengan kompresi Brotli atau gzip serta cache yang mengikuti perubahan file.
- Pembukaan menu Payment Gateway tidak lagi menunggu sinkronisasi Tripay; sinkronisasi tetap berjalan di background.
- Sinkronisasi Tripay dibuat idempoten dan tidak memproses ulang invoice atau voucher yang sudah lunas.
- Scheduler billing hanya menyimpan koleksi yang benar-benar berubah, sedangkan ringkasan notifikasi memakai cache singkat dan polling yang lebih ringan.

## [2.8.2] - 2026-07-21

### Fixed

- Notifikasi pembayaran online Chrome sekarang mengenali permission admin, owner, dan finance dari role aplikasi dengan benar.
- Web Push tetap dikirim melalui Service Worker ketika halaman billing tidak sedang terbuka.
- Pengiriman ke FCM memakai retry terbatas untuk gangguan sementara dan membersihkan subscription yang sudah kedaluwarsa.
- Log Web Push mencatat jumlah penerima, keberhasilan, dan ringkasan kegagalan tanpa membocorkan endpoint browser.

## [2.8.1] - 2026-07-21

### Fixed

- Instal dependency saat update memakai staging directory dan baru diaktifkan setelah verifikasi berhasil.
- `npm ci` dan `npm install` memiliki timeout agar update tidak menggantung tanpa batas.
- Kegagalan atau timeout dependency mempertahankan `node_modules` aktif dan melepas lock update secara aman.
- Timeout mendukung GNU coreutils serta BusyBox pada Alpine Linux.

## [2.8.0] - 2026-07-21

### Added

- Upload foto rumah dan foto profil otomatis dikompresi ke WEBP dengan resolusi sesuai kebutuhan.
- File gambar identik memakai hash yang sama agar tidak tersimpan berulang.
- File upload yatim dibersihkan otomatis setelah masa aman 24 jam.

### Changed

- Batas file sumber dinaikkan menjadi 8 MB; hasil simpan foto rumah maksimal 1600x1600 dan foto profil maksimal 512x512.

## [2.7.4] - 2026-07-21

### Changed

- Template import PPP-DHCP diringkas tanpa kolom redundant dan harga tetap mengikuti Profile.
- Baris contoh template memakai latar putih, sedangkan header dan penanda mulai import tetap memiliki warna pembeda.
- Parser tetap menerima nama kolom legacy agar file import lama tetap dapat digunakan.

## [2.7.3] - 2026-07-21

### Fixed

- Month picker WifiKu diberi label jelas pada tampilan desktop.
- Menu Akun Saya tertutup saat klik di luar area atau menekan Escape.
- Nama SSID WifiKu sekarang sama dengan SSID yang digunakan pada tombol Edit, termasuk pemilihan SSID 5G pribadi.

## [2.7.2] - 2026-07-21

### Fixed

- WifiKu tidak lagi memprioritaskan SSID 5G `wifimurah` atau jaringan open jika SSID 5G pribadi tersedia.
- Cache asset WifiKu dan Service Worker diperbarui agar perubahan frontend langsung terbaca setelah update.

## [2.7.1] - 2026-07-21

### Fixed

- Sesi login aplikasi disimpan persisten agar tetap aktif setelah restart atau update.
- Pembayaran online tetap terdeteksi sampai 24 jam ketika browser sempat offline.
- Statistik PSB dan import PPP-DHCP kembali lolos seluruh pengujian.
- WifiKu mempertahankan month picker native dan pemilihan SSID 5G pribadi.

## [2.7.0] - 2026-07-21

### Changed

- Statistik PSB bulan berjalan kini hanya menghitung akun PPP-DHCP baru yang linked ke Member, aktif pada bulan tersebut, bukan data import/migrasi, dan belum memiliki invoice periode sebelumnya.

## [2.6.0] - 2026-07-21

### Changed

- WifiKu hanya menampilkan SSID utama 2.4G/5G berdasarkan parameter utama GenieACS.
- SSID tambahan atau hotspot seperti `wifimurah` tidak lagi dipilih sebagai jaringan utama pelanggan.

## [2.5.9] - 2026-07-21

### Fixed

- Tombol Simpan pada Akun Saya WifiKu membaca field form secara eksplisit dan menampilkan status request dengan benar.

## [2.5.8] - 2026-07-21

### Fixed

- Subweb WifiKu kini dapat menyajikan foto rumah dari `data/uploads` secara aman.

## [2.5.7] - 2026-07-21

### Fixed

- Preview foto rumah WifiKu tidak lagi memiliki tinggi minimum yang memaksa gambar diperbesar.

## [2.5.6] - 2026-07-21

### Fixed

- Layout desktop WifiKu memaksa peta dan foto rumah tampil vertikal.
- Foto rumah tidak lagi dipaksa melebar melebihi ukuran naturalnya sehingga tidak diperburuk oleh pembesaran CSS.

## [2.5.5] - 2026-07-21

### Changed

- Preview lokasi peta dan foto rumah WifiKu dipisah menjadi dua kotak vertikal di Akun Saya.

## [2.5.4] - 2026-07-21

### Fixed

- Panel lokasi dan foto rumah dipindahkan dari halaman utama WifiKu ke menu Akun Saya.

## [2.5.3] - 2026-07-21

### Fixed

- Preview foto rumah WifiKu mempertahankan rasio asli agar tidak terpotong atau tampak pecah karena pembesaran paksa.

## [2.5.2] - 2026-07-21

### Changed

- Lokasi dan foto rumah WifiKu hanya tampil di menu Akun Saya, bukan di halaman utama portal.

Format versi memakai pola `major.minor.patch`:

- Patch/minor kecil: `1.0.0` ke `1.0.1`
- Perubahan besar fitur/struktur: `1.0.0` ke `1.1.0`

## [2.5.0] - 2026-07-21

### Added

- Opsi BHP USO pada Billing Settings, default nonaktif dengan tarif bawaan 1,25% yang dapat diubah.
- Preview BHP USO pada wizard Tambah Member PPP-DHCP.
- Invoice baru dan invoice terbuka menghitung BHP USO saat opsi diaktifkan; invoice Paid tetap tidak diubah.
- WifiKu memiliki dropdown profil topbar dengan menu Akun Saya dan Logout.
- Pelanggan WifiKu dapat memperbarui nama, nomor KTP, email, alamat, latitude, dan longitude.
- Nomor WhatsApp tetap terkunci sebagai identitas OTP; fitur foto pribadi pelanggan tidak ditambahkan.
- Endpoint pembaruan profil WifiKu dibatasi pada sesi pelanggan yang sedang login.

## [2.5.1] - 2026-07-21

### Changed

- WifiKu menampilkan preview peta dan foto rumah dari data Member.
- Pembaruan data rumah dan peta diarahkan melalui admin.

## [2.4.1] - 2026-07-20

### Fixed

- CSS thermal Tagihan Harian disamakan dengan layout voucher, termasuk ukuran tetap, padding, dan penghapusan garis pemisah yang dapat membuat halaman tambahan.

## [2.4.0] - 2026-07-20

### Changed

- Notifikasi pembayaran online di Chrome/Web Push tetap tampil sampai pengguna mengklik atau menutupnya.
- Timer penutupan otomatis notifikasi sistem dihapus; toast internal aplikasi tetap singkat.

## [2.3.10] - 2026-07-20

### Fixed

- Preview Tagihan Harian merender ulang jumlah struk per halaman saat ukuran A4/thermal diganti.
- Thermal selalu satu struk per kertas, sedangkan A4 tetap tiga struk per halaman.

## [2.3.9] - 2026-07-20

### Fixed

- Struktur print thermal Tagihan Harian disamakan dengan voucher agar tinggi nota otomatis dan tidak mewarisi tinggi A4.

## [2.3.8] - 2026-07-20

### Fixed

- Lebar container print thermal Tagihan Harian mengikuti 58 mm atau 80 mm dan tidak lagi mewarisi ukuran A4.

## [2.3.7] - 2026-07-20

### Fixed

- Print thermal Tagihan Harian memaksa page break setiap kuitansi sehingga satu transaksi dicetak satu kertas.

## [2.3.6] - 2026-07-20

### Fixed

- Normalisasi paket pada print Tagihan Harian menghapus username meskipun format data berakhir dengan tanda `|`.

## [2.3.5] - 2026-07-20

### Fixed

- Print Tagihan Harian hanya menampilkan nama paket/profile dan menghapus prefix username seperti `username@domain |`.

## [2.3.4] - 2026-07-20

### Changed

- Nota Tagihan Harian menampilkan label `Paket` dari profile plan pelanggan.
- Total dibayar pada preview dan hasil print dibuat rata tengah untuk thermal 58/80 mm dan A4.

## [2.3.3] - 2026-07-20

### Fixed

- Print thermal Tagihan Harian 58/80 mm mencetak satu transaksi per kertas saat batch dipilih.
- Layout A4 tetap memakai susunan batch yang sudah tersedia.

## [2.3.2] - 2026-07-20

### Fixed

- Generator redirect isolir HTTPS tidak lagi meng-intercept port 443 melalui Web Proxy.
- Script HTTPS menambahkan whitelist domain isolir Cloudflare sebelum rule drop internet.
- Script HTTP tetap mempertahankan redirect sesuai konfigurasi lokal.

## [2.3.1] - 2026-07-20

### Changed

- Web isolir mendukung pilihan target HTTP lokal port 8892 atau HTTPS domain publik.
- Script redirect MikroTik membersihkan rule isolir Billing sebelumnya sebelum memasang rule baru.
- Tampilan tombol Bayar Tagihan dan Hubungi Admin diperbaiki agar sejajar di mobile.

### Fixed

- Perhitungan nominal bersih pembayaran Tripay dan settlement voucher disimpan untuk pelaporan tanpa mengubah riwayat lama.
- Alamat pelanggan tersedia pada template pesan invoice Whatsapp.

## [2.3.0] - 2026-07-20

### Added

- Billing Setting memiliki batas terminate otomatis berdasarkan jumlah hari sejak pelanggan diisolir karena tunggakan; nilai default `0` menonaktifkan terminate otomatis.
- Halaman isolir menampilkan status terminated, invoice terakhir, tombol pembayaran, dan informasi bahwa aktivasi kembali memerlukan konfirmasi admin.

### Changed

- Pelanggan PPP-DHCP terminated tetap diarahkan ke group/pool isolir Radius agar portal isolir dapat diakses, sedangkan Hotspot terminated tetap diblokir.
- Akun yang diterminate berhenti menerima invoice periode baru, tetapi invoice lama dan riwayat transaksi tetap dipertahankan.

### Fixed

- Metadata tanggal isolir dibersihkan secara konsisten setelah akun aktif kembali sehingga scheduler tidak memakai tanggal status lama.

## [2.2.0] - 2026-07-20

### Added

- Notifikasi sistem Web Push untuk pembayaran online paket bulanan dan voucher, termasuk saat dashboard tidak sedang terbuka.
- Service worker dan web app manifest untuk dukungan notifikasi Chrome/mobile dengan subscription terpisah per akun dan perangkat.

### Changed

- Fallback notifikasi lonceng memeriksa transaksi online setiap 15 detik tanpa menambah notifikasi untuk pembayaran manual.
- Installer dan updater memverifikasi dependensi Web Push dari `package-lock.json`; kunci VAPID tersimpan di data persisten dan ikut backup.

### Security

- Subscription push hanya dibuat untuk user aktif yang memiliki izin Payment Gateway, serta dilepas dari akun ketika Logout.

## [2.1.0] - 2026-07-20

### Added

- Pelanggan PPP-DHCP yang sedang diisolir dapat diaktifkan sementara tanpa batas waktu; invoice dan reminder tetap berjalan sampai petugas mengisolirnya kembali.
- Status `Aktif manual` ditampilkan pada user Radius sebagai penanda pengecualian auto-isolir yang dapat diaudit.

### Changed

- Perubahan tanggal `Next Invoice` khusus Fixed Date berlaku mulai invoice berikutnya dan tidak mengubah invoice yang sudah terbit.
- Billing Cycle tetap mengikuti tanggal global di Radius > Setting dan tidak memakai override tanggal per pelanggan.

### Fixed

- Scheduler tidak lagi mengisolir ulang pelanggan yang sengaja diaktifkan sementara, tanpa mengubah auto-isolir pelanggan lainnya.

## [2.0.7] - 2026-07-20

### Added

- Menu User dilengkapi ringkasan akun, pencarian stabil, filter role/status, pilihan jumlah baris, dan lompatan halaman.
- Tabel User menampilkan identitas petugas, kontak, unit, pembatasan NAS reseller, status, serta login terakhir secara lebih terstruktur.
- Form tambah/edit User menampilkan penjelasan kewenangan role sebelum akun disimpan.

### Security

- Pembayaran online/payment gateway tidak dapat di-rollback manual; tombol Rollback tampil terkunci dan backend menolak bypass endpoint.

### Fixed

- Cache key CSS dan JavaScript dashboard disamakan dengan versi rilis agar browser/Cloudflare tidak mempertahankan tampilan lama setelah update.

## [2.0.6] - 2026-07-20

### Fixed

- Basis rilis dikembalikan ke layout stabil `2.0.0` dan menghapus regresi print/mobile yang muncul setelahnya.
- Tabel Radius PPP-DHCP dan Hotspot lebih rapi di mobile; status Offline menampilkan tanggal dan jam terakhir aktif di bawah badge.
- Menu User menampilkan foto profil di sebelah nama, dan edit user memakai field profil yang sama seperti Akun Saya.
- Payment Gateway menjaga transaksi pending tetap di tab Pending dengan penanda jumlah pending.

## [2.0.0] - 2026-07-20

### Added

- Pengaturan Akun Saya untuk setiap user: ubah identitas pribadi, ID Karyawan/NIK, jabatan, email, nomor HP/WA, alamat, foto profil, dan password sendiri.
- Upload gambar aplikasi disimpan sebagai file di `data/uploads/profile` dan `data/uploads/member-house`, bukan sebagai base64 di data utama.
- Migrasi startup otomatis memindahkan foto profil/foto rumah lama berbasis base64 ke folder upload tanpa menyentuh inventory, transaksi, voucher, atau logo.
- Avatar default tampil ketika user belum memiliki foto profil.

### Changed

- Menu akun topbar memakai foto/avatar user, sapaan nama, menu Akun Saya, dan Logout dalam satu dropdown.
- Unit/Divisi user mengikuti role agar konsisten sebagai dasar pengembangan absensi.
- Template voucher Hotspot A4, Thermal 58 mm, Thermal 80 mm, Small, dan editor HTML/CSS disesuaikan dengan pola Mikhmon.
- Preview dan print voucher diperbaiki agar QR lebih jelas, layout tidak memanjang, teks tidak menumpuk, dan laporan voucher harian memuat informasi penting.

## [1.6.3] - 2026-07-19

### Changed

- Field global Link Publik di pengaturan Voucher Online dihapus agar tujuan login voucher hanya mengikuti URL Login Hotspot pada Site/NAS terkait.
- Penyimpanan pengaturan Voucher Online tidak lagi mengirim nilai link global dari browser.

## [1.6.2] - 2026-07-19

### Fixed

- Kolom NAS pada Radius > Hotspot User memakai fallback penugasan NAS paket voucher dan NAS-IP-Address session aktif ketika data user lama belum memiliki `nasId`.
- Nama NAS pada tab User dan Session kembali konsisten tanpa mengubah data voucher atau session FreeRADIUS.

## [1.6.1] - 2026-07-19

### Added

- Scanner kamera HTTPS tersedia langsung pada domain portal voucher dan tidak memakai pemilih file.
- Scanner menampilkan petunjuk membuka Chrome/Safari ketika mini-browser captive portal Android/iPhone membatasi izin kamera.
- Contoh login Hotspot netral, panduan izin kamera, dan script walled garden idempoten tersedia pada folder `deploy/hotspot-login`.

### Fixed

- Tombol Masuk dan ikon QR pada login Hotspot dibuat ringkas, sejajar, dan memakai satu ikon QR berukuran 16 piksel.
- QR voucher baru, URL QR lama, pasangan username/password, dan kode voucher dengan username sama dengan password dapat dipindai.
- QR yang tidak dikenali sekarang menampilkan keterangan, bukan berhenti tanpa respons.
- Hasil scan dari browser utama kembali ke URL login Site dan menjalankan autentikasi Hotspot otomatis.

## [1.6.0] - 2026-07-19

### Added

- Setiap Site memiliki URL login Hotspot sendiri sebagai tujuan login voucher dan QR cetak.
- Order voucher menyimpan NAS asal dan melakukan auto-login satu kali setelah callback pembayaran berstatus paid.
- QR voucher membuka login page Site, mengisi username/password otomatis, serta mendukung autentikasi CHAP maupun PAP melalui bridge template MikroTik.
- Template login Hotspot menyediakan tombol kamera QR di sebelah tombol Masuk dengan fallback pemilihan foto pada perangkat mobile.

### Changed

- Link Whatsapp voucher tetap memakai halaman status publik billing, lalu tombol login diselesaikan ke Site yang benar berdasarkan NAS order.
- Field Link login voucher di Pengaturan umum dihapus karena URL sekarang dikelola per Site.

## [1.5.9] - 2026-07-19

### Fixed

- Alamat NAS dari kolom PostgreSQL `inet` dinormalisasi tanpa suffix `/32` atau `/128` sebelum dicocokkan dengan Site.
- Session Hotspot dan PPP-DHCP menampilkan nama NAS yang dikonfigurasi, bukan alamat NAS mentah, ketika alamatnya cocok.

## [1.5.8] - 2026-07-19

### Fixed

- Cache browser halaman utama diperbarui agar kontrol profil RADIUS terbaru langsung dimuat setelah update aplikasi.

## [1.5.7] - 2026-07-19

### Added

- Profil manual PPP-DHCP dan Hotspot menyediakan pilihan Queue Type yang disembunyikan saat profil ditautkan langsung ke profil MikroTik.
- Queue Type manual memakai profil pembawa queue bersama sehingga satu profil bandwidth billing dapat digunakan lintas site.
- Script Hubungkan RADIUS ikut membuat atau memperbarui profil pembawa queue pada setiap NAS dan memeriksa ketersediaan Queue Type terlebih dahulu.

### Verified

- Profil pembawa `cake-default` untuk PPP-DHCP dan Hotspot berhasil dibuat, dibaca, dan dibersihkan kembali pada RouterOS 7.18.2.

## [1.5.6] - 2026-07-19

### Fixed

- Profil manual Hotspot dan PPP-DHCP mengirim `Mikrotik-Rate-Limit` sederhana tanpa susunan burst `0s` yang ditolak RouterOS.
- Konfigurasi burst tetap mendukung Rate Limit, Burst Limit, Burst Threshold, Burst Time, Priority, dan Min Rate dengan susunan atribut RouterOS yang lengkap.
- Nilai bandwidth dan burst divalidasi saat profil disimpan agar kesalahan format tidak baru muncul ketika pelanggan login.

## [1.5.5] - 2026-07-19

### Fixed

- Halaman pembayaran bulanan menerima detail invoice dan metode pembayaran dalam satu respons agar tetap tampil pada koneksi site berlatensi tinggi.
- Request baca invoice dan channel memiliki timeout serta retry terukur tanpa mengulang request pembuatan checkout.
- Daftar channel Tripay memakai cache server singkat dan fallback cache terakhir ketika koneksi provider mengalami gangguan sementara.

## [1.5.4] - 2026-07-19

### Fixed

- Portal voucher online hanya menampilkan paket milik NAS/site yang dibawa oleh tautan captive portal.
- Akses portal tanpa identitas NAS tidak lagi menggabungkan paket seluruh site dan menyediakan pemilihan site sebagai fallback.
- Pembuatan order memvalidasi kecocokan paket dengan NAS sehingga request lintas site ditolak.
- Konfigurasi paket jual online kini mewajibkan NAS penjualan pada instalasi multi-site.
- Halaman status order menyiapkan dan menampilkan barcode QRIS secara otomatis tanpa klik checkout tambahan.

## [1.5.3] - 2026-07-19

### Fixed

- Status pembayaran voucher dan user Hotspot yang dihasilkan otomatis terdeteksi lintas akun maksimal sekitar 10 detik.
- Radius Hotspot serta Laporan Voucher Harian/Bulanan memperbarui tampilan hanya ketika revisi data voucher berubah.
- Callback paid voucher dibuat sepenuhnya idempoten agar callback ulang tidak menggandakan user, transaksi gateway, atau pesan Whatsapp.
- Pembatasan reseller tetap berlaku sehingga reseller hanya melihat voucher yang dibuatnya sendiri.

## [1.5.2] - 2026-07-19

### Fixed

- Status pembayaran manual tersimpan global dan halaman Tagihan Pelanggan akun lain mendeteksi perubahan otomatis maksimal sekitar 10 detik.
- Aksi bayar dibuat idempoten agar klik bersamaan atau klik ulang tidak menggandakan pembayaran maupun notifikasi Whatsapp.
- Request API browser tidak memakai cache sehingga status invoice selalu bersumber dari data aplikasi terbaru.
- Audit pembayaran mencatat invoice, pelanggan, metode, nominal, nama, username, dan role akun yang menjalankan aksi.

## [1.5.1] - 2026-07-19

### Fixed

- Checkout aktif untuk invoice dan voucher dipakai ulang agar klik ulang tidak membuat transaksi Tripay duplikat yang kemudian berstatus kedaluwarsa.
- Request checkout bersamaan untuk referensi, kanal, dan nominal yang sama dikunci menjadi satu transaksi provider.
- Masa aktif Tripay disesuaikan per kanal: QRIS/e-wallet mengikuti batas kanal, sedangkan virtual account dan gerai dapat aktif hingga 24 jam.
- Sinkron riwayat Tripay dijeda selama enam jam ketika IP keluar CGNAT ditolak; callback melalui Cloudflare Tunnel tetap memproses pembayaran secara realtime.

### Changed

- Pengaturan Payment Gateway menyediakan masa aktif terpisah untuk QRIS/e-wallet, virtual account, dan gerai.

## [1.5.0] - 2026-07-19

### Changed

- Penyimpanan pelanggan, invoice, pembayaran, pesan Whatsapp, dan aktivitas dipisahkan ke tabel PostgreSQL terstruktur melalui migrasi otomatis yang idempoten.
- Store aktif disimpan di cache memori proses sehingga request tidak lagi memindahkan dan mem-parsing seluruh data aplikasi dari Redis berulang kali.
- Pemeriksaan lisensi dan autentikasi memakai snapshot store yang sama dalam satu request.
- Aset statis dilayani tanpa membaca database serta mendukung validasi ETag agar refresh browser tidak mengunduh ulang file yang belum berubah.
- Pengaturan Voucher Online memakai layout paket responsif yang lebih ringkas dan presisi pada desktop, laptop, ponsel, serta tema gelap.

### Performance

- Perubahan status ACK Whatsapp hanya memperbarui row pesan terkait dan tidak lagi menulis ulang seluruh data aplikasi.
- Automation tidak melakukan write PostgreSQL ketika hasil mutasi tidak mengubah data.
- Startup memigrasikan format lama dalam satu transaksi; histori lama tetap dipertahankan dan backup aplikasi tetap memuat seluruh data.

## [1.4.6] - 2026-07-19

### Fixed

- Draft notifikasi invoice yang masih relevan otomatis masuk antrean setelah Whatsapp Gateway diaktifkan.
- Status `queued` ditampilkan sebagai Antrean, bukan Pending, dan health check BullMQ sekarang menghitung job prioritas.

## [1.4.5] - 2026-07-19

### Fixed

- Nama user topbar tidak lagi memakai ellipsis pada desktop maupun mobile; nama lengkap membungkus di dalam ruang yang tersedia.

## [1.4.4] - 2026-07-19

### Fixed

- Nama user pada topbar ditampilkan lebih lengkap di desktop dan membungkus secara responsif di mobile tanpa menggeser ikon maupun tombol Logout keluar layar.

## [1.4.3] - 2026-07-19

### Added

- Status pesan Whatsapp menerima ACK resmi WAHA: satu centang saat terkirim, dua centang abu-abu saat diterima, dan dua centang biru saat dibaca.
- Installer mengaktifkan webhook ACK internal yang dilindungi HMAC dan tetap tersedia setelah update aplikasi.

### Fixed

- Notifikasi invoice, reminder, isolir, dan aktivasi otomatis diproses sebagai pesan transaksional agar tidak tertunda seperti broadcast.
- Pesan pembayaran menampilkan kanal pembayaran sebenarnya, misalnya QRIS, Indomaret, atau BRI Virtual Account.

### Changed

- Instalasi baru mengaktifkan Whatsapp Gateway dan jendela pengiriman 24 jam secara default; setelah scan QR, notifikasi dapat langsung berjalan tanpa mengatur jam kirim.

## [1.4.2] - 2026-07-18

### Fixed

- Tombol Kembali dan Login pada portal voucher mempertahankan konteks NAS dan kembali ke captive portal Hotspot asal, bukan membuka path `login` pada server voucher.

## [1.4.0] - 2026-07-18

### Added

- Paket voucher online dapat dikunci ke NAS tertentu sehingga portal voucher dari setiap site hanya menampilkan paket yang sesuai.
- Histori penjualan voucher hasil migrasi dapat disimpan terpisah dari order aktif agar laporan lama tetap tersedia tanpa menghidupkan kembali user Radius.

### Changed

- Print A4 voucher menggunakan format landscape 50 voucher berukuran ringkas, dengan Call Center yang dibaca dari akun Whatsapp Gateway aktif.
- QR voucher berisi URL autentikasi Hotspot langsung sehingga scan dapat mengisi username dan password secara otomatis.

### Fixed

- Penyimpanan PostgreSQL mendukung payload aplikasi yang lebih besar setelah histori transaksi dimigrasikan tanpa menyebabkan proses baca terhenti karena batas buffer.

## [1.3.3] - 2026-07-18

### Fixed

- Pembayaran online dengan waktu Unix dari provider kini tetap muncul pada Laporan Tagihan Harian, rekap bulanan, dashboard, dan statistik; metode transaksi tetap menampilkan kanal sebenarnya seperti QRIS sementara pengelompokannya tetap Pembayaran Online.

### Changed

- Role Finance dapat membaca dan mengatur Radius tanpa memperoleh akses pengaturan sistem atau manajemen user.
- Preset awal pratinjau voucher menggunakan A4 50 voucher agar hasil browser print konsisten.
- Sesi login berlaku 24 jam sehingga browser dapat ditutup dan dibuka kembali tanpa login pada hari yang sama; login ulang memulai masa 24 jam baru dan selalu diarahkan ke Dashboard.
- Rollback invoice menjadi koreksi internal, tidak lagi mengirim Whatsapp pelanggan, dan template `Payment Cancel` dihapus dari konfigurasi Whatsapp Gateway.

## [1.3.2] - 2026-07-18

### Fixed

- Jam transaksi Payment Gateway memakai `paidAt` atau `createdAt` asli dari provider dan ditampilkan dalam zona waktu WITA, bukan jam dari field tanggal tanpa waktu.

### Added

- Settings Payment Gateway menyediakan tanggal mulai riwayat provider agar transaksi uji lama dapat dihapus dan tidak diimpor kembali oleh auto-sync.

## [1.3.1] - 2026-07-18

### Added

- Worker latar belakang menyinkron riwayat Tripay otomatis setiap dua menit tanpa harus membuka halaman Payment Gateway.

### Changed

- Webhook tetap memproses pembayaran secara real-time, sedangkan auto-sync menjadi jalur pemulihan idempoten untuk callback yang terlambat atau terlewat.
- Sinkron berkala dibatasi pada 300 transaksi terbaru agar tetap ringan; tombol Sinkron Tripay tetap dapat mengambil riwayat lebih lengkap.

## [1.3.0] - 2026-07-18

### Added

- Riwayat transaksi Tripay dapat disinkron otomatis saat halaman Payment Gateway dibuka dan secara manual melalui tombol Sinkron Tripay.
- Transaksi Tripay berstatus paid yang callback-nya terlewat direkonsiliasi secara idempoten ke invoice bulanan atau order voucher tanpa menggandakan pembayaran.

### Changed

- Pesan voucher memakai tautan login Hotspot langsung yang sudah membawa username dan password voucher.
- Laporan Payment Gateway menampilkan provider fee dari Tripay dan tetap menyimpan riwayat expired maupun pending sebagai rekam jejak provider.

## [1.2.11] - 2026-07-18

### Fixed

- Transaksi pada Laporan Tagihan Harian diurutkan berdasarkan waktu pembayaran sebenarnya dari terbaru ke terlama, termasuk ketika data memakai campuran zona waktu UTC dan WITA.

## [1.2.10] - 2026-07-18

### Fixed

- Jam pembayaran manual pada laporan memakai waktu transaksi sebenarnya dari `createdAt` ketika `paidAt` hanya berisi tanggal, sehingga tidak lagi tampil keliru sebagai `08.00` WITA.

## [1.2.9] - 2026-07-18

### Fixed

- Setiap checkout Tripay kini mengirim `callback_url` yang tersimpan di Pengaturan Payment Gateway sehingga transaksi baru tidak bergantung pada callback default lama di dashboard merchant.

## [1.2.8] - 2026-07-18

### Fixed

- Scheduler tidak lagi membuat notifikasi suspend baru untuk pelanggan yang status member dan akun Radius-nya sudah isolir.
- Pesan dengan jenis, invoice, penerima, dan isi yang sama tidak lagi diduplikasi selama pesan sebelumnya masih mengantre.

### Changed

- Notifikasi transaksi satuan seperti pembayaran lunas dan reminder langsung masuk antrean prioritas tanpa penundaan berdasarkan panjang antrean.
- Broadcast dan aksi batch tetap memakai jeda serta pembagian batch, sementara BullMQ mempertahankan jeda aman antar-pesan.

## [1.2.7] - 2026-07-18

### Added

- Tombol ikon `Sinkron Lokasi` tersedia konsisten pada wizard Tambah Member dan Edit Contact Member, lengkap dengan pembaruan koordinat, akurasi, serta marker peta.

### Changed

- Peta Edit Member mendukung pemilihan titik dan pergeseran marker secara manual sebagai alternatif geolocation browser.

## [1.2.6] - 2026-07-18

### Added

- Filter NAS pada menu GenieACS tersedia setelah filter status dan dapat digabungkan dengan pencarian, filter redaman, serta pagination.

## [1.2.5] - 2026-07-18

### Fixed

- Status pelanggan yang sedang diisolir pada Monitoring > Tagihan Pelanggan kini ditampilkan sebagai `Isolir`, bukan `Lewat tempo`, tanpa mengubah status dan perhitungan invoice.

## [1.2.4] - 2026-07-18

### Added

- `bootstrap-update.sh` menyediakan jalur pemulihan satu kali untuk instalasi `v1.1.2` atau lebih lama yang masih tertahan lock updater lama.

### Changed

- Dokumentasi pemulihan versi lama memakai updater terbaru langsung dari repository, bukan menjalankan helper lama setelah lock dihapus.

### Security

- Bootstrap menolak menghapus lock jika proses updater yang sah masih aktif, memvalidasi file updater yang diunduh, dan tidak menyimpan credential repository.

## [1.2.3] - 2026-07-18

### Fixed

- Cleanup updater selalu mengembalikan exit code sukses setelah update selesai, termasuk ketika folder temporer archive tidak digunakan.
- Transient systemd unit tidak lagi ditandai gagal setelah log, health check, restart aplikasi, dan pembersihan lock sebenarnya berhasil.

## [1.2.2] - 2026-07-18

### Fixed

- Updater hanya me-restart service aplikasi melalui `restart-app`; Redis, PostgreSQL, Docker, dan FreeRADIUS tidak lagi ikut direstart saat update source.
- Mode repair yang dipanggil updater tidak lagi menulis ulang konfigurasi atau me-restart FreeRADIUS.
- Installer dapat membaca host, port, nama database, user, dan password Radius dari `FREERADIUS_DATABASE_URL` pada instalasi lama.
- Konfigurasi FreeRADIUS SQL tidak disentuh bila password database Radius tidak tersedia, sehingga credential aktif tidak dapat tertimpa menjadi kosong.

### Added

- Aksi stack `restart-app` tersedia untuk restart seluruh komponen aplikasi tanpa mengganggu service database dan autentikasi jaringan.

### Notes

- Patch ini melengkapi perbaikan lock `v1.2.1` setelah pengujian update end-to-end pada dev.

## [1.2.1] - 2026-07-18

### Fixed

- Update dari web dijalankan melalui transient systemd unit agar proses updater tidak ikut terbunuh saat `fakenet-billing.service` melakukan restart.
- Lock update divalidasi berdasarkan PID, command line proses, dan umur lock; lock invalid, PID yang sudah mati, PID milik proses lain, atau lock terlalu lama dibersihkan otomatis.
- Pembuatan lock memakai operasi atomic noclobber dan hanya pemilik lock yang boleh menghapusnya saat proses selesai.
- Trap cleanup updater tidak lagi tertimpa pada mode update archive.

### Added

- Command `fakenet-billing-stack clear-update-lock` membersihkan lock stale secara aman dan menolak penghapusan ketika updater masih aktif.
- Update web mencatat nama transient unit untuk memudahkan audit melalui systemd journal.

### Notes

- Server yang masih memakai `v1.1.2` dan sudah telanjur memiliki lock lama mungkin memerlukan satu kali penghapusan lock manual sebelum patch ini dapat ditarik.

## [1.2.0] - 2026-07-18

### Added

- Pengiriman Whatsapp Gateway memakai BullMQ di Redis dengan worker tunggal, delayed job, retry tiga kali, dan job ID idempotent.
- `uninstall.sh` tersedia sebagai wrapper uninstall total dan ikut membersihkan key BullMQ milik aplikasi.
- API Whatsapp Gateway menyertakan status antrean BullMQ untuk kebutuhan diagnosis tanpa membuka credential Redis.

### Changed

- PostgreSQL tetap menjadi outbox dan sumber status pesan pada UI; pesan lama berstatus queued otomatis diteruskan ke BullMQ setelah update.
- Billing Setting tetap menentukan penerbitan invoice, reminder, isolir, aktivasi, dan notifikasi. Jeda, batch, jam kirim, serta template tetap mengikuti menu Whatsapp Gateway.
- Instalasi dan update memverifikasi dependency BullMQ sebelum service stack dijalankan kembali.

### Fixed

- Antrean lebih dari 500 pesan tidak lagi membuang pesan pending atau failed; batas 500 hanya diterapkan pada riwayat final.
- Resend satuan maupun batch memakai revisi job baru sehingga tidak berbenturan dengan job BullMQ yang sudah completed atau failed.
- Worker menghormati jeda minimum dan jam kirim yang tersimpan, serta menutup koneksi Redis secara teratur saat service dihentikan.

### Notes

- Update tidak mengubah atau menghapus data aplikasi, invoice, pelanggan, template, maupun konfigurasi Whatsapp Gateway yang sudah tersimpan.
- WAHA tetap menjadi transport WhatsApp. BullMQ mengatur antrean dan retry, tetapi tidak menjamin akun WhatsApp bebas pembatasan platform.

## [1.1.2] - 2026-07-18

### Changed

- Member ID baru memakai prefix `22` diikuti 9 digit numerik unik, contohnya `22096501095`.
- Pembuatan Member ID dipindahkan dari browser ke server agar tidak bergantung pada random client dan mencegah benturan ID.
- Tabel `Rincian Harian` pada Laporan Statistik diganti panel ringkas 12 bulan berisi pelanggan aktif, pertumbuhan, voucher, pendapatan, pengeluaran, dan laba bersih.

### Fixed

- Member ID lama buatan billing yang masih 9 digit otomatis dimigrasikan ke format baru tanpa mengubah primary key internal pelanggan, invoice, atau transaksi.
- Salinan Member ID pada data RADIUS, invoice, pembayaran, pesan WA, dan catatan terkait ikut diperbarui secara idempotent sehingga relasi tetap utuh.

### Notes

- Member ID hasil import yang sudah memakai format `22xxxxxxxxx` tetap dipertahankan.
- Migrasi hanya menambah prefix pada ID lama yang tepat 9 digit; Member ID yang sudah memakai format baru tidak berubah.

## [1.1.1] - 2026-07-18

### Fixed

- Callback pembayaran Online meneruskan user yang baru diaktifkan ke tahap sinkron FreeRADIUS dan CoA, sehingga sesi isolir lama langsung terputus dan login ulang memakai profil aktif.

## [1.1.0] - 2026-07-18

### Changed

- Profil PPP-DHCP dan Hotspot yang ditautkan ke profil MikroTik kini sepenuhnya mewarisi rate-limit, queue type, pool, dan atribut lain dari profil RouterOS tanpa override limit dari RADIUS.
- Pembayaran Tunai, Transfer, dan Online memakai satu alur reaktivasi: invoice lunas, status pelanggan aktif, sinkron FreeRADIUS, lalu CoA hanya untuk username terkait.
- Automasi billing melakukan CoA terarah pada pelanggan yang baru diisolir atau diaktifkan agar sesi lama tidak mempertahankan profil sebelumnya.

### Fixed

- Pembayaran manual dari Monitoring Tagihan dan endpoint invoice sekarang benar-benar memperbarui akses RADIUS, bukan hanya status di aplikasi.
- Status user RADIUS yang masih isolir/terminated tidak lagi tertutup oleh status member yang keliru masih aktif.
- Profil Hotspot tertaut MikroTik tidak lagi menghasilkan queue `0/0`; profil Hotspot manual tetap mengirim limit RADIUS sesuai konfigurasi.
- IP statis yang diatur pada user billing tetap dipertahankan saat sinkron profil dan reaktivasi pembayaran.

### Notes

- Akun yang terminated manual tetap membutuhkan aktivasi oleh admin meskipun pembayarannya sudah lunas.
- Update hanya memperbarui source dan struktur aplikasi; database serta data pelanggan tidak diganti atau dihapus.

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

- Pembayaran hasil migrasi sistem lama dengan tambahan fee tetap terbaca sebagai Online dan memakai nominal transaksi aktual.
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

- Periode billing member mengikuti tipe pembayaran: `Postpaid` hanya `Fixed Date/Billing Cycle`, sedangkan `Prepaid` hanya `Fixed Date/Renewal`.
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
