'use strict';

const DEFAULTS=Object.freeze({
  odpDetected:'*GANGGUAN ODP*\nTiket: [ticket_no]\nArea: [odp]\nKondisi: Sinyal fiber terputus (LOS)\nRedaman terakhir: [last_rx]\nTerdampak: [affected] pelanggan\nPelanggan terpetakan: [total]\nReferensi: [network]\nWaktu: [time]',
  odpResolved:'*PENANGANAN ODP SELESAI*\nTiket: [ticket_no]\nArea: [odp]\nOnline: [online]/[eligible]\nModem kehilangan daya: [powered_off]\nSisa LOS: [remaining_los]\nPetugas: [technician]\nPendamping: [companions]\nCatatan: [progress]',
  odcDetected:'*GANGGUAN JARINGAN / AREA ODC*\nTiket: [ticket_no]\nReferensi: [network]\nKondisi: Sinyal fiber terputus (LOS)\nRedaman terakhir: [last_rx]\nTerdampak: [affected] pelanggan\nPelanggan terpetakan: [total]\nWaktu: [time]',
  odcResolved:'*PENANGANAN AREA ODC SELESAI*\nTiket: [ticket_no]\nReferensi: [network]\nOnline: [online]/[eligible]\nModem kehilangan daya: [powered_off]\nSisa LOS: [remaining_los]\nPetugas: [technician]\nPendamping: [companions]\nCatatan: [progress]',
  psbDetected:'*PERMINTAAN PASANG BARU*\nTiket: [ticket_no]\nPelanggan: [customer]\nPaket PSB: [package]\nKontak: [phone]\nAlamat: [location]\nArah pelanggan: [map]\nKeterangan: [request]',
  psbResolved:'*PERMINTAAN PASANG BARU SELESAI*\nTiket: [ticket_no]\nPelanggan: [customer]\nPaket PSB: [package]\nAlamat: [location]\nPetugas: [technician]\nPendamping: [companions]\nCatatan: [progress]',
  serviceDetected:'*[service_title]*\nTiket: [ticket_no]\nPelanggan: [customer]\nKategori: [category]\nKontak: [phone]\nAlamat: [location]\nArah pelanggan: [map]\nKeterangan: [request]',
  serviceResolved:'*[completion_title]*\nTiket: [ticket_no]\nPelanggan: [customer]\nKategori: [category]\nAlamat: [location]\nPetugas: [technician]\nPendamping: [companions]\nCatatan: [progress]',
  customerOutageDetected:'Halo [customer], kami mendeteksi gangguan jaringan pada [area] yang berdampak pada layanan Anda. Petugas sedang melakukan penanganan. Kami akan memberi kabar setelah perbaikan. Mohon maaf atas ketidaknyamanannya.',
  customerOutageResolved:'Halo [customer], perbaikan gangguan jaringan pada [area] telah selesai dan layanan Anda terpantau kembali terhubung. Terima kasih atas kesabarannya. Jika masih ada kendala, silakan hubungi admin.',
  customerOutagePending:'Halo [customer], perbaikan jaringan utama pada [area] telah selesai. Namun, layanan Anda masih memerlukan pemeriksaan lanjutan. Petugas tetap menindaklanjuti kendala Anda. Mohon maaf atas ketidaknyamanannya.',
  customerOutagePoweredOff:'Halo [customer], perbaikan jaringan pada [area] telah selesai. Modem Anda masih terpantau tidak mendapat daya. Silakan nyalakan modem dan hubungi admin jika koneksi belum kembali normal.'
});
const LABELS=Object.freeze({detected:'Gangguan ONU',resolved:'ONU - Penanganan Selesai',odpDetected:'Gangguan ODP',odpResolved:'ODP - Penanganan Selesai',odcDetected:'Gangguan ODC / PON',odcResolved:'ODC / PON - Penanganan Selesai',psbDetected:'Permintaan PSB',psbResolved:'PSB - Selesai',serviceDetected:'Permintaan / Laporan Pelanggan',serviceResolved:'Permintaan / Laporan - Selesai',customerOutageDetected:'Pelanggan - Gangguan Massal',customerOutageResolved:'Pelanggan - Layanan Pulih',customerOutagePending:'Pelanggan - Penanganan Lanjutan',customerOutagePoweredOff:'Pelanggan - Modem Kehilangan Daya'});
function keyFor(ticket,kind){
  if(!['detected','resolved'].includes(kind))return kind;
  const suffix=kind==='detected'?'Detected':'Resolved';
  if(['staff-service','wifiku'].includes(ticket.source)&&ticket.scope==='service')return(ticket.category==='new-installation'?'psb':'service')+suffix;
  if(ticket.scope==='odp')return'odp'+suffix;
  if(['pon','odc'].includes(ticket.scope))return'odc'+suffix;
  return kind;
}
function render(template,values){return template.replace(/\[([a-z_]+)\]/g,(all,key)=>Object.hasOwn(values,key)?String(values[key]??'').trim()||'-':all);}
module.exports={DEFAULTS,LABELS,keyFor,render};
