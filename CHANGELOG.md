# Changelog

Semua perubahan penting FAKE.NET Billing dicatat di file ini.

Format versi memakai pola `major.minor.patch`:

- Patch/minor kecil: `1.0.0` ke `1.0.1`
- Perubahan besar fitur/struktur: `1.0.0` ke `1.1.0`

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
